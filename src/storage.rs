//! One SQLite owner, short transactions, and checked durable operation records.
use crate::identity::Value;
use crate::model::{
    Digest, Effect, Fault, Operation, OperationId, PrincipalId, RequestId, Result, Status,
};
use rusqlite::{
    Connection, OpenFlags, OptionalExtension, Transaction, TransactionBehavior, params,
};
use std::fs::{self, DirBuilder, File, OpenOptions, TryLockError};
use std::os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt};
use std::path::Path;

const COLUMNS: &str = "id,kind,task,status,effect,result,error";

fn database(error: rusqlite::Error) -> Fault {
    let _ = error;
    Fault::new("STORAGE")
}

fn io(error: std::io::Error) -> Fault {
    let _ = error;
    Fault::new("STATE_IO")
}

pub struct Admission {
    pub owner: PrincipalId,
    pub request: RequestId,
    pub fingerprint: Digest,
    pub operation: Operation,
    pub intent: Value,
}

pub enum Admitted {
    New(Operation),
    Replay(Operation),
}

// Fields drop in this order: close SQLite before releasing the controller lock.
pub struct Store {
    connection: Option<Connection>,
    _lock: File,
}

fn operation(row: &rusqlite::Row<'_>) -> rusqlite::Result<Operation> {
    fn parse<T: serde::de::DeserializeOwned>(text: &str) -> rusqlite::Result<T> {
        serde_json::from_str(text).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })
    }
    let quoted = |column| -> rusqlite::Result<String> {
        serde_json::to_string(&row.get::<_, String>(column)?)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))
    };
    let optional = |column| -> rusqlite::Result<Option<serde_json::Value>> {
        row.get::<_, Option<String>>(column)?
            .map(|s| parse(&s))
            .transpose()
    };
    Ok(Operation {
        id: parse(&quoted(0)?)?,
        kind: parse(&quoted(1)?)?,
        task: row
            .get::<_, Option<String>>(2)?
            .map(|s| parse(&serde_json::to_string(&s).unwrap()))
            .transpose()?,
        status: parse(&quoted(3)?)?,
        effect: parse(&quoted(4)?)?,
        result: optional(5)?,
        error: row
            .get::<_, Option<String>>(6)?
            .map(|s| parse(&s))
            .transpose()?,
    })
}

fn scalar<T: serde::Serialize>(value: &T) -> Result<String> {
    let encoded = serde_json::to_value(value).map_err(|_| Fault::new("STATE_FORMAT"))?;
    encoded
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| Fault::new("STATE_FORMAT"))
}

fn encoded<T: serde::Serialize>(value: &T) -> Result<String> {
    let json = serde_json::to_string(value).map_err(|_| Fault::new("STATE_FORMAT"))?;
    String::from_utf8(Value::parse(&json)?.canonical()?).map_err(|_| Fault::new("STATE_FORMAT"))
}

