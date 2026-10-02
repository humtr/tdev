//! Physical JSON decoding and explicit numeric conversion; schemas remain authoritative.
use crate::{
    identity,
    model::{Digest, Fault, Result},
};
use serde::Deserialize;
use serde_json::{Number, Value, json};
use std::str::FromStr;

pub struct Json {
    pub value: Value,
    pub original: identity::Value,
}

impl Json {
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        let original =
            identity::Value::parse(std::str::from_utf8(bytes).map_err(|_| Fault::new("JSON"))?)?;
        fn limits(value: &identity::Value) -> Result<()> {
            match value {
                identity::Value::Integer(text) if text.trim_start_matches('-').len() > 4300 => {
                    return Err(Fault::new("JSON_NUMBER"));
                }
                identity::Value::Array(values) => {
                    for value in values {
                        limits(value)?;
                    }
                }
                identity::Value::Object(values) => {
                    for value in values.values() {
                        limits(value)?;
                    }
                }
                _ => {}
            }
            Ok(())
        }
        limits(&original)?;
        // Identity materializes finite floats exactly as the reference does,
        // preserving arbitrary decimal integers. Scalar Unicode is an explicit
        // physical ingress rule, not an accidental serde type rejection.
        let canonical = original.canonical()?;
        let mut decoder = serde_json::Deserializer::from_slice(&canonical);
        // The identity parser owns the explicit depth bound. Disable serde's
        // separate counter so it cannot silently tighten that ingress policy.
        decoder.disable_recursion_limit();
        let value = Value::deserialize(&mut decoder).map_err(|_| Fault::new("JSON_UNICODE"))?;
        Ok(Self { value, original })
    }

    pub fn original_at(&self, path: &[&str]) -> Result<&identity::Value> {
        let mut value = &self.original;
        for key in path {
            let identity::Value::Object(object) = value else {
                return Err(Fault::new("SCHEMA"));
            };
            value = object
                .get(&key.chars().map(u32::from).collect::<Vec<_>>())
                .ok_or_else(|| Fault::new("SCHEMA"))?;
        }
        Ok(value)
    }
}

pub fn fingerprint(kind: &str, input: &identity::Value) -> Result<Digest> {
    let value = identity::Value::Object(std::collections::BTreeMap::from([
        (
            "kind".chars().map(u32::from).collect(),
            identity::Value::String(kind.chars().map(u32::from).collect()),
        ),
        ("input".chars().map(u32::from).collect(), input.clone()),
    ]));
    value.fingerprint()
}

pub fn string<'a>(value: &'a Value, field: &str) -> Result<&'a str> {
    value
        .get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| Fault::new("SCHEMA"))
}

pub fn integer(value: &Value, maximum: u64) -> Result<u64> {
    if let Some(n) = value.as_u64()
        && n <= maximum
    {
        return Ok(n);
    }
    if let Some(n) = value.as_f64()
        && n.is_finite()
        && n.fract() == 0.0
        && n >= 0.0
        && n <= maximum as f64
    {
        let integer = format!("{n:.0}")
            .trim_start_matches('-')
            .parse::<u64>()
            .map_err(|_| Fault::new("SCHEMA"))?;
        if integer <= maximum {
            return Ok(integer);
        }
    }
    Err(Fault::new("SCHEMA"))
}

pub fn bounded(value: &Value, field: &str, default: u64, maximum: u64) -> Result<u64> {
    value
        .get(field)
        .map_or(Ok(default), |n| integer(n, maximum))
}

/// An unbounded schema offset with bounded machine indexing. Original numeric
/// form stays available for readback; addition never truncates a large integer.
pub struct Offset {
    pub original: Value,
    digits: String,
}

impl Offset {
    pub fn new(value: Option<&Value>) -> Result<Self> {
        let original = value.cloned().unwrap_or(json!(0));
        let number = original.as_number().ok_or_else(|| Fault::new("SCHEMA"))?;
        let raw = number.to_string();
        let digits = if raw.contains(['.', 'e', 'E']) {
            let n = number.as_f64().ok_or_else(|| Fault::new("SCHEMA"))?;
            if !n.is_finite() || n < 0.0 || n.fract() != 0.0 {
                return Err(Fault::new("SCHEMA"));
            }
            format!("{n:.0}").trim_start_matches('-').to_owned()
        } else {
            raw
        };
        if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
            return Err(Fault::new("SCHEMA"));
        }
        let digits = digits.trim_start_matches('0');
        Ok(Self {
            original,
            digits: if digits.is_empty() {
                "0".into()
            } else {
                digits.into()
            },
        })
    }

    pub fn index(&self, length: usize) -> usize {
        let bound = length.to_string();
        if self.digits.len() > bound.len()
            || (self.digits.len() == bound.len() && self.digits >= bound)
        {
            return length;
        }
        self.digits
            .parse()
            .expect("Validated bounded decimal offset")
    }

    pub fn plus(&self, amount: usize) -> Result<Value> {
        let mut digits = self.digits.as_bytes().to_vec();
        let mut carry = amount;
        for digit in digits.iter_mut().rev() {
            let n = usize::from(*digit - b'0') + carry % 10;
            *digit = b'0' + (n % 10) as u8;
            carry = carry / 10 + n / 10;
        }
        let prefix = if carry == 0 {
            String::new()
        } else {
            carry.to_string()
        };
        Ok(Value::Number(
            Number::from_str(&(prefix + std::str::from_utf8(&digits).unwrap()))
                .map_err(|_| Fault::new("SCHEMA"))?,
        ))
    }
}

pub fn canonical(value: &Value) -> Result<Vec<u8>> {
    identity::Value::parse(&serde_json::to_string(value).map_err(|_| Fault::new("JSON"))?)?
        .canonical()
}

pub fn observe(value: &mut Value, since: Option<&str>, sources: &[&str]) -> Result<()> {
    let cursor = identity::digest(&canonical(value)?)?;
    let ns = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| Fault::new("CLOCK"))?
        .as_nanos()
        .to_string();
    value["observation"] = json!({"cursor":cursor,"changed":since != Some(cursor.as_str()),"observedAtNs":ns,"sources":sources,"pollAfterMs":1000});
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn finite_materialization_rpc_types_and_unbounded_offsets_remain_distinct() {
        let json = Json::parse(br#"{"n":1.00000000000000000001,"underflow":1e-999,"large":1000000000000000000000000000000000000001}"#).unwrap();
        assert_eq!(json.value["n"].as_f64(), Some(1.0));
        assert_eq!(json.value["underflow"].as_f64(), Some(0.0));
        let offset = Offset::new(Some(&json.value["large"])).unwrap();
        assert_eq!(offset.index(3), 3);
        assert_eq!(
            offset.plus(9).unwrap().to_string(),
            "1000000000000000000000000000000000000010"
        );
        assert_eq!(integer(&json!(1.0), 10).unwrap(), 1);
        assert!(Json::parse(br#"{"s":"\ud800"}"#).is_err());
        assert!(Json::parse(br#"{"n":1e999}"#).is_err());
        let at_bound = format!("{}0{}", "[".repeat(128), "]".repeat(128));
        assert!(Json::parse(at_bound.as_bytes()).is_ok());
        let beyond = format!("{}0{}", "[".repeat(129), "]".repeat(129));
        assert!(Json::parse(beyond.as_bytes()).is_err());
    }
}
