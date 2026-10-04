//! Domain types and durable mechanisms for tdev.
pub mod admission;
pub mod application;
pub mod contract;
pub mod git;
pub mod identity;
pub mod model;
pub mod project;
pub mod provider;
pub mod source;
pub mod storage;
pub mod supervisor;
pub mod transport;
pub mod wire;
pub mod workspace;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
