# Immutable-source build acceptance repair

At 2026-09-12T03:58Z native reviewed candidate
50ec0a051420f40ffea4057ee07b7f6a0dd2784a (prepared result
d459968ad4a94c629de4bd42481de3d7) passed core but failed joined integration.
`job_s40_4d3aa3618c` ended before any provider launch or publication.

The first repair correctly moved generated test artifacts outside read-only
/source. That exposed a product build defect, not an environment permission issue:
tools/build-edge.mjs generated an Ajv standalone module in arbitrary scratch but
assumed a node_modules ancestor existed there. Esbuild could not resolve the
fixed ajv/dist/runtime/ucs2length helper. Required source/root protections remain.

The build explicitly supplies its own locked node_modules resolution path.
The next native replay at 4d8b794f3fd28d7988e927aac9cd6024eb68e48a (job_s4f_ef0b31613e)
passed core but the stronger cross-directory assertion failed before any provider
launch. A bounded two-build diagnostic (job_s4p_e7ebdd758f) located the first differing
bytes in esbuild's generated module-initializer key: the temporary buffer.mjs path.
Whitespace-only minification removed comments but correctly did not erase these keys.
Generated buffer, validator and contract modules now use fixed virtual identities;
resolveDir and absWorkingDir are pinned to the exact approved build root. No source
write, output-directory dependency discovery or post-build byte rewriting is used. The regression runs builds at two independently
named scratch directories, compares the exact artifact digest across both and a
same-directory repeat, then verifies schema/tool metadata and executable exports.
This tests the output-location-independent identity required by immutable release
artifacts. No missing dependency is marked external or dynamically loaded on edge.

Official API references for the selected options: esbuild API Node paths and Minify
sections (esbuild.github.io/api/, observed 2026-09-12). Verification results must be
rebound from the new prepared candidate and actual hosted run; the failed candidate
and earlier qualification are not relabeled PASS or production receipts.
