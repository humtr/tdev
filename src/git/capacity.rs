//! Source content budgets are independent of utility diagnostics and model responses.
use crate::model::{Fault, Result};

pub const SOURCE_BYTES: usize = 512 * 1024 * 1024;
pub const FILE_BYTES: usize = SOURCE_BYTES;
pub const SOURCE_FILES: usize = 100000;
pub const PACK_BYTES: usize = 1024 * 1024 * 1024;
pub const METADATA_BYTES: usize = 48 * 1024 * 1024;

pub(crate) fn check(code: &str, budget: &str, configured: usize, observed: usize) -> Result<()> {
    if observed > configured {
        return Err(Fault::message(
            code,
            format!("budget={budget} configured={configured} observed={observed}"),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn content_and_binary_transport_follow_the_contract_owner() {
        let contract: serde_json::Value =
            serde_json::from_str(include_str!("../../contracts/tools.schema.json")).unwrap();
        let budgets = &contract["x-semantics"]["execution"];
        assert_eq!(budgets["sourceLimitBytes"], SOURCE_BYTES);
        assert_eq!(budgets["sourceFileLimitBytes"], FILE_BYTES);
        assert_eq!(budgets["sourceFileLimitCount"], SOURCE_FILES);
        assert_eq!(budgets["transferLimitBytes"], PACK_BYTES);
        assert_eq!(budgets["metadataLimitBytes"], METADATA_BYTES);
    }
}
