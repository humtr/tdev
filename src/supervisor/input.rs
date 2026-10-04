//! Ordered input intent and pipe acceptance are separate durable observations.
use super::spool::{Bound, fingerprint, lock_file};
use super::{Job, Observation, ProcessIdentity};
use crate::model::{Digest, RequestId};
use serde::{Deserialize, Serialize};
use std::fs::TryLockError;
use std::io::{self, Write};
use std::process::ChildStdin;

const INPUT_COUNT: u16 = 1024;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Input {
    pub request_id: RequestId,
    pub sequence: u16,
    pub text: String,
    pub eof: bool,
}

impl Input {
    fn validate(&self) -> io::Result<()> {
        if self.sequence >= INPUT_COUNT || self.text.chars().count() > 65536 {
            return Err(io::Error::other("Invalid stdin sequence or text bound"));
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Delivery {
    Queued,
    Unknown,
    Committed,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InputReceipt {
    pub sequence: u16,
    pub next_sequence: u16,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Queued {
    digest: Digest,
    input: Input,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Attempt {
    worker: ProcessIdentity,
    delivery: Delivery,
}

impl Job {
    /// A stable acceptance receipt. Replays do not append or touch the input pipe.
    pub fn enqueue(&self, input: Input) -> io::Result<InputReceipt> {
        input.validate()?;
        let lock = lock_file(&self.path().join("input.lock"))?;
        match lock.try_lock() {
            Ok(()) => {}
            Err(TryLockError::WouldBlock) => {
                return Err(io::Error::new(
                    io::ErrorKind::WouldBlock,
                    "Input admission is busy",
                ));
            }
            Err(TryLockError::Error(error)) => return Err(error),
        }
        let mut next = 0;
        let mut eof = false;
        let mut missing = false;
        let reservation = self.digest()?;
        // No second control-ID owner/index. This bounded scan also detects a corrupt gap
        // instead of silently repairing it and possibly delivering another copy.
        for sequence in 0..INPUT_COUNT {
            match self.queued(sequence, &reservation)? {
                Some(queued) => {
                    if missing {
                        return Err(io::Error::other("Incomplete stdin reservation prefix"));
                    }
                    if eof {
                        return Err(io::Error::other("Stdin reservation follows EOF"));
                    }
                    if queued.input.request_id == input.request_id {
                        if queued.input != input {
                            return Err(io::Error::other("Stdin request identity conflict"));
                        }
                        return Ok(receipt(input.sequence));
                    }
                    next = sequence + 1;
                    eof = queued.input.eof;
                }
                None => missing = true,
            }
        }
        if input.sequence != next {
            return Err(io::Error::other(
                "Stdin sequence is already reserved or skips input",
            ));
        }
        if eof {
            return Err(io::Error::other("Stdin EOF is already reserved"));
        }
        match self.observe()? {
            Observation::Reserved | Observation::Running(_) => {}
            Observation::Complete(_) => return Err(io::Error::other("Process is terminal")),
            Observation::Unknown => return Err(io::Error::other("Supervisor evidence is unknown")),
        }
        let queued = Queued {
            digest: fingerprint(&(&reservation, &input))?,
            input,
        };
        self.atomic(&format!("stdin-{next}.json"), &queued)?;
        Ok(receipt(next))
    }

    pub fn input_delivery(&self, sequence: u16) -> io::Result<Option<Delivery>> {
        let Some(queued) = self.queued(sequence, &self.digest()?)? else {
            return Ok(None);
        };
        Ok(Some(self.delivery(
            &format!("delivery-{sequence}.json"),
            &queued.digest,
        )?))
    }

    pub fn initial_delivery(&self) -> io::Result<Delivery> {
        if self.request()?.stdin.is_empty() {
            return Ok(Delivery::Committed);
        }
        self.delivery("delivery-initial.json", &self.initial_digest()?)
    }

    fn initial_digest(&self) -> io::Result<Digest> {
        fingerprint(&(self.digest()?, "initial", self.request()?.stdin))
    }

    fn queued(&self, sequence: u16, reservation: &Digest) -> io::Result<Option<Queued>> {
        if sequence >= INPUT_COUNT {
            return Ok(None);
        }
        match self.read::<Queued>(&format!("stdin-{sequence}.json")) {
            Ok(queued) => {
                queued.input.validate()?;
                if queued.input.sequence != sequence
                    || fingerprint(&(reservation, &queued.input))? != queued.digest
                {
                    return Err(io::Error::other("Invalid stdin reservation identity"));
                }
                Ok(Some(queued))
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error),
        }
    }

    fn delivery(&self, name: &str, digest: &Digest) -> io::Result<Delivery> {
        let record: Bound<Attempt> = match self.read(name) {
            Ok(record) => record,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Delivery::Queued),
            Err(_) => return Ok(Delivery::Unknown),
        };
        let owner: Bound<ProcessIdentity> = match self.read("worker.json") {
            Ok(owner) => owner,
            Err(_) => return Ok(Delivery::Unknown),
        };
        if record.digest != *digest
            || owner.digest != self.digest()?
            || record.value.worker != owner.value
            || record.value.delivery == Delivery::Queued
        {
            return Ok(Delivery::Unknown);
        }
        Ok(record.value.delivery)
    }

    fn begin_input(&self, name: &str, digest: &Digest, worker: &ProcessIdentity) -> io::Result<()> {
        let record = Bound {
            digest: digest.clone(),
            value: Attempt {
                worker: worker.clone(),
                delivery: Delivery::Unknown,
            },
        };
        if !self.once(name, &record)? {
            return Err(io::Error::other("Input delivery was already attempted"));
        }
        Ok(())
    }

    fn commit_input(
        &self,
        name: &str,
        digest: &Digest,
        worker: &ProcessIdentity,
    ) -> io::Result<()> {
        self.atomic(
            name,
            &Bound {
                digest: digest.clone(),
                value: Attempt {
                    worker: worker.clone(),
                    delivery: Delivery::Committed,
                },
            },
        )
    }
}

fn receipt(sequence: u16) -> InputReceipt {
    InputReceipt {
        sequence,
        next_sequence: sequence + 1,
    }
}

struct Active {
    name: String,
    digest: Digest,
    eof: bool,
    initial: bool,
}

pub(super) struct InputPump {
    stream: Option<ChildStdin>,
    initial: Option<String>,
    worker: ProcessIdentity,
    reservation: Digest,
    next: u16,
    active: Option<Active>,
    pending: Vec<u8>,
    at: usize,
}

impl InputPump {
    pub fn new(
        stream: ChildStdin,
        initial: String,
        worker: ProcessIdentity,
        reservation: Digest,
    ) -> io::Result<Self> {
        super::platform::nonblocking(&stream)?;
        Ok(Self {
            stream: Some(stream),
            initial: Some(initial),
            worker,
            reservation,
            next: 0,
            active: None,
            pending: Vec::new(),
            at: 0,
        })
    }

    pub fn step(&mut self, job: &Job) -> io::Result<()> {
        if self.stream.is_none() {
            return Ok(());
        }
        if self.active.is_none() {
            if let Some(initial) = self.initial.take().filter(|text| !text.is_empty()) {
                let digest = fingerprint(&(&self.reservation, "initial", &initial))?;
                job.begin_input("delivery-initial.json", &digest, &self.worker)?;
                self.pending = initial.into_bytes();
                self.active = Some(Active {
                    name: "delivery-initial.json".into(),
                    digest,
                    eof: false,
                    initial: true,
                });
            } else if let Some(queued) = job.queued(self.next, &self.reservation)? {
                let name = format!("delivery-{}.json", self.next);
                job.begin_input(&name, &queued.digest, &self.worker)?;
                self.pending = queued.input.text.into_bytes();
                self.active = Some(Active {
                    name,
                    digest: queued.digest,
                    eof: queued.input.eof,
                    initial: false,
                });
            } else {
                return Ok(());
            }
            self.at = 0;
        }
        if self.at < self.pending.len() {
            let end = self.pending.len().min(self.at + 65536);
            match self
                .stream
                .as_mut()
                .expect("Open input stream")
                .write(&self.pending[self.at..end])
            {
                Ok(0) => {
                    return Err(io::Error::new(
                        io::ErrorKind::WriteZero,
                        "No input pipe progress",
                    ));
                }
                Ok(count) => self.at += count,
                Err(error)
                    if matches!(
                        error.kind(),
                        io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
                    ) =>
                {
                    return Ok(());
                }
                Err(error) if error.kind() == io::ErrorKind::BrokenPipe => {
                    self.stream.take();
                    return Ok(());
                }
                Err(error) => return Err(error),
            }
        }
        if self.at == self.pending.len() {
            let active = self.active.take().expect("Reserved active input");
            if active.eof {
                self.stream.take();
            }
            job.commit_input(&active.name, &active.digest, &self.worker)?;
            if !active.initial {
                self.next += 1;
            }
            self.pending.clear();
        }
        Ok(())
    }
}
