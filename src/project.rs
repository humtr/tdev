//! Projection of currently enrolled project capabilities.
use crate::{
    admission::{Context, Repository},
    application::Application,
    model::*,
    wire,
};
use serde_json::{Value, json};
fn public(repo: &Repository) -> Value {
    let configured = repo.config["defaultRef"]
        .as_str()
        .filter(|r| repo.refs.iter().any(|allowed| allowed.as_str() == *r));
    let default = configured
        .or_else(|| {
            if repo.refs.len() == 1 {
                repo.refs.first().map(BranchRef::as_str)
            } else {
                None
            }
        })
        .unwrap_or("");
    json!({"repo":repo.name,"name":repo.config["name"].as_str().or_else(||repo.config["remote"].as_str()).unwrap_or(&repo.name),"identity":repo.config["identity"],"defaultRef":default,"managedRefNamespaces":repo.namespaces,"policy":null,"provider":repo.config["kind"],"checkout":repo.config["checkout"],"validationTimeoutSeconds":repo.config.get("validationTimeoutSeconds").cloned().unwrap_or(json!(300))})
}
pub fn call(app: &Application, context: &Context, input: &Value) -> Result<Value> {
    match wire::string(input, "action")? {
        "list" => Ok(
            json!({"projects":context.repositories().iter().map(|name|context.repository(name,None).map(|repo|public(&repo))).collect::<Result<Vec<_>>>()?,"policies":[]}),
        ),
        "inspect" => {
            let repo = context.repository(wire::string(input, "repo")?, None)?;
            let mut value = public(&repo);
            let observation: Result<()> = (|| {
                let git = app.git(&repo)?;
                git.verify_identity()?;
                if let Some(branch) = repo
                    .refs
                    .iter()
                    .find(|r| Some(r.as_str()) == value["defaultRef"].as_str())
                {
                    value["head"] = json!(git.head(branch)?);
                }
                Ok(())
            })();
            if let Err(error) = observation {
                value["error"] = json!(error);
            }
            Ok(value)
        }
        _ => Err(Fault::new("SCHEMA")),
    }
}
