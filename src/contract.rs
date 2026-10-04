//! Compile the repository's canonical JSON contracts, without network/file
//! reference retrieval or a second handwritten schema registry. This boundary
//! validates materialized JSON; HTTP byte decoding and authority are separate.
use crate::model::{Fault, Result};
use jsonschema::{Retrieve, Uri, Validator};
use serde_json::{Value, json};
use std::collections::BTreeMap;

struct NoExternalDocuments;

impl Retrieve for NoExternalDocuments {
    fn retrieve(
        &self,
        _: &Uri<String>,
    ) -> std::result::Result<Value, Box<dyn std::error::Error + Send + Sync>> {
        Err("External contract documents are disabled".into())
    }
}

fn compile(schema: &Value) -> Result<Validator> {
    jsonschema::draft202012::options()
        .with_retriever(NoExternalDocuments)
        .should_validate_formats(false)
        .build(schema)
        .map_err(|_| Fault::new("CONTRACT"))
}

struct Tool {
    input: Validator,
    output: Validator,
}

pub struct Contract {
    schema: Value,
    tools: BTreeMap<String, Tool>,
    config: Validator,
}

pub struct Surface {
    pub tools: Vec<Value>,
    inputs: BTreeMap<String, Validator>,
}

impl Surface {
    pub fn source(contract: &Contract) -> Result<Self> {
        fn expand(value: &Value, root: &Value, depth: usize) -> Result<Value> {
            if depth > 128 {
                return Err(Fault::new("CONTRACT"));
            }
            if let Some(reference) = value.get("$ref").and_then(Value::as_str) {
                let target = root
                    .pointer(
                        reference
                            .strip_prefix('#')
                            .ok_or_else(|| Fault::new("CONTRACT"))?,
                    )
                    .ok_or_else(|| Fault::new("CONTRACT"))?;
                let mut expanded = expand(target, root, depth + 1)?;
                for (key, item) in value.as_object().unwrap() {
                    if key != "$ref" {
                        expanded[key] = expand(item, root, depth + 1)?;
                    }
                }
                return Ok(expanded);
            }
            match value {
                Value::Object(object) => Ok(Value::Object(
                    object
                        .iter()
                        .map(|(k, v)| Ok((k.clone(), expand(v, root, depth + 1)?)))
                        .collect::<Result<_>>()?,
                )),
                Value::Array(array) => Ok(Value::Array(
                    array
                        .iter()
                        .map(|v| expand(v, root, depth + 1))
                        .collect::<Result<_>>()?,
                )),
                _ => Ok(value.clone()),
            }
        }
        // Restrict request alternatives only; nested edit/read actions remain intact.
        fn restrict(request: &mut Value, actions: &[&str], source_start: bool) -> bool {
            if let Some(action) = request["properties"]["action"]["const"].as_str() {
                let enabled = actions.contains(&action);
                if source_start
                    && action == "start"
                    && request["properties"].get("fromTaskId").is_some()
                {
                    return false;
                }
                return enabled;
            }
            if let Some(alternatives) = request.get_mut("oneOf").and_then(Value::as_array_mut) {
                alternatives.retain_mut(|value| restrict(value, actions, source_start));
                return !alternatives.is_empty();
            }
            false
        }
        let selected = [
            (
                "tdev_workspace",
                vec![
                    "list",
                    "inspect",
                    "create",
                    "attach",
                    "detach",
                    "configure",
                    "close",
                ],
            ),
            (
                "tdev_task",
                vec![
                    "list",
                    "open",
                    "start",
                    "compose",
                    "integrate",
                    "inspect",
                    "close",
                ],
            ),
            ("tdev_project", vec!["list", "inspect", "connect", "create"]),
            ("tdev_read", vec![]),
            ("tdev_edit", vec![]),
            ("tdev_operation", vec!["status"]),
        ];
        let mut tools = Vec::new();
        let mut inputs = BTreeMap::new();
        for (name, actions) in selected {
            let original = contract.schema()["x-tools"]
                .as_array()
                .unwrap()
                .iter()
                .find(|t| t["name"] == name)
                .ok_or_else(|| Fault::new("CONTRACT"))?;
            let mut tool = expand(original, contract.schema(), 0)?;
            if !actions.is_empty()
                && !restrict(
                    &mut tool["inputSchema"]["properties"]["request"],
                    &actions,
                    name == "tdev_task",
                )
            {
                return Err(Fault::new("CONTRACT"));
            }
            tool["description"] = json!(match name {
                "tdev_task" =>
                    "Open, start, compose, integrate, list, inspect and close owned source tasks in local projects. Start can import final checkout bytes while preserving its index/files/refs. Compose exact same-branch source checkpoints; integrate a frozen source delta atomically or inspect and resolve conflicts. Published-task continuation is not available yet.",
                "tdev_project" =>
                    "List and inspect granted projects; connect or create local projects within current delegated policy.",
                "tdev_operation" =>
                    "Observe accepted source, workspace and local project operations by operation or request identity with a bounded wait.",
                _ => original["description"]
                    .as_str()
                    .unwrap_or("Source development tool."),
            });
            inputs.insert(name.into(), compile(&tool["inputSchema"])?);
            tools.push(tool);
        }
        Ok(Self { tools, inputs })
    }
    pub fn input<'a>(&self, name: &str, arguments: &'a Value) -> Result<&'a Value> {
        if !self.inputs.get(name).is_some_and(|v| v.is_valid(arguments)) {
            return Err(Fault::new("SCHEMA"));
        }
        arguments.get("request").ok_or_else(|| Fault::new("SCHEMA"))
    }
    pub fn contains(&self, name: &str) -> bool {
        self.inputs.contains_key(name)
    }
}

