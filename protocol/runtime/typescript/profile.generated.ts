// Code generated from protocol/profiles/tdev.m1.release-profile.json by tools/generate. DO NOT EDIT.

import type { ReleaseProfile } from "./profile.ts";

export const GENERATED_M1_RELEASE_PROFILE = {
  "profileVersion": 1,
  "profileId": "tdev.m1.default",
  "ingress": {
    "maxBodyBytes": 1048576,
    "maxJsonDepth": 64,
    "maxJsonTokens": 100000,
    "maxObjectMembers": 4096,
    "maxArrayItems": 10000,
    "maxStringCodePoints": 262144,
    "maxNumberDigits": 1024,
    "maxExponentMagnitude": 10000
  },
  "output": {
    "maxMutationResponseBytes": 262144,
    "maxRenderedTextBytes": 65536,
    "maxArtifactChunkBytes": 262144
  },
  "pagination": {
    "defaultPageSize": 20,
    "maxPageSize": 100,
    "cursorTtlSeconds": 3600
  },
  "quota": {
    "maxTasksPerCase": 10000,
    "maxAttemptsPerTask": 100,
    "maxEventsPerCase": 100000
  },
  "retention": {
    "r2OrphanGraceDays": 30,
    "eventCompaction": "disabled",
    "mutationReceiptRetention": "case_or_recovery",
    "referencedEvidenceCleanup": "forbidden"
  }
} as const satisfies ReleaseProfile;

export const GENERATED_M1_RELEASE_PROFILE_DIGEST = "8a2f325b4ff2376a59f02ec0c42a25872f231260535eedeead932e6e35af113d";
