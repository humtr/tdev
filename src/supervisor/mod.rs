//! Independent execution evidence. Admission and source capture belong to the controller.
//!
//! A reserved dispatch is never relaunched. A missing worker or stop proof is uncertainty,
//! not permission to start another command. This module is not a public wire contract.
mod platform;
mod spool;

pub use platform::ProcessIdentity;
pub use spool::{Job, Observation, Outcome, Report, Request};

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
    let mut log = job.create_log()?;
    let mut output = Output::default();
    if job.cancelled()? {
        log.sync_all()?;
        return job.complete(Report {
            worker,
            digest: job.digest()?,
            outcome: Outcome::Cancelled,
            exit_code: None,
            stopped: true,
            retained_bytes: 0,
            discarded_bytes: 0,
        });
    }
    let (mut reader, writer) = UnixStream::pair()?;
    reader.set_nonblocking(true)?;
    let stdout: OwnedFd = writer.into();
    let stderr = stdout.try_clone()?;
    let shell = job.shell()?;
    let mut command = Command::new(&shell);
    command
        .args(["-c", &request.command])
        .current_dir(job.cwd(&request)?)
        .env_clear()
        .envs(platform::environment(job.path(), &shell)?)
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    platform::child_limits(&mut command, request.working_bytes, request.timeout_seconds);
    // Once this record exists, even an exec failure cannot justify another dispatch.
    job.record_child_dispatch()?;
    let mut child = command.spawn()?;
    // Command retains its Stdio handles; release these before waiting for pipe EOF.
    drop(command);
    let result = supervise(
        job,
        &request,
        &worker,
        &mut child,
        &mut reader,
        &mut log,
        &mut output,
    );
    // Every error path attempts exact descendant cleanup. Failed persistence/cleanup leaves
    // the reservation unknown; it cannot manufacture a completed operation.
    if result.is_err() {
        let _ = platform::stop_children(&mut child);
    }
    result
}

fn supervise(
    job: &Job,
    request: &Request,
    worker: &ProcessIdentity,
    child: &mut Child,
    reader: &mut UnixStream,
    log: &mut File,
    output: &mut Output,
) -> io::Result<()> {
    job.record_child(
        &platform::identity(child.id())?
            .ok_or_else(|| io::Error::other("Child identity unavailable after dispatch"))?,
    )?;
    let started = Instant::now();
    let mut sampled = started;
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
        if let Some(status) = child.try_wait()? {
            break (Outcome::Exited, Some(status));
        }
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
    if outcome == Outcome::Exited && !job.within_budget(request.working_bytes)? {
        outcome = Outcome::WorkingBudget;
    }
    log.sync_all()?;
    job.complete(Report {
        worker: worker.clone(),
        digest: job.digest()?,
        outcome,
        exit_code: status.and_then(|s| s.code()),
        stopped,
        retained_bytes: output.retained,
        discarded_bytes: output.discarded,
    })
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
