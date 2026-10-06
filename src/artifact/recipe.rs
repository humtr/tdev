//! Bounded recipe semantics over the canonical contract; never execution authority.
use crate::{contract::Contract, identity, model::*, wire};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub(crate) const RECIPE_BYTES: usize = 65536;

fn capacity(observed: usize) -> Result<()> {
    if observed > RECIPE_BYTES {
        return Err(Fault::message(
            "ARTIFACT_RECIPE_LIMIT",
            format!("budget=artifactRecipeBytes configured={RECIPE_BYTES} observed={observed}"),
        ));
    }
    Ok(())
}

pub(crate) fn path(value: &str, dot: bool) -> Result<()> {
    if dot && value == "." {
        return Ok(());
    }
    SourcePath::new(value)?;
    if value.len() > 1024 || value.contains('\u{7f}') {
        return Err(Fault::new("ARTIFACT_PATH"));
    }
    Ok(())
}

fn paths(values: &[Value]) -> Result<()> {
    let mut seen = BTreeSet::new();
    let mut spelling = BTreeMap::new();
    for value in values {
        let name = value
            .as_str()
            .ok_or_else(|| Fault::new("ARTIFACT_SCHEMA"))?;
        path(name, false)?;
        let folded = casefold::fold(name);
        if !seen.insert(folded) {
            return Err(Fault::new("ARTIFACT_PATH_COLLISION"));
        }
        let mut prefix = String::new();
        for part in name.split('/') {
            if !prefix.is_empty() {
                prefix.push('/');
            }
            prefix.push_str(part);
            if spelling
                .insert(casefold::fold(&prefix), prefix.clone())
                .is_some_and(|old| old != prefix)
            {
                return Err(Fault::new("ARTIFACT_PATH_COLLISION"));
            }
        }
    }
    for name in &seen {
        for (at, _) in name.match_indices('/') {
            if seen.contains(&name[..at]) {
                return Err(Fault::new("ARTIFACT_PATH_COLLISION"));
            }
        }
    }
    Ok(())
}

fn unique(values: &[Value], field: &str, code: &str) -> Result<()> {
    let mut seen = BTreeSet::new();
    for value in values {
        if !seen.insert(wire::string(value, field)?) {
            return Err(Fault::new(code));
        }
    }
    Ok(())
}

fn public_url(value: &str) -> bool {
    if value
        .chars()
        .any(|c| c <= ' ' || c == '\u{7f}' || matches!(c, '\\' | '?' | '#'))
    {
        return false;
    }
    let Some((scheme, rest)) = value.split_once("://") else {
        return false;
    };
    if !scheme.eq_ignore_ascii_case("https") {
        return false;
    }
    let authority = rest.split('/').next().unwrap_or("");
    let host = if let Some((host, port)) = authority.split_once(':') {
        if port.parse::<u16>().ok() != Some(443) {
            return false;
        }
        host
    } else {
        authority
    };
    !host.is_empty()
        && host
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-'))
}

