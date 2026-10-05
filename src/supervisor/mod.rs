//! Independent execution, stop and source capture evidence. The controller owns admission
//! and checkpoint completion.
//!
//! A reserved dispatch is never relaunched. A missing worker or stop proof is uncertainty,
//! not permission to start another command. This module is not a public wire contract.
mod environment;
mod input;
mod platform;
pub(crate) mod source;
mod spool;

pub use environment::{DEPENDENCY_LIMIT, Environment, ExclusiveEnvironment};
pub use input::{Delivery, Input, InputReceipt};
pub use platform::ProcessIdentity;
pub use source::{Capture, Manifest, Pack, Source, SourceFile};
pub(crate) use spool::validate_env;
pub(crate) use spool::{Bound, lock_file};
pub use spool::{Budget, Job, Observation, Outcome, Report, Request};

use environment::SharedEnvironment;
use input::InputPump;
use std::fs::File;
use std::io::{self, Read, Write};
use std::os::fd::OwnedFd;
use std::os::unix::net::UnixStream;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

pub const OUTPUT_LIMIT: u64 = 1024 * 1024;

/// Run only in the independent process role, never in a controller thread.
pub fn run(path: &Path) -> io::Result<()> {
    let job = Job::open(path)?;
    let result = run_job(&job);
    if let Err(error) = &result {
        let _ = job.record_failure(error);
    }
    result
}

fn run_job(job: &Job) -> io::Result<()> {
    let Some(worker) = job.claim()? else {
        return Ok(());
    };
    platform::initialize()?;
    let request = job.request()?;
    source::verify_input(job)?;
    let mut log = job.create_log()?;
    if job.cancelled()? {
        return no_child(job, worker, Outcome::Cancelled, &mut log);
    }
    let dependencies = match request
        .environment
        .as_ref()
        .map(Environment::shared)
        .transpose()
    {
        Ok(dependencies) => dependencies,
        Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
            return no_child(job, worker, Outcome::EnvironmentBusy, &mut log);
        }
        Err(error) => return Err(error),
    };
    if dependencies
        .as_ref()
        .map(|environment| environment.within_budget(job))
        .transpose()?
        == Some(false)
    {
        return no_child(job, worker, Outcome::DependencyBudget, &mut log);
    }
    if !job.within_budget(request.working_bytes)? {
        return no_child(job, worker, Outcome::WorkingBudget, &mut log);
    }
    let (reader, writer) = UnixStream::pair()?;
    reader.set_nonblocking(true)?;
    let stdout: OwnedFd = writer.into();
    let stderr = stdout.try_clone()?;
    let shell = job.shell()?;
    let mut env = platform::environment(job.path(), &shell, None)?;
    env.extend(request.env.clone());
    if let Some(dependencies) = dependencies.as_ref() {
        let selected = platform::environment(job.path(), &shell, Some(dependencies.path()))?;
        let base_path = env.get("PATH").expect("Native PATH");
        let path = std::env::join_paths(
            [
                dependencies.path().join("venv/bin"),
                dependencies.path().join("bin"),
            ]
            .into_iter()
            .chain(std::env::split_paths(base_path)),
        )
        .map_err(io::Error::other)?;
        env.insert(
            "PATH".into(),
            path.into_string()
                .map_err(|_| io::Error::other("Invalid PATH"))?,
        );
        for key in [
            "TDEV_ENV_DIR",
            "PIP_CACHE_DIR",
            "npm_config_cache",
            "XDG_CACHE_HOME",
        ] {
            env.insert(key.into(), selected[key].clone());
        }
    }
    let mut command = Command::new(&shell);
    command
        .args(["-c", &request.command])
        .current_dir(job.cwd(&request)?)
        .env_clear()
        .envs(env)
        .stdin(Stdio::piped())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    platform::child_limits(&mut command, request.working_bytes, request.timeout_seconds);
    // Once this record exists, even an exec failure cannot justify another dispatch.
    job.record_child_dispatch()?;
    let started = Instant::now();
    let child = command.spawn()?;
    // Command retains its Stdio handles; release these before waiting for pipe EOF.
    drop(command);
    let mut session = Session {
        child,
        reader,
        log,
        input: None,
        output: Output::default(),
        started,
    };
    let result = session.supervise(job, &request, &worker, dependencies.as_ref());
    // Every error path attempts exact descendant cleanup. Failed persistence/cleanup leaves
    // the reservation unknown; it cannot manufacture a completed operation.
    if result.is_err() {
        let _ = platform::stop_children(&mut session.child);
    }
    result
}

