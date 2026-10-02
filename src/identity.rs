//! Canonical identity bytes, separate from ordinary wire serialization.
use crate::model::{Digest, Fault, Result};
use sha2::{Digest as _, Sha256};
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Integer(String),
    Float(f64),
    String(Vec<u32>),
    Array(Vec<Value>),
    Object(BTreeMap<Vec<u32>, Value>),
}

impl Value {
    pub fn parse(text: &str) -> Result<Self> {
        let mut parser = Parser { text, at: 0 };
        let value = parser.value(0)?;
        parser.whitespace();
        if parser.at != text.len() {
            return Err(Fault::new("JSON"));
        }
        Ok(value)
    }

    pub fn canonical(&self) -> Result<Vec<u8>> {
        let mut output = String::new();
        self.encode(&mut output)?;
        Ok(output.into_bytes())
    }

    pub fn fingerprint(&self) -> Result<Digest> {
        digest(&self.canonical()?)
    }

    fn encode(&self, output: &mut String) -> Result<()> {
        match self {
            Self::Null => output.push_str("null"),
            Self::Bool(value) => output.push_str(if *value { "true" } else { "false" }),
            Self::Integer(value) => {
                // Values constructed outside the decoder are checked too.
                let parsed = Self::parse(value)?;
                if !matches!(&parsed, Self::Integer(n) if n == value) {
                    return Err(Fault::new("JSON_NUMBER"));
                }
                output.push_str(value);
            }
            Self::Float(value) => output.push_str(&float_repr(*value)?),
            Self::String(value) => encode_string(value, output)?,
            Self::Array(values) => {
                output.push('[');
                for (index, value) in values.iter().enumerate() {
                    if index != 0 {
                        output.push(',');
                    }
                    value.encode(output)?;
                }
                output.push(']');
            }
            Self::Object(values) => {
                output.push('{');
                for (index, (key, value)) in values.iter().enumerate() {
                    if index != 0 {
                        output.push(',');
                    }
                    encode_string(key, output)?;
                    output.push(':');
                    value.encode(output)?;
                }
                output.push('}');
            }
        }
        Ok(())
    }
}

pub fn digest(bytes: &[u8]) -> Result<Digest> {
    Digest::new(format!("{:x}", Sha256::digest(bytes)))
}

fn encode_string(value: &[u32], output: &mut String) -> Result<()> {
    use std::fmt::Write;
    output.push('"');
    for &point in value {
        match point {
            8 => output.push_str("\\b"),
            9 => output.push_str("\\t"),
            10 => output.push_str("\\n"),
            12 => output.push_str("\\f"),
            13 => output.push_str("\\r"),
            34 => output.push_str("\\\""),
            92 => output.push_str("\\\\"),
            32..=126 => {
                output.push(char::from_u32(point).ok_or_else(|| Fault::new("JSON_STRING"))?)
            }
            0..=0xffff => {
                write!(output, "\\u{point:04x}").expect("writing to String");
            }
            0x10000..=0x10ffff => {
                let supplementary = point - 0x10000;
                write!(
                    output,
                    "\\u{:04x}\\u{:04x}",
                    0xd800 + (supplementary >> 10),
                    0xdc00 + (supplementary & 0x3ff)
                )
                .expect("writing to String");
            }
            _ => return Err(Fault::new("JSON_STRING")),
        }
    }
    output.push('"');
    Ok(())
}

fn float_repr(value: f64) -> Result<String> {
    if !value.is_finite() {
        return Err(Fault::new("JSON_NONFINITE"));
    }
    if value == 0.0 {
        return Ok(if value.is_sign_negative() {
            "-0.0"
        } else {
            "0.0"
        }
        .into());
    }
    let mut buffer = ryu::Buffer::new();
    let raw = buffer.format_finite(value);
    let (sign, magnitude) = raw.strip_prefix('-').map_or(("", raw), |m| ("-", m));
    let (mantissa, power) = magnitude
        .split_once('e')
        .map_or(Ok((magnitude, 0i32)), |(m, p)| {
            p.parse::<i32>()
                .map(|p| (m, p))
                .map_err(|_| Fault::new("JSON_NUMBER"))
        })?;
    let decimal = mantissa.find('.').unwrap_or(mantissa.len()) as i32;
    let raw_digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let leading = raw_digits.len() - raw_digits.trim_start_matches('0').len();
    let exponent = decimal + power - leading as i32 - 1;
    let digits = raw_digits.trim_start_matches('0').trim_end_matches('0');
    let mut result = sign.to_owned();
    if !(-4..16).contains(&exponent) {
        result.push_str(&digits[..1]);
        if digits.len() > 1 {
            result.push('.');
            result.push_str(&digits[1..]);
        }
        result.push('e');
        result.push(if exponent < 0 { '-' } else { '+' });
        result.push_str(&format!("{:02}", exponent.abs()));
    } else {
        let position = exponent + 1;
        if position <= 0 {
            result.push_str("0.");
            result.extend(std::iter::repeat_n('0', (-position) as usize));
            result.push_str(digits);
        } else if position as usize >= digits.len() {
            result.push_str(digits);
            result.extend(std::iter::repeat_n('0', position as usize - digits.len()));
            result.push_str(".0");
        } else {
            result.push_str(&digits[..position as usize]);
            result.push('.');
            result.push_str(&digits[position as usize..]);
        }
    }
    Ok(result)
}