pub(crate) fn parse(contract: &Contract, bytes: &[u8]) -> Result<Value> {
    capacity(bytes.len())?;
    let decoded = (|| {
        let text = std::str::from_utf8(bytes).map_err(|_| Fault::new("JSON"))?;
        identity::Value::parse_unique(text)?;
        wire::Json::parse(bytes)
    })()
    .map_err(|_| Fault::new("ARTIFACT_RECIPE_JSON"))?;
    capacity(decoded.original.canonical()?.len())?;
    let value = decoded.value;
    contract.definition("ArtifactRecipe", &value)?;
    paths(value["inputs"].as_array().unwrap())?;
    paths(value["exports"].as_array().unwrap())?;
    unique(
        value["build"]["tools"].as_array().unwrap(),
        "name",
        "ARTIFACT_TOOL_DUPLICATE",
    )?;
    let dependencies = value["dependencies"].as_array().unwrap();
    unique(dependencies, "name", "ARTIFACT_DEPENDENCY_DUPLICATE")?;
    unique(dependencies, "url", "ARTIFACT_DEPENDENCY_DUPLICATE")?;
    paths(
        &dependencies
            .iter()
            .map(|d| d["name"].clone())
            .collect::<Vec<_>>(),
    )?;
    for dependency in dependencies {
        if !public_url(wire::string(dependency, "url")?) {
            return Err(Fault::new("ARTIFACT_DEPENDENCY_URL"));
        }
    }
    if let Some(service) = value.get("service") {
        path(wire::string(service, "cwd")?, true)?;
        unique(
            service["runtime"]["tools"].as_array().unwrap(),
            "name",
            "ARTIFACT_TOOL_DUPLICATE",
        )?;
        if let Some(files) = service["runtime"].get("files").and_then(Value::as_array) {
            unique(files, "path", "ARTIFACT_RUNTIME_FILE_DUPLICATE")?;
            for file in files {
                let name = wire::string(file, "path")?;
                let relative = name
                    .strip_prefix('/')
                    .ok_or_else(|| Fault::new("ARTIFACT_RUNTIME_FILE_PATH"))?;
                path(relative, false)?;
            }
        }
        const RESERVED: &[&str] = &[
            "HOME",
            "TMPDIR",
            "PATH",
            "PYTHONHOME",
            "PYTHONPATH",
            "LD_PRELOAD",
            "LD_LIBRARY_PATH",
            "XDG_CONFIG_HOME",
            "XDG_CACHE_HOME",
            "VIRTUAL_ENV",
        ];
        for key in service["environment"].as_object().unwrap().keys() {
            if RESERVED.contains(&key.as_str()) || key.starts_with("TDEV_") {
                return Err(Fault::new("ARTIFACT_ENV"));
            }
        }
        if service["runtime"]["platform"] != value["target"] {
            return Err(Fault::new("ARTIFACT_TARGET_MISMATCH"));
        }
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn recipe() -> Value {
        let platform = json!({"os":"android","arch":"aarch64","abi":"bionic"});
        json!({"format":1,"kind":"files","inputs":["a.txt"],"dependencies":[],
            "build":{"command":"true","platform":platform,"tools":[{"name":"sh","sha256":"a".repeat(64)}]},
            "exports":["dist"],"target":platform})
    }
    fn checked(contract: &Contract, value: &Value) -> Result<Value> {
        parse(contract, value.to_string().as_bytes())
    }

    #[test]
    fn strict_json_rejects_nested_escaped_duplicates_nonfinite_and_unbounded_documents() {
        let c = Contract::embedded().unwrap();
        for raw in [
            br#"{"x":1,"\u0078":2}"#.as_slice(),
            br#"{"x":[{"y":1,"y":2}]}"#,
            br#"{"x":NaN}"#,
            b"\xff",
            br#"{"x":"\ud800"}"#,
        ] {
            assert_eq!(parse(&c, raw).unwrap_err().code, "ARTIFACT_RECIPE_JSON");
        }
        // Request identity retains the historical last-key policy.
        assert_eq!(
            identity::Value::parse(r#"{"x":1,"x":2}"#)
                .unwrap()
                .canonical()
                .unwrap(),
            br#"{"x":2}"#
        );
        let mut at_edge = recipe().to_string().into_bytes();
        at_edge.resize(RECIPE_BYTES, b' ');
        assert!(parse(&c, &at_edge).is_ok());
        at_edge.push(b' ');
        let error = parse(&c, &at_edge).unwrap_err();
        assert_eq!(error.code, "ARTIFACT_RECIPE_LIMIT");
        assert!(error.message.contains("configured=65536 observed=65537"));
        let mut expanded = recipe();
        expanded["build"]["command"] = json!("가".repeat(4000));
        expanded["inputs"] = json!(
            (0..20)
                .map(|i| format!("{i}/{}", "가".repeat(400)))
                .collect::<Vec<_>>()
        );
        assert!(expanded.to_string().len() < RECIPE_BYTES);
        assert_eq!(
            checked(&c, &expanded).unwrap_err().code,
            "ARTIFACT_RECIPE_LIMIT"
        );
    }

    #[test]
    fn paths_use_full_unicode_fold_and_reject_component_aliases_and_overlaps() {
        let c = Contract::embedded().unwrap();
        for roots in [
            vec!["dist", "DIST"],
            vec!["Dist/a", "dist/b"],
            vec!["dist", "dist/a"],
            vec!["Straße/a", "STRASSE/b"],
            vec!["σ/a", "ς/b"],
            vec!["../dist"],
            vec![".git/a"],
            vec!["dist\\a"],
            vec!["/dist"],
            vec!["x\u{7f}"],
        ] {
            let mut r = recipe();
            r["exports"] = json!(roots);
            assert!(checked(&c, &r).is_err());
        }
        let mut r = recipe();
        r["inputs"] = json!(["한글/a", "한글/b"]);
        assert!(checked(&c, &r).is_ok());
    }

    #[test]
    fn pinned_https_urls_and_tool_names_cannot_alias_or_supply_authority() {
        let c = Contract::embedded().unwrap();
        let mut r = recipe();
        r["dependencies"] =
            json!([{"name":"input","url":"https://example.org:443/file","sha256":"b".repeat(64)}]);
        assert!(checked(&c, &r).is_ok());
        for url in [
            "http://example.org/a",
            "file:///tmp/key",
            "https://user:pass@example.org/a",
            "https://example.org/a?token=x",
            "https://example.org/a#x",
            "https://example.org:bad/a",
            "https://example.org:444/a",
            "https://example.org\\/a",
            "https://example.org/\n",
            "https:///a",
        ] {
            r["dependencies"][0]["url"] = json!(url);
            assert_eq!(checked(&c, &r).unwrap_err().code, "ARTIFACT_DEPENDENCY_URL");
        }
        r = recipe();
        r["dependencies"] = json!([
            {"name":"Input","url":"https://example.org/a","sha256":"a".repeat(64)},
            {"name":"input","url":"https://example.org/b","sha256":"b".repeat(64)}
        ]);
        assert_eq!(checked(&c, &r).unwrap_err().code, "ARTIFACT_PATH_COLLISION");
        r = recipe();
        r["build"]["tools"]
            .as_array_mut()
            .unwrap()
            .push(json!({"name":"sh","sha256":"b".repeat(64)}));
        assert_eq!(checked(&c, &r).unwrap_err().code, "ARTIFACT_TOOL_DUPLICATE");
        for field in [
            "validation",
            "artifactValidation",
            "adminApproved",
            "targetId",
            "signingKey",
            "outputRoot",
        ] {
            let mut r = recipe();
            r[field] = json!("true");
            assert_eq!(checked(&c, &r).unwrap_err().code, "ARTIFACT_SCHEMA");
        }
    }

    #[test]
    fn service_metadata_is_conditional_and_cannot_override_owned_environment_or_runtime() {
        let c = Contract::embedded().unwrap();
        let mut r = recipe();
        r["kind"] = json!("service");
        r["service"] = json!({"command":"exec sh app","cwd":".","runtime":{"platform":r["target"],"tools":r["build"]["tools"]},"environment":{"APP_MODE":"test"}});
        assert!(checked(&c, &r).is_ok());
        for key in [
            "HOME",
            "TMPDIR",
            "PATH",
            "PYTHONPATH",
            "LD_PRELOAD",
            "TDEV_INPUT_DIR",
        ] {
            let mut altered = r.clone();
            altered["service"]["environment"][key] = json!("override");
            assert_eq!(checked(&c, &altered).unwrap_err().code, "ARTIFACT_ENV");
        }
        let mut altered = r.clone();
        altered["service"]["runtime"]["platform"]["abi"] = json!("different");
        assert_eq!(
            checked(&c, &altered).unwrap_err().code,
            "ARTIFACT_TARGET_MISMATCH"
        );
        for kind in ["files", "archive", "binary", "apk", "aab"] {
            let mut plain = recipe();
            plain["kind"] = json!(kind);
            assert!(checked(&c, &plain).is_ok());
            plain["service"] = r["service"].clone();
            assert_eq!(checked(&c, &plain).unwrap_err().code, "ARTIFACT_SCHEMA");
        }
    }
}
