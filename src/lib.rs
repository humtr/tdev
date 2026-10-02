//! Domain types and durable mechanisms for tdev.
pub mod identity;
pub mod model;
pub mod storage;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
