import {
  GENERATED_M1_RELEASE_PROFILE,
  GENERATED_M1_RELEASE_PROFILE_DIGEST,
} from "./profile.generated.ts";

export type ReleaseProfile = Readonly<{
  profileVersion: number;
  profileId: string;
  ingress: Readonly<{
    maxBodyBytes: number;
    maxJsonDepth: number;
    maxJsonTokens: number;
    maxObjectMembers: number;
    maxArrayItems: number;
    maxStringCodePoints: number;
    maxNumberDigits: number;
    maxExponentMagnitude: number;
  }>;
  output: Readonly<{
    maxMutationResponseBytes: number;
    maxRenderedTextBytes: number;
    maxArtifactChunkBytes: number;
  }>;
  pagination: Readonly<{
    defaultPageSize: number;
    maxPageSize: number;
    cursorTtlSeconds: number;
  }>;
  quota: Readonly<{
    maxTasksPerCase: number;
    maxAttemptsPerTask: number;
    maxEventsPerCase: number;
  }>;
  retention: Readonly<{
    r2OrphanGraceDays: number;
    eventCompaction: "disabled";
    mutationReceiptRetention: "case_or_recovery";
    referencedEvidenceCleanup: "forbidden";
  }>;
}>;

const HARD_CEILINGS = Object.freeze({
  maxBodyBytes: 4_194_304,
  maxJsonDepth: 128,
  maxJsonTokens: 500_000,
  maxObjectMembers: 16_384,
  maxArrayItems: 100_000,
  maxStringCodePoints: 1_048_576,
  maxNumberDigits: 4_096,
  maxExponentMagnitude: 10_000,
  maxMutationResponseBytes: 1_048_576,
  maxRenderedTextBytes: 262_144,
  maxArtifactChunkBytes: 1_048_576,
  maxPageSize: 500,
  cursorTtlSeconds: 86_400,
  maxTasksPerCase: 100_000,
  maxAttemptsPerTask: 1_000,
  maxEventsPerCase: 1_000_000,
  r2OrphanGraceDays: 3_650,
});

function integer(path: string, value: number, minimum: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`INVALID_RELEASE_PROFILE: ${path} is outside its versioned bounds`);
  }
}

export function validateReleaseProfile(profile: ReleaseProfile): ReleaseProfile {
  if (profile.profileVersion !== 1 || profile.profileId !== "tdev.m1.default") {
    throw new Error("INVALID_RELEASE_PROFILE: unsupported profile identity");
  }
  integer("ingress.maxBodyBytes", profile.ingress.maxBodyBytes, 1, HARD_CEILINGS.maxBodyBytes);
  integer("ingress.maxJsonDepth", profile.ingress.maxJsonDepth, 1, HARD_CEILINGS.maxJsonDepth);
  integer("ingress.maxJsonTokens", profile.ingress.maxJsonTokens, 1, HARD_CEILINGS.maxJsonTokens);
  integer("ingress.maxObjectMembers", profile.ingress.maxObjectMembers, 1, HARD_CEILINGS.maxObjectMembers);
  integer("ingress.maxArrayItems", profile.ingress.maxArrayItems, 1, HARD_CEILINGS.maxArrayItems);
  integer("ingress.maxStringCodePoints", profile.ingress.maxStringCodePoints, 1, HARD_CEILINGS.maxStringCodePoints);
  integer("ingress.maxNumberDigits", profile.ingress.maxNumberDigits, 1, HARD_CEILINGS.maxNumberDigits);
  integer("ingress.maxExponentMagnitude", profile.ingress.maxExponentMagnitude, 1, HARD_CEILINGS.maxExponentMagnitude);
  integer("output.maxMutationResponseBytes", profile.output.maxMutationResponseBytes, 1, HARD_CEILINGS.maxMutationResponseBytes);
  integer("output.maxRenderedTextBytes", profile.output.maxRenderedTextBytes, 1, HARD_CEILINGS.maxRenderedTextBytes);
  integer("output.maxArtifactChunkBytes", profile.output.maxArtifactChunkBytes, 1, HARD_CEILINGS.maxArtifactChunkBytes);
  integer("pagination.defaultPageSize", profile.pagination.defaultPageSize, 1, profile.pagination.maxPageSize);
  integer("pagination.maxPageSize", profile.pagination.maxPageSize, 1, HARD_CEILINGS.maxPageSize);
  integer("pagination.cursorTtlSeconds", profile.pagination.cursorTtlSeconds, 60, HARD_CEILINGS.cursorTtlSeconds);
  integer("quota.maxTasksPerCase", profile.quota.maxTasksPerCase, 1, HARD_CEILINGS.maxTasksPerCase);
  integer("quota.maxAttemptsPerTask", profile.quota.maxAttemptsPerTask, 1, HARD_CEILINGS.maxAttemptsPerTask);
  integer("quota.maxEventsPerCase", profile.quota.maxEventsPerCase, 1, HARD_CEILINGS.maxEventsPerCase);
  integer("retention.r2OrphanGraceDays", profile.retention.r2OrphanGraceDays, 1, HARD_CEILINGS.r2OrphanGraceDays);
  if (
    profile.retention.eventCompaction !== "disabled" ||
    profile.retention.mutationReceiptRetention !== "case_or_recovery" ||
    profile.retention.referencedEvidenceCleanup !== "forbidden"
  ) {
    throw new Error("INVALID_RELEASE_PROFILE: unsupported M1 retention policy");
  }
  return profile;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export const M1_RELEASE_PROFILE = deepFreeze(validateReleaseProfile(GENERATED_M1_RELEASE_PROFILE));
export const M1_RELEASE_PROFILE_DIGEST = GENERATED_M1_RELEASE_PROFILE_DIGEST;