struct Parser<'a> {
    text: &'a str,
    at: usize,
}

impl Parser<'_> {
    fn peek(&self) -> Option<u8> {
        self.text.as_bytes().get(self.at).copied()
    }
    fn whitespace(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\n' | b'\r' | b'\t')) {
            self.at += 1;
        }
    }
    fn take(&mut self, byte: u8) -> Result<()> {
        self.whitespace();
        if self.peek() != Some(byte) {
            return Err(Fault::new("JSON"));
        }
        self.at += 1;
        Ok(())
    }
    fn value(&mut self, depth: usize) -> Result<Value> {
        if depth > 128 {
            return Err(Fault::new("JSON_DEPTH"));
        }
        self.whitespace();
        match self.peek() {
            Some(b'n' | b't' | b'f') => {
                for (literal, value) in [
                    ("null", Value::Null),
                    ("true", Value::Bool(true)),
                    ("false", Value::Bool(false)),
                ] {
                    if self.text[self.at..].starts_with(literal) {
                        self.at += literal.len();
                        return Ok(value);
                    }
                }
                Err(Fault::new("JSON"))
            }
            Some(b'"') => self.string().map(Value::String),
            Some(b'[') => {
                self.at += 1;
                self.whitespace();
                let mut values = Vec::new();
                if self.peek() != Some(b']') {
                    loop {
                        values.push(self.value(depth + 1)?);
                        self.whitespace();
                        if self.peek() != Some(b',') {
                            break;
                        }
                        self.at += 1;
                    }
                }
                self.take(b']')?;
                Ok(Value::Array(values))
            }
            Some(b'{') => {
                self.at += 1;
                self.whitespace();
                let mut values = BTreeMap::new();
                if self.peek() != Some(b'}') {
                    loop {
                        self.whitespace();
                        let key = self.string()?;
                        self.take(b':')?;
                        values.insert(key, self.value(depth + 1)?);
                        self.whitespace();
                        if self.peek() != Some(b',') {
                            break;
                        }
                        self.at += 1;
                    }
                }
                self.take(b'}')?;
                Ok(Value::Object(values))
            }
            Some(b'-' | b'0'..=b'9') => self.number(),
            _ => Err(Fault::new("JSON")),
        }
    }
    fn number(&mut self) -> Result<Value> {
        let start = self.at;
        if self.peek() == Some(b'-') {
            self.at += 1;
        }
        match self.peek() {
            Some(b'0') => self.at += 1,
            Some(b'1'..=b'9') => self.digits()?,
            _ => return Err(Fault::new("JSON_NUMBER")),
        }
        let mut floating = false;
        if self.peek() == Some(b'.') {
            floating = true;
            self.at += 1;
            self.digits()?;
        }
        if matches!(self.peek(), Some(b'e' | b'E')) {
            floating = true;
            self.at += 1;
            if matches!(self.peek(), Some(b'+' | b'-')) {
                self.at += 1;
            }
            self.digits()?;
        }
        let raw = &self.text[start..self.at];
        if floating {
            let number: f64 = raw.parse().map_err(|_| Fault::new("JSON_NUMBER"))?;
            if !number.is_finite() {
                return Err(Fault::new("JSON_NONFINITE"));
            }
            Ok(Value::Float(number))
        } else {
            Ok(Value::Integer(if raw == "-0" { "0" } else { raw }.into()))
        }
    }
    fn digits(&mut self) -> Result<()> {
        let start = self.at;
        while matches!(self.peek(), Some(b'0'..=b'9')) {
            self.at += 1;
        }
        if self.at == start {
            return Err(Fault::new("JSON_NUMBER"));
        }
        Ok(())
    }
    fn hex(&mut self) -> Result<u32> {
        let end = self.at + 4;
        let bytes = self
            .text
            .as_bytes()
            .get(self.at..end)
            .ok_or_else(|| Fault::new("JSON_STRING"))?;
        if !bytes.iter().all(u8::is_ascii_hexdigit) {
            return Err(Fault::new("JSON_STRING"));
        }
        let point = u32::from_str_radix(&self.text[self.at..end], 16)
            .map_err(|_| Fault::new("JSON_STRING"))?;
        self.at = end;
        Ok(point)
    }
    fn string(&mut self) -> Result<Vec<u32>> {
        self.take(b'"')?;
        let mut value = Vec::new();
        loop {
            match self.peek() {
                Some(b'"') => {
                    self.at += 1;
                    return Ok(value);
                }
                Some(b'\\') => {
                    self.at += 1;
                    let escaped = self.peek().ok_or_else(|| Fault::new("JSON_STRING"))?;
                    self.at += 1;
                    let point = match escaped {
                        b'"' => 34,
                        b'\\' => 92,
                        b'/' => 47,
                        b'b' => 8,
                        b'f' => 12,
                        b'n' => 10,
                        b'r' => 13,
                        b't' => 9,
                        b'u' => {
                            let high = self.hex()?;
                            if (0xd800..=0xdbff).contains(&high)
                                && self.text[self.at..].starts_with("\\u")
                            {
                                let saved = self.at;
                                self.at += 2;
                                let low = self.hex()?;
                                if (0xdc00..=0xdfff).contains(&low) {
                                    0x10000 + ((high - 0xd800) << 10) + low - 0xdc00
                                } else {
                                    self.at = saved;
                                    high
                                }
                            } else {
                                high
                            }
                        }
                        _ => return Err(Fault::new("JSON_STRING")),
                    };
                    value.push(point);
                }
                Some(0..=31) | None => return Err(Fault::new("JSON_STRING")),
                Some(_) => {
                    let point = self.text[self.at..]
                        .chars()
                        .next()
                        .ok_or_else(|| Fault::new("JSON_STRING"))?;
                    self.at += point.len_utf8();
                    value.push(point as u32);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Case {
        name: String,
        value: Box<serde_json::value::RawValue>,
        canonical: String,
        sha256: String,
    }
    #[derive(Deserialize)]
    struct Fixture {
        cases: Vec<Case>,
    }

    #[test]
    fn fixed_baseline_bytes_and_hashes_include_lone_surrogates() {
        let fixture: Fixture =
            serde_json::from_str(include_str!("../tests/acceptance/identity.json")).unwrap();
        for case in fixture.cases {
            let value = Value::parse(case.value.get()).unwrap();
            assert_eq!(
                value.canonical().unwrap(),
                case.canonical.as_bytes(),
                "{}",
                case.name
            );
            assert_eq!(
                value.fingerprint().unwrap().as_str(),
                case.sha256,
                "{}",
                case.name
            );
        }
    }

    #[test]
    fn arbitrary_integer_precision_and_last_duplicate_key_are_preserved() {
        let value =
            Value::parse(r#"{"x":0,"x":18446744073709551616000000000001,"zero":-0}"#).unwrap();
        assert_eq!(
            String::from_utf8(value.canonical().unwrap()).unwrap(),
            r#"{"x":18446744073709551616000000000001,"zero":0}"#
        );
    }

    #[test]
    fn malformed_and_nonfinite_values_are_rejected() {
        for bad in [
            "",
            "01",
            "1.",
            "+1",
            "-.1",
            "1e",
            "1e999",
            "NaN",
            "[1,]",
            "{\"x\":1,}",
            "true false",
            r#""\x00""#,
            r#""\ud800\uZZZZ""#,
        ] {
            assert!(Value::parse(bad).is_err(), "{bad:?}");
        }
        assert!(Value::Float(f64::NAN).canonical().is_err());
        assert!(Value::Integer("1.0".into()).canonical().is_err());
        assert!(Value::String(vec![0x110000]).canonical().is_err());
        assert!(Value::parse(&("[".repeat(130) + "0" + &"]".repeat(130))).is_err());
    }
}
