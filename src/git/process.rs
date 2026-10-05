//! Bounded, native Git utilities. This is not the long-lived execution supervisor.
use crate::model::{Effect, Fault, Result};
use std::io::{self, Read, Write};
use std::os::fd::{AsRawFd, RawFd};
use std::os::unix::process::CommandExt;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

pub(super) const OUTPUT_LIMIT: usize = super::capacity::METADATA_BYTES;

pub(crate) struct Output {
    pub status: ExitStatus,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

fn uncertain(code: &str) -> Fault {
    Fault {
        effect: Effect::Unknown,
        ..Fault::new(code)
    }
}

struct OwnedGroup {
    child: Child,
    reaped: bool,
}

impl Drop for OwnedGroup {
    fn drop(&mut self) {
        if !self.reaped {
            // SAFETY: the child was spawned into its own process group. No borrowed
            // pointers; the negative PID addresses only that owned group.
            unsafe { libc::kill(-(self.child.id() as libc::pid_t), libc::SIGKILL) };
            let _ = self.child.wait();
        }
    }
}

fn nonblocking(fd: RawFd) -> Result<()> {
    // SAFETY: fd belongs to a live, exclusively owned child pipe. F_GETFL takes
    // no third argument; F_SETFL's third argument is an integer flag mask.
    let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
    if flags < 0 || unsafe { libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) } < 0 {
        return Err(uncertain("UTILITY_IO"));
    }
    Ok(())
}

/// Feed stdin and drain both outputs together, including when input exceeds pipe
/// capacity. Every exit closes pipes; deadline/overflow/error kills and reaps the
/// owned utility group. There are no detached reader/writer threads to leak.
pub(crate) fn run(
    command: &mut Command,
    input: &[u8],
    timeout: Duration,
    limit: usize,
    check: bool,
) -> Result<Output> {
    let mut stdout = Vec::new();
    let mut output = run_io(command, input, None, timeout, limit, check, &mut stdout)?;
    output.stdout = stdout;
    Ok(output)
}

/// File input and a bounded streaming sink keep source bytes out of utility buffers.
pub(crate) fn stream(
    command: &mut Command,
    input_file: Option<std::fs::File>,
    timeout: Duration,
    limit: usize,
    check: bool,
    sink: &mut dyn Write,
) -> Result<Output> {
    run_io(command, &[], input_file, timeout, limit, check, sink)
}

