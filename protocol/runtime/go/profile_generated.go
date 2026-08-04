// Code generated from protocol/profiles/tdev.m1.release-profile.json by tools/generate. DO NOT EDIT.

package protocolruntime

const M1ReleaseProfileDigest = "8a2f325b4ff2376a59f02ec0c42a25872f231260535eedeead932e6e35af113d"

var generatedM1ReleaseProfile = ReleaseProfile{
	ProfileVersion: 1,
	ProfileID:      "tdev.m1.default",
	Ingress:        IngressPolicy{MaxBodyBytes: 1048576, MaxJSONDepth: 64, MaxJSONTokens: 100000, MaxObjectMembers: 4096, MaxArrayItems: 10000, MaxStringCodePoints: 262144, MaxNumberDigits: 1024, MaxExponentMagnitude: 10000},
	Output:         OutputPolicy{MaxMutationResponseBytes: 262144, MaxRenderedTextBytes: 65536, MaxArtifactChunkBytes: 262144},
	Pagination:     PaginationPolicy{DefaultPageSize: 20, MaxPageSize: 100, CursorTTLSeconds: 3600},
	Quota:          QuotaPolicy{MaxTasksPerCase: 10000, MaxAttemptsPerTask: 100, MaxEventsPerCase: 100000},
	Retention:      RetentionPolicy{R2OrphanGraceDays: 30, EventCompaction: "disabled", MutationReceiptRetention: "case_or_recovery", ReferencedEvidenceCleanup: "forbidden"},
}
