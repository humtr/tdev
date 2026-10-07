//! Artifact admission/provenance over the original source, Git and receipt owners.
pub mod acquisition;
mod recipe;
use crate::{
    admission::{Context, Repository},
    application::Application,
    execution::api,
    git::FileMode,
    identity,
    model::*,
    wire,
};
use serde_json::{Value, json};
use sha2::{Digest as _, Sha256};
use std::io::{self, Write};

struct Hash(Sha256);
impl Write for Hash {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.0.update(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

fn policy(repo: &Repository) -> Result<Digest> {
    identity::Value::parse(
        &json!({"subject":"artifact",
        "command":repo.config.get("artifactValidation").unwrap_or(&repo.config["validation"]),
        "executor":repo.config.get("executor").cloned().unwrap_or(json!({"kind":"native"})),
        "toolingEnvironment":repo.config.get("toolingEnvironment").cloned().unwrap_or(json!({}))})
        .to_string(),
    )?
    .fingerprint()
}

pub(crate) fn call(app: &Application, context: &Context, input: &Value) -> Result<Value> {
    if input["action"] != "inspectRecipe" {
        return Err(Fault::new("SCHEMA"));
    }
    let receipt = app
        .store()?
        .receipt(
            &context.principal,
            Some(wire::string(input, "validationId")?),
            None,
        )?
        .ok_or_else(|| Fault::new("OPERATION_NOT_FOUND"))?;
    app.authorize_receipt(context, &receipt)?;
    let proof = api::validated(&receipt)?;
    let (_, repo) = app.task(
        context,
        receipt
            .operation
            .task
            .as_ref()
            .ok_or_else(|| Fault::new("STATE_FORMAT"))?
            .as_str(),
    )?;
    if api::policy(&repo)? != proof.policy {
        return Err(Fault::new("VALIDATION_POLICY_CHANGED"));
    }
    let candidate = proof
        .candidate
        .as_ref()
        .ok_or_else(|| Fault::new("VALIDATION_REQUIRED"))?;
    let git = app.git(&repo)?;
    git.check_candidate(&proof.checkpoint, &proof.base, candidate)?;
    let tree = git.tree(candidate)?;
    let entries = git.entries(candidate)?;
    let name = input["path"].as_str().unwrap_or("tdev-package.json");
    recipe::path(name, false)?;
    let regular = |name: &str, code: &str| {
        entries
            .get(&SourcePath::new(name)?)
            .filter(|e| matches!(e.mode, FileMode::File | FileMode::Executable))
            .ok_or_else(|| Fault::message(code, name))
    };
    let entry = regular(name, "ARTIFACT_RECIPE_MISSING")?;
    let size = git.blob_size(&entry.blob)?;
    if size > recipe::RECIPE_BYTES {
        return Err(Fault::message(
            "ARTIFACT_RECIPE_LIMIT",
            format!(
                "budget=artifactRecipeBytes configured={} observed={size}",
                recipe::RECIPE_BYTES
            ),
        ));
    }
    let raw = git.blob(&entry.blob)?;
    let recipe = recipe::parse(&app.contract, &raw)?;
    let mut inputs = serde_json::Map::new();
    for name in recipe["inputs"].as_array().unwrap() {
        let name = name.as_str().unwrap();
        let entry = regular(name, "ARTIFACT_INPUT_MISSING")?;
        let mut hash = Hash(Sha256::new());
        let size = git.blob_to(&entry.blob, &mut hash)?;
        inputs.insert(
            name.to_owned(),
            json!({"mode":entry.mode,"size":size,"sha256":format!("{:x}",hash.0.finalize())}),
        );
    }
    let mut value = json!({"validationId":receipt.operation.id,"candidate":candidate,
        "sourcePolicy":proof.policy,"artifactPolicy":policy(&repo)?,
        "source":{"repositoryIdentity":repo.identity()?,"tree":tree,"recipePath":name,"recipeDigest":identity::digest(&raw)?,"inputs":inputs},
        "recipe":recipe,"buildExecuted":false});
    value["bindingDigest"] = json!(identity::Value::parse(&value.to_string())?.fingerprint()?);
    app.contract
        .definition("ArtifactRecipeInspection", &value)?;
    Ok(value)
}
