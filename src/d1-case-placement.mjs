import {
  ContractError,
  assertIdentifier,
  assertRecordShape,
  canonicalClone,
  canonicalJson,
  strictJsonParse,
} from './canonical.mjs';
import { validateCasePlacement } from './casedo-authority.mjs';

export const D1_CASE_PLACEMENT_PROFILE = 'tdev.case-placement.d1.v1';
export const D1_CASE_PLACEMENT_SCHEMA_VERSION = 1;

const MAX_PLACEMENT_JSON_BYTES = 32 * 1024;
const textEncoder = new TextEncoder();

function utf8Bytes(value) {
  return textEncoder.encode(value).byteLength;
}

function assertDatabase(database) {
  if (!database || typeof database.prepare !== 'function' || typeof database.batch !== 'function') {
    throw new ContractError(
      'invalid_placement_store',
      'D1 placement authority requires prepare() and batch()',
    );
  }
  return database;
}

function bind(database, sql, ...values) {
  const prepared = database.prepare(sql);
  if (!prepared || typeof prepared !== 'object') {
    throw new ContractError(
      'invalid_placement_store',
      'D1 placement authority requires prepared statements',
    );
  }
  if (values.length === 0) return prepared;
  if (typeof prepared.bind !== 'function') {
    throw new ContractError(
      'invalid_placement_store',
      'D1 placement authority requires bindable parameterized statements',
    );
  }
  return prepared.bind(...values);
}

function assertResult(result, label) {
  if (!result || result.success !== true) {
    throw new ContractError(
      'placement_store_unavailable',
      `${label} did not return a successful D1 result`,
    );
  }
  return result;
}

function resultRows(result, label) {
  assertResult(result, label);
  if (!Array.isArray(result.results)) {
    throw new ContractError(
      'placement_store_unavailable',
      `${label} did not return D1 result rows`,
    );
  }
  return result.results;
}

function validateMetaResult(result) {
  const rows = resultRows(result, 'placement metadata lookup');
  if (rows.length !== 1) {
    throw new ContractError(
      'incompatible_placement_store',
      'D1 placement metadata is absent or ambiguous',
    );
  }
  const row = rows[0];
  if (
    row?.profile !== D1_CASE_PLACEMENT_PROFILE ||
    Number(row?.schema_version) !== D1_CASE_PLACEMENT_SCHEMA_VERSION
  ) {
    throw new ContractError(
      'incompatible_placement_store',
      'D1 placement profile/schema is incompatible',
      {
        expectedProfile: D1_CASE_PLACEMENT_PROFILE,
        expectedSchemaVersion: D1_CASE_PLACEMENT_SCHEMA_VERSION,
      },
    );
  }
}

function parseStoredPlacement(row) {
  if (!row || typeof row !== 'object') {
    throw new ContractError('placement_store_corrupt', 'D1 placement row is invalid');
  }
  if (typeof row.placement_json !== 'string' || utf8Bytes(row.placement_json) > MAX_PLACEMENT_JSON_BYTES) {
    throw new ContractError('placement_store_corrupt', 'D1 placement JSON is missing or exceeds its bound');
  }

  let parsed;
  try {
    parsed = strictJsonParse(row.placement_json, { maxBytes: MAX_PLACEMENT_JSON_BYTES });
    if (canonicalJson(parsed) !== row.placement_json) {
      throw new ContractError('placement_store_corrupt', 'D1 placement JSON is not canonical');
    }
    const placement = validateCasePlacement(parsed);
    if (
      row.case_id !== placement.caseId ||
      Number(row.placement_generation) !== placement.placementGeneration ||
      row.placement_digest !== placement.placementDigest
    ) {
      throw new ContractError('placement_store_corrupt', 'D1 placement row columns disagree with its canonical record');
    }
    return placement;
  } catch (cause) {
    if (cause?.code === 'placement_store_corrupt') throw cause;
    throw new ContractError(
      'placement_store_corrupt',
      'D1 placement row failed canonical placement validation',
      {},
      { cause },
    );
  }
}

function rowFromResult(result, label) {
  const rows = resultRows(result, label);
  if (rows.length === 0) return null;
  if (rows.length !== 1) {
    throw new ContractError('placement_store_corrupt', `${label} returned multiple rows for one CaseId`);
  }
  return parseStoredPlacement(rows[0]);
}

