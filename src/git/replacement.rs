//! UTF-8 replacement across utility chunks, with bounded carry and a private file sink.
use super::capacity::{self, FILE_BYTES};
use crate::model::{Fault, Result};
use std::io::{self, Write};

pub(super) struct Replacement<'a> {
    output: &'a mut dyn Write,
    old: &'a str,
    text: &'a str,
    expected: usize,
    matched: usize,
    written: usize,
    pending: Vec<u8>,
    pub failure: Option<Fault>,
}

impl<'a> Replacement<'a> {
    pub fn new(output: &'a mut dyn Write, old: &'a str, text: &'a str, expected: usize) -> Self {
        Self {
            output,
            old,
            text,
            expected,
            matched: 0,
            written: 0,
            pending: Vec::new(),
            failure: None,
        }
    }

    fn emit(&mut self, value: &[u8]) -> Result<()> {
        self.written = self.written.saturating_add(value.len());
        capacity::check("SOURCE_LIMIT", "sourceFileBytes", FILE_BYTES, self.written)?;
        self.output
            .write_all(value)
            .map_err(|_| Fault::new("GIT_IO"))
    }

    fn process(&mut self, final_chunk: bool) -> Result<()> {
        let valid = match std::str::from_utf8(&self.pending) {
            Ok(text) => text.len(),
            Err(error) if !final_chunk && error.error_len().is_none() => error.valid_up_to(),
            Err(_) => return Err(Fault::new("SOURCE_ENCODING")),
        };
        let mut cut = if final_chunk {
            valid
        } else {
            valid.saturating_sub(self.old.len() - 1)
        };
        let text = std::str::from_utf8(&self.pending[..valid]).unwrap();
        while !text.is_char_boundary(cut) {
            cut -= 1;
        }
        let mut cursor = 0;
        // Collect only locations in this chunk; source bytes remain in bounded carry.
        let mut matches = Vec::new();
        while let Some(offset) = text[cursor..].find(self.old) {
            let found = cursor + offset;
            if !final_chunk && found >= cut {
                break;
            }
            matches.push((cursor, found));
            cursor = found + self.old.len();
        }
        let end = cursor.max(cut);
        let mut pending = std::mem::take(&mut self.pending);
        for (start, found) in matches {
            self.matched += 1;
            if self.matched > self.expected {
                return Err(Fault::new("EDIT_CONFLICT"));
            }
            self.emit(&pending[start..found])?;
            self.emit(self.text.as_bytes())?;
        }
        self.emit(&pending[cursor..end])?;
        pending.drain(..end);
        self.pending = pending;
        Ok(())
    }

    pub fn finish(&mut self) -> Result<()> {
        self.process(true)?;
        if self.matched != self.expected {
            return Err(Fault::new("EDIT_CONFLICT"));
        }
        Ok(())
    }
}

impl Write for Replacement<'_> {
    fn write(&mut self, value: &[u8]) -> io::Result<usize> {
        self.pending.extend_from_slice(value);
        if let Err(error) = self.process(false) {
            self.failure = Some(error);
            return Err(io::Error::other("Source replacement failed"));
        }
        Ok(value.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        self.output.flush()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunk_boundaries_preserve_unicode_and_nonoverlapping_matches() {
        let input = "가🙂aaaa가🙂aaaa끝";
        for width in 1..=input.len() {
            let mut output = Vec::new();
            let mut sink = Replacement::new(&mut output, "🙂aa", "🦀", 2);
            for chunk in input.as_bytes().chunks(width) {
                sink.write_all(chunk).unwrap();
            }
            sink.finish().unwrap();
            assert_eq!(output, input.replace("🙂aa", "🦀").as_bytes());
        }
    }

    #[test]
    fn invalid_trailing_utf8_and_wrong_count_fail() {
        let mut output = Vec::new();
        let mut sink = Replacement::new(&mut output, "a", "b", 1);
        sink.write_all(&[b'a', 0xe1]).unwrap();
        assert_eq!(sink.finish().unwrap_err().code, "SOURCE_ENCODING");
        let mut sink = Replacement::new(&mut output, "missing", "b", 1);
        sink.write_all(b"source").unwrap();
        assert_eq!(sink.finish().unwrap_err().code, "EDIT_CONFLICT");
    }
}