fn check_existing(connection: &Connection) -> Result<bool> {
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(database)?;
    if version == 0 {
        let tables: i64 = connection.query_row("SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [], |r| r.get(0)).map_err(database)?;
        if tables == 0 {
            return Ok(false);
        }
    }
    if !matches!(version, 3..=5) {
        return Err(Fault::new("SCHEMA_VERSION"));
    }
    let mut statement = connection
        .prepare(&format!(
            "SELECT {COLUMNS},owner,request,hash,intent FROM operation"
        ))
        .map_err(|_| Fault::new("STATE_FORMAT"))?;
    let mut rows = statement.query([]).map_err(database)?;
    while let Some(row) = rows.next().map_err(database)? {
        operation(row).map_err(|_| Fault::new("STATE_FORMAT"))?;
        let owner: String = row.get(7).map_err(|_| Fault::new("STATE_FORMAT"))?;
        PrincipalId::new(owner)?;
        let request: String = row.get(8).map_err(|_| Fault::new("STATE_FORMAT"))?;
        RequestId::new(request)?;
        let fingerprint: String = row.get(9).map_err(|_| Fault::new("STATE_FORMAT"))?;
        Digest::new(fingerprint)?;
        let intent: String = row.get(10).map_err(|_| Fault::new("STATE_FORMAT"))?;
        Value::parse(&intent).map_err(|_| Fault::new("STATE_FORMAT"))?;
    }
    Ok(true)
}

impl Store {
    fn connection(&self) -> &Connection {
        self.connection.as_ref().expect("Open store")
    }
    fn connection_mut(&mut self) -> &mut Connection {
        self.connection.as_mut().expect("Open store")
    }
    pub fn open(root: &Path) -> Result<Self> {
        DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(root)
            .map_err(io)?;
        let metadata = root.symlink_metadata().map_err(io)?;
        // SAFETY: getuid has no memory/pointer preconditions; no other syscalls here.
        let uid = unsafe { libc::getuid() };
        if !metadata.is_dir() || metadata.uid() != uid || metadata.mode() & 0o077 != 0 {
            return Err(Fault::new("STATE_PERMISSIONS"));
        }
        for name in [
            "controller.lock",
            "state.sqlite",
            "state.sqlite-wal",
            "state.sqlite-shm",
        ] {
            match root.join(name).symlink_metadata() {
                Ok(m) if m.file_type().is_symlink() => return Err(Fault::new("STATE_SYMLINK")),
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(io(e)),
                _ => {}
            }
        }
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_CLOEXEC)
            .open(root.join("controller.lock"))
            .map_err(io)?;
        match lock.try_lock() {
            Ok(()) => {}
            Err(TryLockError::WouldBlock) => return Err(Fault::new("CONTROLLER_BUSY")),
            Err(TryLockError::Error(e)) => return Err(io(e)),
        }
        let path = root.join("state.sqlite");
        let initialized = if path.exists() {
            // Inspect unsupported/malformed state before WAL/DDL or other writer changes.
            let reader = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)
                .map_err(database)?;
            check_existing(&reader)?
        } else {
            false
        };
        let mut connection = Connection::open(&path).map_err(database)?;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).map_err(io)?;
        connection
            .busy_timeout(std::time::Duration::from_secs(5))
            .map_err(database)?;
        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(database)?;
        connection
            .pragma_update(None, "synchronous", "FULL")
            .map_err(database)?;
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .map_err(database)?;
        if !initialized {
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(database)?;
            transaction
                .execute_batch(include_str!("storage/schema.sql"))
                .map_err(database)?;
            transaction.commit().map_err(database)?;
        }
        Ok(Self {
            connection: Some(connection),
            _lock: lock,
        })
    }

    /// No filesystem, subprocess or network waits belong inside this closure.
    pub fn transaction<T>(
        &mut self,
        apply: impl FnOnce(&Transaction<'_>) -> Result<T>,
    ) -> Result<T> {
        let transaction = self
            .connection_mut()
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(database)?;
        let result = apply(&transaction)?;
        transaction.commit().map_err(database)?;
        Ok(result)
    }

    pub fn lookup(&self, owner: &PrincipalId, request: &RequestId) -> Result<Option<Operation>> {
        self.connection()
            .query_row(
                &format!("SELECT {COLUMNS} FROM operation WHERE owner=? AND request=?"),
                params![owner.as_str(), request.as_str()],
                operation,
            )
            .optional()
            .map_err(|_| Fault::new("STATE_FORMAT"))
    }

    /// Replay precedes feature CAS; fresh authorization is the caller's admission context.
    pub fn admit(
        &mut self,
        admission: &Admission,
        reserve: impl FnOnce(&Transaction<'_>) -> Result<()>,
    ) -> Result<Admitted> {
        self.transaction(|db| {
            let existing: Option<(String, Operation)> = db.query_row(&format!("SELECT {COLUMNS},hash FROM operation WHERE owner=? AND request=?"),
                params![admission.owner.as_str(), admission.request.as_str()], |row| Ok((row.get(7)?, operation(row)?)))
                .optional().map_err(|_| Fault::new("STATE_FORMAT"))?;
            if let Some((fingerprint, operation)) = existing {
                if fingerprint != admission.fingerprint.as_str() { return Err(Fault::new("IDEMPOTENCY_MISMATCH")); }
                return Ok(Admitted::Replay(operation));
            }
            let op = &admission.operation;
            if op.status != Status::Running || op.effect != Effect::None || op.result.is_some() || op.error.is_some() {
                return Err(Fault::new("OPERATION_STATE"));
            }
            let intent = String::from_utf8(admission.intent.canonical()?).map_err(|_| Fault::new("STATE_FORMAT"))?;
            db.execute("INSERT INTO operation(id,owner,request,hash,kind,task,status,effect,intent) VALUES(?,?,?,?,?,?,?,?,?)",
                params![op.id.as_str(), admission.owner.as_str(), admission.request.as_str(), admission.fingerprint.as_str(),
                    scalar(&op.kind)?, op.task.as_ref().map(|t| t.as_str()), scalar(&op.status)?, scalar(&op.effect)?, intent]).map_err(database)?;
            reserve(db)?;
            Ok(Admitted::New(op.clone()))
        })
    }

    pub fn finish(
        &mut self,
        id: &OperationId,
        status: Status,
        effect: Effect,
        result: serde_json::Value,
        error: Option<Fault>,
        apply: impl FnOnce(&Transaction<'_>, &Operation) -> Result<()>,
    ) -> Result<Operation> {
        if !status.is_terminal() {
            return Err(Fault::new("OPERATION_STATE"));
        }
        self.transaction(|db| {
            let old = db
                .query_row(
                    &format!("SELECT {COLUMNS} FROM operation WHERE id=?"),
                    [id.as_str()],
                    operation,
                )
                .optional()
                .map_err(|_| Fault::new("STATE_FORMAT"))?
                .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?;
            if old.status.is_terminal() {
                return Ok(old);
            }
            apply(db, &old)?;
            db.execute(
                "UPDATE operation SET status=?,effect=?,result=?,error=? WHERE id=?",
                params![
                    scalar(&status)?,
                    scalar(&effect)?,
                    encoded(&result)?,
                    error.as_ref().map(encoded).transpose()?,
                    id.as_str()
                ],
            )
            .map_err(database)?;
            Ok(Operation {
                status,
                effect,
                result: Some(result),
                error,
                ..old
            })
        })
    }
}

impl Drop for Store {
    fn drop(&mut self) {
        // Close SQLite before unlock; forked children cannot prolong ownership after close.
        drop(self.connection.take());
        let _ = self._lock.unlock();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::OperationKind;
    use std::process::Command;

    fn admission() -> Admission {
        let intent = Value::parse(r#"{"input":{"requestId":"request","text":"한글"}}"#).unwrap();
        Admission {
            owner: PrincipalId::new("alice").unwrap(),
            request: RequestId::new("request").unwrap(),
            fingerprint: intent.fingerprint().unwrap(),
            intent,
            operation: Operation {
                id: OperationId::new("op").unwrap(),
                kind: OperationKind::Task,
                task: None,
                status: Status::Running,
                effect: Effect::None,
                result: None,
                error: None,
            },
        }
    }

    #[test]
    fn one_owner_and_durable_scope_replay_before_feature_cas() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("state");
        let mut store = Store::open(&root).unwrap();
        assert_eq!(Store::open(&root).err().unwrap().code, "CONTROLLER_BUSY");
        let mut a = admission();
        assert!(matches!(
            store.admit(&a, |_| Ok(())).unwrap(),
            Admitted::New(_)
        ));
        a.operation.id = OperationId::new("duplicate-proposal").unwrap();
        assert!(
            matches!(store.admit(&a, |_| panic!("Replay must precede a now-stale reservation")).unwrap(), Admitted::Replay(op) if op.id.as_str() == "op")
        );
        drop(store);
        let mut store = Store::open(&root).unwrap();
        assert!(matches!(
            store
                .admit(&a, |_| panic!("No second reservation after restart"))
                .unwrap(),
            Admitted::Replay(_)
        ));
        a.fingerprint = Digest::new("a".repeat(64)).unwrap();
        assert_eq!(
            store.admit(&a, |_| Ok(())).err().unwrap().code,
            "IDEMPOTENCY_MISMATCH"
        );
        a.owner = PrincipalId::new("한글 principal").unwrap();
        assert!(matches!(
            store.admit(&a, |_| Ok(())).unwrap(),
            Admitted::New(_)
        ));
    }

    #[test]
    fn failed_reservation_rolls_back_admission_and_owned_changes() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("state");
        let mut store = Store::open(&root).unwrap();
        let a = admission();
        let result = store.admit(&a, |db| {
            db.execute(
                "INSERT INTO workspace(id,owner,name) VALUES('w','alice','test')",
                [],
            )
            .map_err(database)?;
            Err(Fault::new("STALE_CHECKPOINT"))
        });
        assert_eq!(result.err().unwrap().code, "STALE_CHECKPOINT");
        assert!(store.lookup(&a.owner, &a.request).unwrap().is_none());
        let count: i64 = store
            .connection()
            .query_row("SELECT count(*) FROM workspace", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
        drop(store);
        assert!(
            Store::open(&root)
                .unwrap()
                .lookup(&a.owner, &a.request)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn completion_joins_owned_changes_and_late_writes_cannot_regress_terminal() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("state");
        let mut store = Store::open(&root).unwrap();
        let a = admission();
        store.admit(&a, |_| Ok(())).unwrap();
        let result = serde_json::json!({"exitCode": 7, "stopped": true});
        assert!(
            store
                .finish(
                    &a.operation.id,
                    Status::Failed,
                    Effect::Committed,
                    result.clone(),
                    None,
                    |db, _| {
                        db.execute(
                            "INSERT INTO workspace(id,owner,name) VALUES('w','alice','test')",
                            [],
                        )
                        .map_err(database)?;
                        Err(Fault::new("WRITER_CHANGED"))
                    }
                )
                .is_err()
        );
        assert_eq!(
            store.lookup(&a.owner, &a.request).unwrap().unwrap().status,
            Status::Running
        );
        let terminal = store
            .finish(
                &a.operation.id,
                Status::Failed,
                Effect::Committed,
                result,
                None,
                |db, _| {
                    db.execute(
                        "INSERT INTO workspace(id,owner,name) VALUES('w','alice','test')",
                        [],
                    )
                    .map_err(database)?;
                    Ok(())
                },
            )
            .unwrap();
        let late = store
            .finish(
                &a.operation.id,
                Status::Succeeded,
                Effect::None,
                serde_json::json!({}),
                None,
                |_, _| panic!("Terminal pointer/result must stay unchanged"),
            )
            .unwrap();
        assert_eq!(late, terminal);
        drop(store);
        assert_eq!(
            Store::open(&root)
                .unwrap()
                .lookup(&a.owner, &a.request)
                .unwrap()
                .unwrap(),
            terminal
        );
    }

    #[test]
    fn unsupported_and_corrupt_records_fail_before_database_writes() {
        for corrupt in [
            "PRAGMA user_version=99",
            "UPDATE operation SET status='retry'",
            "UPDATE operation SET intent='{'",
            "UPDATE operation SET hash='bad'",
        ] {
            let temp = tempfile::tempdir().unwrap();
            let root = temp.path().join("state");
            let mut store = Store::open(&root).unwrap();
            store.admit(&admission(), |_| Ok(())).unwrap();
            store.connection().execute_batch(corrupt).unwrap();
            drop(store);
            let before = fs::read(root.join("state.sqlite")).unwrap();
            assert!(Store::open(&root).is_err(), "{corrupt}");
            assert_eq!(
                fs::read(root.join("state.sqlite")).unwrap(),
                before,
                "{corrupt}"
            );
        }
    }

    #[test]
    fn empty_initialization_is_recoverable_but_unknown_zero_format_is_preserved() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("state");
        fs::create_dir(&root).unwrap();
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
        Connection::open(root.join("state.sqlite"))
            .unwrap()
            .close()
            .unwrap();
        drop(Store::open(&root).unwrap());
        let unknown = temp.path().join("unknown");
        fs::create_dir(&unknown).unwrap();
        fs::set_permissions(&unknown, fs::Permissions::from_mode(0o700)).unwrap();
        let db = Connection::open(unknown.join("state.sqlite")).unwrap();
        db.execute_batch(
            "CREATE TABLE valuable_data(value TEXT); INSERT INTO valuable_data VALUES('keep')",
        )
        .unwrap();
        drop(db);
        let before = fs::read(unknown.join("state.sqlite")).unwrap();
        assert_eq!(Store::open(&unknown).err().unwrap().code, "SCHEMA_VERSION");
        assert_eq!(fs::read(unknown.join("state.sqlite")).unwrap(), before);
    }

    #[test]
    fn symlinks_and_public_state_are_not_admitted() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("state");
        fs::create_dir(&root).unwrap();
        fs::set_permissions(&root, fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(Store::open(&root).err().unwrap().code, "STATE_PERMISSIONS");
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
        let foreign = temp.path().join("foreign");
        fs::write(&foreign, "keep").unwrap();
        std::os::unix::fs::symlink(&foreign, root.join("state.sqlite")).unwrap();
        assert_eq!(Store::open(&root).err().unwrap().code, "STATE_SYMLINK");
        assert_eq!(fs::read_to_string(foreign).unwrap(), "keep");
    }

    #[test]
    fn reference_reader_and_writer_share_the_same_lock_and_receipt_formats() {
        for version in [3, 4, 5] {
            let temp = tempfile::tempdir().unwrap();
            let root = temp.path().join("state");
            let mut store = Store::open(&root).unwrap();
            let a = admission();
            store.admit(&a, |_| Ok(())).unwrap();
            let terminal = store
                .finish(
                    &a.operation.id,
                    Status::Succeeded,
                    Effect::Committed,
                    serde_json::json!({"closed": true}),
                    None,
                    |_, _| Ok(()),
                )
                .unwrap();
            store
                .connection()
                .pragma_update(None, "user_version", version)
                .unwrap();
            let source = Path::new(env!("CARGO_MANIFEST_DIR"));
            let python = |script: &str| {
                Command::new("python")
                    .args(["-c", script])
                    .arg(&root)
                    .env("PYTHONPATH", source.join("src"))
                    .output()
                    .unwrap()
            };
            let held = python(
                "import sys; from tdev.store import Store; from tdev.common import Fault\ntry: Store(sys.argv[1])\nexcept Fault as e: assert e.value['code']=='CONTROLLER_BUSY'\nelse: raise AssertionError('Second writer admitted')",
            );
            assert!(
                held.status.success(),
                "{}",
                String::from_utf8_lossy(&held.stderr)
            );
            drop(store);
            let readback = python(
                "import sys,json; from tdev.store import Store\ns=Store(sys.argv[1]); row=s.one(\"SELECT * FROM operation WHERE id='op'\"); assert row['status']=='succeeded'; assert json.loads(row['result'])=={'closed':True}; s.close()",
            );
            assert!(
                readback.status.success(),
                "{}",
                String::from_utf8_lossy(&readback.stderr)
            );
            assert_eq!(
                Store::open(&root)
                    .unwrap()
                    .lookup(&a.owner, &a.request)
                    .unwrap()
                    .unwrap(),
                terminal
            );
        }
    }
}