export class D1CasePlacementAuthority {
  constructor(database) {
    this.database = assertDatabase(database);
  }

  async #batch(statements, label) {
    let results;
    try {
      results = await this.database.batch(statements);
    } catch (cause) {
      throw new ContractError(
        'placement_store_unavailable',
        `${label} failed before a placement result could be trusted`,
        {},
        { cause },
      );
    }
    if (!Array.isArray(results) || results.length !== statements.length) {
      throw new ContractError(
        'placement_store_unavailable',
        `${label} returned an unexpected D1 batch result`,
      );
    }
    results.forEach((result, index) => assertResult(result, `${label} statement ${index + 1}`));
    return results;
  }

  async get(caseId) {
    assertIdentifier(caseId, 'placement.caseId');
    const statements = [
      bind(
        this.database,
        'SELECT profile, schema_version FROM tdev_case_placement_meta WHERE singleton = 1',
      ),
      bind(
        this.database,
        `SELECT case_id, placement_generation, placement_digest, placement_json
           FROM tdev_case_placements WHERE case_id = ?1 LIMIT 1`,
        caseId,
      ),
    ];
    const results = await this.#batch(statements, 'D1 placement read');
    validateMetaResult(results[0]);
    return rowFromResult(results[1], 'placement lookup');
  }

  async elect(input) {
    assertRecordShape(input, ['placement'], [], 'D1 placement election');
    const placement = validateCasePlacement(input.placement);
    const placementJson = canonicalJson(placement);
    if (utf8Bytes(placementJson) > MAX_PLACEMENT_JSON_BYTES) {
      throw new ContractError(
        'placement_record_too_large',
        'Canonical D1 placement record exceeds its storage bound',
        { maxBytes: MAX_PLACEMENT_JSON_BYTES },
      );
    }

    const statements = [
      bind(
        this.database,
        'SELECT profile, schema_version FROM tdev_case_placement_meta WHERE singleton = 1',
      ),
      bind(
        this.database,
        `INSERT INTO tdev_case_placements(
           case_id, placement_generation, placement_digest, placement_json
         )
         SELECT ?1, ?2, ?3, ?4
         WHERE EXISTS (
           SELECT 1 FROM tdev_case_placement_meta
           WHERE singleton = 1 AND profile = ?5 AND schema_version = ?6
         )
         ON CONFLICT(case_id) DO NOTHING`,
        placement.caseId,
        placement.placementGeneration,
        placement.placementDigest,
        placementJson,
        D1_CASE_PLACEMENT_PROFILE,
        D1_CASE_PLACEMENT_SCHEMA_VERSION,
      ),
      bind(
        this.database,
        `SELECT case_id, placement_generation, placement_digest, placement_json
           FROM tdev_case_placements WHERE case_id = ?1 LIMIT 1`,
        placement.caseId,
      ),
    ];

    const results = await this.#batch(statements, 'D1 placement election');
    validateMetaResult(results[0]);
    const elected = rowFromResult(results[2], 'placement election lookup');
    if (elected === null) {
      throw new ContractError(
        'placement_store_corrupt',
        'D1 placement election committed no readable winner under a compatible profile',
      );
    }
    if (elected.placementDigest !== placement.placementDigest) {
      throw new ContractError(
        'placement_conflict',
        `Case ${placement.caseId} already has a competing elected placement`,
        {
          caseId: placement.caseId,
          electedPlacementDigest: elected.placementDigest,
          proposedPlacementDigest: placement.placementDigest,
        },
      );
    }
    return Object.freeze(canonicalClone(elected));
  }

  async requireElected(input) {
    assertRecordShape(input, ['placement'], [], 'D1 elected placement check');
    const proposed = validateCasePlacement(input.placement);
    const elected = await this.get(proposed.caseId);
    if (elected === null) {
      throw new ContractError(
        'placement_not_elected',
        `Case ${proposed.caseId} has no durable D1 placement election`,
      );
    }
    if (elected.placementDigest !== proposed.placementDigest) {
      throw new ContractError(
        'placement_conflict',
        `Case ${proposed.caseId} is not elected at the proposed placement`,
        {
          caseId: proposed.caseId,
          electedPlacementDigest: elected.placementDigest,
          proposedPlacementDigest: proposed.placementDigest,
        },
      );
    }
    return Object.freeze(canonicalClone(elected));
  }
}
