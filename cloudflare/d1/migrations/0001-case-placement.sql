-- D0019 r2 placement meta-authority schema.
-- This database owns only the durable CaseId -> elected Cloudflare placement binding.
-- It is not a Case semantic store, delivery queue, or query/locator projection.

CREATE TABLE tdev_case_placement_meta (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  profile TEXT NOT NULL CHECK (profile = 'tdev.case-placement.d1.v1'),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1)
);

INSERT INTO tdev_case_placement_meta(singleton, profile, schema_version)
VALUES (1, 'tdev.case-placement.d1.v1', 1);

CREATE TABLE tdev_case_placements (
  case_id TEXT PRIMARY KEY NOT NULL,
  placement_generation INTEGER NOT NULL CHECK (placement_generation > 0),
  placement_digest TEXT NOT NULL,
  placement_json TEXT NOT NULL
);
