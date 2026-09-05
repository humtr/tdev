/**
 * Deployment slot for the immutable repository context used by D0046.
 *
 * The provider deployment helper replaces this module in the upload bundle
 * with a source-bound, compressed tree generated from the exact published
 * commit. Keeping the source slot small avoids putting a multi-megabyte Git
 * tree in a Worker environment variable or in the MCP request path.
 */
export async function loadMcpTrialBaseTree() {
  const error = new Error('D0046 deployment base-tree module is not bound');
  error.code = 'mcp_base_tree_unbound';
  throw error;
}

// The deployment graph replaces this module with a generated source-bound
// module that exports the real values.  Keeping the placeholders here lets
// the Worker validate the small binding without decoding the tree during
// discovery requests in source-level tests.
export const MCP_TRIAL_BASE_COMMIT_OID = null;
export const MCP_TRIAL_BASE_DIGEST = null;