fn no_child(
    job: &Job,
    worker: ProcessIdentity,
    outcome: Outcome,
    log: &mut File,
) -> io::Result<()> {
    log.sync_all()?;
    job.complete(Report {
        worker,
        digest: job.digest()?,
        outcome,
        exit_code: None,
        stopped: true,
        retained_bytes: 0,
        discarded_bytes: 0,
        budget: None,
        capture: None,
    })
}

struct Session {
    child: Child,
    reader: UnixStream,
    log: File,
    input: Option<InputPump>,
    output: Output,
    started: Instant,
}

impl Session {
    fn supervise(
        &mut self,
        job: &Job,
        request: &Request,
        worker: &ProcessIdentity,
        dependencies: Option<&SharedEnvironment>,
    ) -> io::Result<()> {
        let child = &mut self.child;
        let reader = &mut self.reader;
        let log = &mut self.log;
        let output = &mut self.output;
        job.record_child(
            &platform::identity(child.id())?
                .ok_or_else(|| io::Error::other("Child identity unavailable after dispatch"))?,
        )?;
        self.input = Some(InputPump::new(
            child
                .stdin
                .take()
                .ok_or_else(|| io::Error::other("Missing input pipe"))?,
            request.stdin.clone(),
            worker.clone(),
            job.digest()?,
        )?);
        let started = self.started;
        let mut sampled = started;
        let mut sampled_dependencies = started;
        let (mut outcome, mut status) = loop {
            output.drain(reader, log)?;
            if job.cancelled()? {
                break (Outcome::Cancelled, child.try_wait()?);
            }
            if request
                .timeout_seconds
                .is_some_and(|seconds| started.elapsed() >= Duration::from_secs(seconds))
            {
                break (Outcome::Deadline, child.try_wait()?);
            }
            if sampled.elapsed() >= Duration::from_millis(250) {
                sampled = Instant::now();
                if !job.within_budget(request.working_bytes)? {
                    break (Outcome::WorkingBudget, child.try_wait()?);
                }
            }
            if sampled_dependencies.elapsed() >= Duration::from_secs(5) {
                sampled_dependencies = Instant::now();
                if dependencies
                    .map(|environment| environment.within_budget(job))
                    .transpose()?
                    == Some(false)
                {
                    break (Outcome::DependencyBudget, child.try_wait()?);
                }
            }
            if let Some(status) = child.try_wait()? {
                break (Outcome::Exited, Some(status));
            }
            self.input
                .as_mut()
                .expect("Initialized input pump")
                .step(job)?;
            std::thread::sleep(Duration::from_millis(10));
        };
        let stopped = platform::stop_children(child)?;
        if status.is_none() {
            status = child.try_wait()?;
        }
        // Stop proof precedes final bytes/budget evidence and owned source capture.
        let drain_deadline = Instant::now() + Duration::from_secs(1);
        loop {
            if output.drain(reader, log)? {
                break;
            }
            if Instant::now() >= drain_deadline {
                return Err(io::Error::other("Output closure not proved"));
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        let working_ok = job.within_budget(request.working_bytes)?;
        let dependencies_ok = dependencies
            .map(|environment| environment.within_budget(job))
            .transpose()?
            .unwrap_or(true);
        if outcome == Outcome::Exited {
            if !working_ok {
                outcome = Outcome::WorkingBudget;
            }
            if !dependencies_ok {
                outcome = Outcome::DependencyBudget;
            }
        }
        log.sync_all()?;
        let capture = if stopped && request.capture {
            source::capture(job)?
        } else {
            None
        };
        job.complete(Report {
            worker: worker.clone(),
            digest: job.digest()?,
            outcome,
            exit_code: status.and_then(|s| s.code()),
            stopped,
            retained_bytes: output.retained,
            discarded_bytes: output.discarded,
            budget: None,
            capture,
        })
    }
}

#[derive(Default)]
struct Output {
    retained: u64,
    discarded: u64,
}

impl Output {
    /// Bounded work per turn keeps an infinite writer from starving cancel/deadline checks.
    fn drain(&mut self, reader: &mut UnixStream, log: &mut File) -> io::Result<bool> {
        let mut buffer = [0; 65536];
        for _ in 0..8 {
            match reader.read(&mut buffer) {
                Ok(0) => return Ok(true),
                Ok(size) => {
                    let keep = size.min((OUTPUT_LIMIT - self.retained) as usize);
                    log.write_all(&buffer[..keep])?;
                    self.retained += keep as u64;
                    self.discarded = self.discarded.saturating_add((size - keep) as u64);
                }
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => return Ok(false),
                Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                Err(error) => return Err(error),
            }
        }
        Ok(false)
    }
}