impl Contract {
    pub fn embedded() -> Result<Self> {
        let schema: Value = serde_json::from_str(include_str!("../contracts/tools.schema.json"))
            .map_err(|_| Fault::new("CONTRACT"))?;
        let config: Value = serde_json::from_str(include_str!("../contracts/config.schema.json"))
            .map_err(|_| Fault::new("CONTRACT"))?;
        Self::new(schema, &config)
    }

    fn new(schema: Value, config: &Value) -> Result<Self> {
        let definitions = schema
            .get("$defs")
            .filter(|v| v.is_object())
            .ok_or_else(|| Fault::new("CONTRACT"))?;
        let advertised = schema
            .get("x-tools")
            .and_then(Value::as_array)
            .ok_or_else(|| Fault::new("CONTRACT"))?;
        let mut tools = BTreeMap::new();
        for tool in advertised {
            let name = tool
                .get("name")
                .and_then(Value::as_str)
                .ok_or_else(|| Fault::new("CONTRACT"))?;
            let with_definitions = |field: &str| -> Result<Value> {
                let mut root = tool
                    .get(field)
                    .filter(|v| v.is_object())
                    .cloned()
                    .ok_or_else(|| Fault::new("CONTRACT"))?;
                root["$defs"] = definitions.clone();
                root["$schema"] = json!("https://json-schema.org/draft/2020-12/schema");
                Ok(root)
            };
            let validator = Tool {
                input: compile(&with_definitions("inputSchema")?)?,
                output: compile(&with_definitions("outputSchema")?)?,
            };
            if tools.insert(name.into(), validator).is_some() {
                return Err(Fault::new("CONTRACT"));
            }
        }
        Ok(Self {
            schema,
            tools,
            config: compile(config)?,
        })
    }

    /// Canonical document, not an assertion that every described handler is
    /// implemented. Discovery must select implemented capabilities explicitly.
    pub fn schema(&self) -> &Value {
        &self.schema
    }