fn run_io(
    command: &mut Command,
    input: &[u8],
    input_file: Option<std::fs::File>,
    timeout: Duration,
    limit: usize,
    check: bool,
    sink: &mut dyn Write,
) -> Result<Output> {
    let streamed = input_file.is_some() || limit > OUTPUT_LIMIT;
    let child = command
        .process_group(0)
        .stdin(input_file.map_or_else(Stdio::piped, Stdio::from))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| Fault::new("EXECUTABLE_UNAVAILABLE"))?;
    let mut group = OwnedGroup {
        child,
        reaped: false,
    };
    let mut stdin = group.child.stdin.take();
    let mut stdout = group.child.stdout.take();
    let mut stderr = group.child.stderr.take();
    for fd in stdin
        .iter()
        .map(AsRawFd::as_raw_fd)
        .chain(stdout.iter().map(AsRawFd::as_raw_fd))
        .chain(stderr.iter().map(AsRawFd::as_raw_fd))
    {
        nonblocking(fd)?;
    }
    let deadline = Instant::now() + timeout;
    let mut retained = 0usize;
    let mut err = Vec::new();
    let mut written = 0;
    let status = loop {
        if Instant::now() >= deadline {
            return Err(uncertain("TRANSPORT_TIMEOUT"));
        }
        if written == input.len() {
            stdin.take();
        }
        if let Some(pipe) = stdin.as_mut() {
            match pipe.write(&input[written..]) {
                Ok(0) => return Err(uncertain("UTILITY_IO")),
                Ok(n) => written += n,
                Err(e) if e.kind() == io::ErrorKind::BrokenPipe => {
                    stdin.take();
                }
                Err(e)
                    if matches!(
                        e.kind(),
                        io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
                    ) => {}
                Err(_) => return Err(uncertain("UTILITY_IO")),
            }
        }
        fn drain<T: Read>(
            pipe: &mut Option<T>,
            output: &mut dyn Write,
            count: &mut usize,
            limit: usize,
            budget: &str,
            configured: usize,
            other: usize,
        ) -> Result<()> {
            if let Some(reader) = pipe.as_mut() {
                let mut buffer = [0; 65536];
                // One bounded read per loop keeps all three pipes and the deadline fair.
                match reader.read(&mut buffer) {
                    Ok(0) => {
                        pipe.take();
                    }
                    Ok(n) => {
                        let observed = count.saturating_add(n);
                        if observed > limit {
                            return Err(Fault {
                                effect: Effect::Unknown,
                                ..Fault::message(
                                    "OUTPUT_LIMIT",
                                    format!(
                                        "budget={budget} configured={configured} observed={}",
                                        observed.saturating_add(other)
                                    ),
                                )
                            });
                        }
                        output
                            .write_all(&buffer[..n])
                            .map_err(|_| uncertain("UTILITY_IO"))?;
                        *count = observed;
                    }
                    Err(e)
                        if matches!(
                            e.kind(),
                            io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
                        ) => {}
                    Err(_) => return Err(uncertain("UTILITY_IO")),
                }
            }
            Ok(())
        }
        let stdout_limit = if streamed {
            limit
        } else {
            limit.saturating_sub(err.len())
        };
        drain(
            &mut stdout,
            sink,
            &mut retained,
            stdout_limit,
            if limit > OUTPUT_LIMIT {
                "utilityBodyBytes"
            } else {
                "utilityOutputBytes"
            },
            limit,
            if streamed { 0 } else { err.len() },
        )?;
        let stderr_limit = if streamed {
            OUTPUT_LIMIT
        } else {
            limit.saturating_sub(retained)
        };
        let mut error_count = err.len();
        drain(
            &mut stderr,
            &mut err,
            &mut error_count,
            stderr_limit,
            if streamed {
                "utilityDiagnosticBytes"
            } else {
                "utilityOutputBytes"
            },
            if streamed { OUTPUT_LIMIT } else { limit },
            if streamed { 0 } else { retained },
        )?;
        // Retain the unreaped PID until pipes close: deadline/error cleanup must
        // never signal a process group whose leader PID has become reusable.
        if stdout.is_none()
            && stderr.is_none()
            && let Some(status) = group
                .child
                .try_wait()
                .map_err(|_| uncertain("UTILITY_IO"))?
        {
            group.reaped = true;
            break status;
        }
        let mut polls = [
            libc::pollfd {
                fd: stdin.as_ref().map_or(-1, AsRawFd::as_raw_fd),
                events: libc::POLLOUT,
                revents: 0,
            },
            libc::pollfd {
                fd: stdout.as_ref().map_or(-1, AsRawFd::as_raw_fd),
                events: libc::POLLIN,
                revents: 0,
            },
            libc::pollfd {
                fd: stderr.as_ref().map_or(-1, AsRawFd::as_raw_fd),
                events: libc::POLLIN,
                revents: 0,
            },
        ];
        let millis = deadline
            .saturating_duration_since(Instant::now())
            .as_millis()
            .min(25) as i32;
        // SAFETY: polls is a live array of exactly three pollfd entries. poll only
        // reads/writes those entries and runs for the bounded remaining deadline.
        if unsafe { libc::poll(polls.as_mut_ptr(), polls.len() as libc::nfds_t, millis) } < 0
            && io::Error::last_os_error().kind() != io::ErrorKind::Interrupted
        {
            return Err(uncertain("UTILITY_IO"));
        }
    };
    if check && !status.success() {
        return Err(Fault::message(
            "COMMAND_FAILED",
            String::from_utf8_lossy(&err[..err.len().min(2048)]),
        ));
    }
    Ok(Output {
        status,
        stdout: Vec::new(),
        stderr: err,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn shell(code: &str) -> Command {
        let mut command = Command::new("sh");
        command.args(["-c", code]);
        command
    }

    #[test]
    fn large_input_and_both_outputs_are_drained_without_deadlock() {
        let data = vec![b'x'; 2 * 1024 * 1024];
        let output = run(
            &mut shell("cat; printf diagnostic >&2"),
            &data,
            Duration::from_secs(5),
            OUTPUT_LIMIT,
            true,
        )
        .unwrap();
        assert_eq!(output.stdout, data);
        assert_eq!(output.stderr, b"diagnostic");
    }

    #[test]
    fn overflow_kills_owned_group_and_waits_for_direct_child() {
        let error = run(
            &mut shell("while :; do printf 'output\n'; printf 'error\n' >&2; done"),
            &[],
            Duration::from_secs(5),
            1024,
            true,
        )
        .err()
        .unwrap();
        assert_eq!(error.code, "OUTPUT_LIMIT");
        assert_eq!(error.effect, Effect::Unknown);
    }

    #[test]
    fn combined_output_budget_reports_the_configured_total_and_observed_total() {
        let error = run(
            &mut shell("printf 12345678; printf 1234567890123456 >&2"),
            &[],
            Duration::from_secs(5),
            20,
            true,
        )
        .err()
        .unwrap();
        assert_eq!(
            error.message,
            "budget=utilityOutputBytes configured=20 observed=24"
        );
    }

    #[test]
    fn deadline_stops_descendant_holding_pipes_after_parent_exit() {
        let root = tempfile::tempdir().unwrap();
        let marker = root.path().join("escaped-effect");
        let mut command = Command::new("sh");
        command.args(["-c", "(sleep 1; printf escaped > \"$1\") &", "test"]);
        command.arg(&marker);
        let start = Instant::now();
        let error = run(
            &mut command,
            &[],
            Duration::from_millis(150),
            OUTPUT_LIMIT,
            true,
        )
        .err()
        .unwrap();
        assert_eq!(error.code, "TRANSPORT_TIMEOUT");
        assert!(start.elapsed() < Duration::from_secs(1));
        std::thread::sleep(Duration::from_millis(1200));
        assert!(
            !marker.exists(),
            "Owned descendant survived utility deadline"
        );
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
    }

    #[test]
    fn real_exit_and_bounded_failure_are_preserved() {
        let code = "printf complete; printf 'failure' >&2; exit 7";
        let output = run(
            &mut shell(code),
            &[],
            Duration::from_secs(2),
            OUTPUT_LIMIT,
            false,
        )
        .unwrap();
        assert_eq!(output.status.code(), Some(7));
        assert_eq!(output.stdout, b"complete");
        let error = run(
            &mut shell(code),
            &[],
            Duration::from_secs(2),
            OUTPUT_LIMIT,
            true,
        )
        .err()
        .unwrap();
        assert_eq!(error.code, "COMMAND_FAILED");
        assert_eq!(error.message, "failure");
        assert_eq!(error.effect, Effect::None);
    }

    #[test]
    fn closed_stdin_and_missing_executable_do_not_leak_a_writer() {
        let output = run(
            &mut shell("exit 0"),
            &vec![0; 2 * 1024 * 1024],
            Duration::from_secs(2),
            OUTPUT_LIMIT,
            true,
        )
        .unwrap();
        assert!(output.status.success());
        let error = run(
            &mut Command::new("/no-such-tdev-fixture-executable"),
            &[],
            Duration::from_secs(2),
            OUTPUT_LIMIT,
            true,
        )
        .err()
        .unwrap();
        assert_eq!(error.code, "EXECUTABLE_UNAVAILABLE");
        assert_eq!(error.effect, Effect::None);
    }
}
