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
