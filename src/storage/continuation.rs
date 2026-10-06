//! Bounded ledger projections; source bodies, logs and execution environments stay private.
use super::*;
use crate::model::TaskId;
use crate::storage::source::Receipt;
use serde_json::Value as Json;

pub struct Retained {
    pub cursor: u64,
    pub repo: Option<String>,
    pub receipt: Receipt,
}

// Only authority and human-locator fields are needed. Do not decode whole execution
// intent, tooling environment, stdin, source manifest or result for a find response.
const PROJECTION: &str = "id,kind,task,status,effect,NULL,NULL,request,repo,rowid,\
json_object('construction',json_extract(intent,'$.construction'),\
'identity',json_extract(intent,'$.identity'),\
'authority',json_extract(intent,'$.authority'),\
'workspaceId',json_extract(intent,'$.workspaceId'),\
'resolved',json_extract(intent,'$.resolved'),\
'integrationSource',json_extract(intent,'$.integrationSource'),\
'input',json_object('action',json_extract(intent,'$.input.action'),\
'label',json_extract(intent,'$.input.label'),\
'expected',json_extract(intent,'$.input.expected'),\
'repo',json_extract(intent,'$.input.repo'),'ref',json_extract(intent,'$.input.ref'),\
'workspaceId',json_extract(intent,'$.input.workspaceId'),\
'policy',json_extract(intent,'$.input.policy'),'name',json_extract(intent,'$.input.name'),\
'fromTaskId',json_extract(intent,'$.input.fromTaskId'),\
'localChanges',json(CASE WHEN json_extract(intent,'$.input.localChanges') THEN 'true' ELSE 'false' END),\
'sources',json_extract(intent,'$.input.sources')))";

fn retained(row: &rusqlite::Row<'_>) -> rusqlite::Result<Retained> {
    let intent: String = row.get(10)?;
    Ok(Retained {
        cursor: row.get::<_, i64>(9)? as u64,
        repo: row.get(8)?,
        receipt: Receipt {
            operation: operation(row)?,
            hash: String::new(),
            intent: serde_json::from_str::<Json>(&intent).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    10,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })?,
            request: row.get(7)?,
        },
    })
}

impl Store {
    pub fn continuation_entries(&self, owner: &PrincipalId, after: u64) -> Result<Vec<Retained>> {
        let sql = format!(
            "SELECT {PROJECTION} FROM operation WHERE owner=? AND rowid>? AND (\
(kind='task' AND json_extract(intent,'$.input.action') IN ('start','open','compose') \
AND (task IS NOT NULL OR status IN ('running','unknown'))) OR \
(kind='project' AND status IN ('running','unknown'))) ORDER BY rowid LIMIT 201"
        );
        let mut stmt = self.connection().prepare(&sql).map_err(database)?;
        stmt.query_map(
            params![
                owner.as_str(),
                i64::try_from(after).map_err(|_| Fault::new("SCHEMA"))?
            ],
            retained,
        )
        .map_err(database)?
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|_| Fault::new("STATE_FORMAT"))
    }

    pub fn continuation_receipts(
        &self,
        owner: &PrincipalId,
        task: &TaskId,
        outstanding: bool,
    ) -> Result<Vec<Retained>> {
        let filter = if outstanding {
            "AND status IN ('running','unknown') ORDER BY rowid LIMIT 41"
        } else {
            "ORDER BY rowid DESC LIMIT 9"
        };
        let mut stmt = self
            .connection()
            .prepare(&format!(
                "SELECT {PROJECTION} FROM operation WHERE owner=? AND task=? {filter}"
            ))
            .map_err(database)?;
        stmt.query_map(params![owner.as_str(), task.as_str()], retained)
            .map_err(database)?
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|_| Fault::new("STATE_FORMAT"))
    }
}
