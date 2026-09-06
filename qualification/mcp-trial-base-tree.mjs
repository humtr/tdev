/**
 * Deployment slot for the immutable repository context used by D0046.
 * The deployer replaces this module with a source-bound selected tree and
 * complete manifest metadata generated from one exact commit and scope.
 */
export async function loadMcpTrialBaseTree() {
  const error = new Error('D0046 deployment base-tree module is not bound');
  error.code = 'mcp_base_tree_unbound';
  throw error;
}

export async function loadMcpTrialManifest() {
  const error = new Error('D0046 deployment manifest module is not bound');
  error.code = 'mcp_base_manifest_unbound';
  throw error;
}

export async function loadMcpTrialLazyContext() {
  const error = new Error('D0046 deployment lazy context module is not bound');
  error.code = 'mcp_lazy_context_unbound';
  throw error;
}

export const MCP_TRIAL_BASE_COMMIT_OID = null;
export const MCP_TRIAL_BASE_TREE_OID = null;
export const MCP_TRIAL_BASE_OBJECT_FORMAT = null;
export const MCP_TRIAL_BASE_DIGEST = null;
export const MCP_TRIAL_REPOSITORY_BASE_IDENTITY = null;
export const MCP_TRIAL_SCOPE = null;
export const MCP_TRIAL_SCOPE_DIGEST = null;
export const MCP_TRIAL_MANIFEST_DIGEST = null;
