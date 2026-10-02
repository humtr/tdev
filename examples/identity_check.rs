//! Development-only encoder comparison executable; no product command or runtime selector.
use std::io::{self, BufRead, Write};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let stdout = io::stdout();
    let mut output = io::BufWriter::new(stdout.lock());
    for line in io::stdin().lock().lines() {
        let value = tdev::identity::Value::parse(&line?)?;
        output.write_all(&value.canonical()?)?;
        output.write_all(b"\n")?;
    }
    Ok(())
}