    /// Require the exact advertised arguments.request envelope. Does not insert
    /// defaults or mutate the instance; fingerprints retain original numeric forms.
    pub fn input<'a>(&self, tool: &str, arguments: &'a Value) -> Result<&'a Value> {
        let validator = self.tools.get(tool).ok_or_else(|| Fault::new("SCHEMA"))?;
        if !validator.input.is_valid(arguments) {
            return Err(Fault::new("SCHEMA"));
        }
        arguments.get("request").ok_or_else(|| Fault::new("SCHEMA"))
    }

    pub fn output(&self, tool: &str, value: &Value) -> Result<()> {
        let validator = self
            .tools
            .get(tool)
            .ok_or_else(|| Fault::new("CONTRACT_OUTPUT"))?;
        if !validator.output.is_valid(value) {
            return Err(Fault::new("CONTRACT_OUTPUT"));
        }
        Ok(())
    }

    /// Schema shape only: current credential uniqueness, enrollment identity and
    /// principal policy are owned by the eventual admission/config boundary.
    pub fn config(&self, value: &Value) -> Result<()> {
        if !self.config.is_valid(value) {
            return Err(Fault::new("CONFIG"));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity;

    #[test]
    fn every_canonical_input_family_accepts_examples_and_rejects_added_authority() {
        let contract = Contract::embedded().unwrap();
        assert_eq!(contract.tools.len(), 13);
        let examples = contract.schema()["x-examples"].as_array().unwrap();
        for example in examples {
            let name = example["tool"].as_str().unwrap();
            let request = &example["input"];
            let arguments = json!({"request": request});
            assert_eq!(contract.input(name, &arguments).unwrap(), request);
            let mut altered = arguments.clone();
            altered["request"]["adminApproved"] = json!(true);
            assert_eq!(contract.input(name, &altered).unwrap_err().code, "SCHEMA");
            assert!(contract.input(name, request).is_err());
        }
    }

    #[test]
    fn integer_numeric_forms_are_accepted_without_rewriting_request_identity() {
        let contract = Contract::embedded().unwrap();
        let integer =
            r#"{"request":{"taskId":"task","queries":[{"action":"file","path":"a","offset":1}]}}"#;
        let float = integer.replace("\"offset\":1", "\"offset\":1.0");
        let exponent = integer.replace("\"offset\":1", "\"offset\":1e0");
        for text in [integer, &float, &exponent] {
            let arguments = serde_json::from_str(text).unwrap();
            contract.input("tdev_read", &arguments).unwrap();
        }
        assert_ne!(
            identity::Value::parse(integer)
                .unwrap()
                .fingerprint()
                .unwrap(),
            identity::Value::parse(&float)
                .unwrap()
                .fingerprint()
                .unwrap()
        );
        assert_eq!(
            identity::Value::parse(&float)
                .unwrap()
                .fingerprint()
                .unwrap(),
            identity::Value::parse(&exponent)
                .unwrap()
                .fingerprint()
                .unwrap()
        );
        // The wire contract intentionally has no maximum for offsets; a Rust
        // usize/u64 decoder must not silently narrow this accepted representation.
        let large = integer.replace(
            "\"offset\":1",
            "\"offset\":1000000000000000000000000000000000000000",
        );
        contract
            .input("tdev_read", &serde_json::from_str(&large).unwrap())
            .unwrap();
        for invalid in ["1.5", "-1", "true", "null"] {
            let text = integer.replace("\"offset\":1", &format!("\"offset\":{invalid}"));
            assert!(
                contract
                    .input("tdev_read", &serde_json::from_str(&text).unwrap())
                    .is_err(),
                "{invalid}"
            );
        }
    }

    #[test]
    fn envelope_alternatives_nulls_bounds_and_unknown_tools_fail_closed() {
        let contract = Contract::embedded().unwrap();
        let status = json!({"request":{"action":"status","lookupRequestId":"original"}});
        contract.input("tdev_operation", &status).unwrap();
        for arguments in [
            json!({"request": null}),
            json!({"request": {"action": "status"}}),
            json!({"request":{"action":"status","operationId":"op","lookupRequestId":"original"}}),
            json!({"request":{"action":"status","operationId":"op","waitMs":30001}}),
            json!({"request":{"action":"status","operationId":"op"},"operationId":"op"}),
        ] {
            assert!(
                contract.input("tdev_operation", &arguments).is_err(),
                "{arguments}"
            );
        }
        assert!(contract.input("missing", &status).is_err());
        let unknown = json!({"ok":true,"result":{"status":"succeeded"}});
        assert!(contract.output("tdev_operation", &unknown).is_err());
        let failure = json!({"ok":false,"error":{"code":"PERMISSION_DENIED","message":"Denied","effect":"none"}});
        for name in contract.tools.keys() {
            contract.output(name, &failure).unwrap();
        }
    }

    #[test]
    fn external_network_and_file_references_cannot_be_retrieved() {
        for reference in ["https://example.invalid/schema.json", "file:///etc/passwd"] {
            assert_eq!(
                compile(&json!({"$ref":reference})).err().unwrap().code,
                "CONTRACT"
            );
        }
    }

    #[test]
    fn config_schema_and_unicode_character_bounds_use_the_canonical_contract() {
        let contract = Contract::embedded().unwrap();
        let config = json!({"version":1,"principals":{"A non-ASCII principal 한글":{"tokenHash":"a".repeat(64),"repos":{}}},"repositories":{}});
        contract.config(&config).unwrap();
        let mut unknown = config;
        unknown["authority"] = json!("operator");
        assert!(contract.config(&unknown).is_err());
        let request = json!({"request":{"requestId":"edit","taskId":"task","expected":"a".repeat(40),"edits":[{"action":"put","path":"한글😀","before":null,"content":"한글😀"}]}});
        contract.input("tdev_edit", &request).unwrap();
        for (length, valid) in [(4096, true), (4097, false)] {
            let mut request = request.clone();
            request["request"]["edits"][0]["path"] = json!("😀".repeat(length));
            assert_eq!(contract.input("tdev_edit", &request).is_ok(), valid);
        }
    }
}
