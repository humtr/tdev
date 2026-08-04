package protocolruntime

import "fmt"

type ReleaseProfile struct {
	ProfileVersion int              `json:"profileVersion"`
	ProfileID      string           `json:"profileId"`
	Ingress        IngressPolicy    `json:"ingress"`
	Output         OutputPolicy     `json:"output"`
	Pagination     PaginationPolicy `json:"pagination"`
	Quota          QuotaPolicy      `json:"quota"`
	Retention      RetentionPolicy  `json:"retention"`
}

type IngressPolicy struct {
	MaxBodyBytes         int `json:"maxBodyBytes"`
	MaxJSONDepth         int `json:"maxJsonDepth"`
	MaxJSONTokens        int `json:"maxJsonTokens"`
	MaxObjectMembers     int `json:"maxObjectMembers"`
	MaxArrayItems        int `json:"maxArrayItems"`
	MaxStringCodePoints  int `json:"maxStringCodePoints"`
	MaxNumberDigits      int `json:"maxNumberDigits"`
	MaxExponentMagnitude int `json:"maxExponentMagnitude"`
}

type OutputPolicy struct {
	MaxMutationResponseBytes int `json:"maxMutationResponseBytes"`
	MaxRenderedTextBytes     int `json:"maxRenderedTextBytes"`
	MaxArtifactChunkBytes    int `json:"maxArtifactChunkBytes"`
}

type PaginationPolicy struct {
	DefaultPageSize  int `json:"defaultPageSize"`
	MaxPageSize      int `json:"maxPageSize"`
	CursorTTLSeconds int `json:"cursorTtlSeconds"`
}

type QuotaPolicy struct {
	MaxTasksPerCase    int `json:"maxTasksPerCase"`
	MaxAttemptsPerTask int `json:"maxAttemptsPerTask"`
	MaxEventsPerCase   int `json:"maxEventsPerCase"`
}

type RetentionPolicy struct {
	R2OrphanGraceDays         int    `json:"r2OrphanGraceDays"`
	EventCompaction           string `json:"eventCompaction"`
	MutationReceiptRetention  string `json:"mutationReceiptRetention"`
	ReferencedEvidenceCleanup string `json:"referencedEvidenceCleanup"`
}

const (
	HardMaxBodyBytes             = 4_194_304
	HardMaxJSONDepth             = 128
	HardMaxJSONTokens            = 500_000
	HardMaxObjectMembers         = 16_384
	HardMaxArrayItems            = 100_000
	HardMaxStringCodePoints      = 1_048_576
	HardMaxNumberDigits          = 4_096
	HardMaxExponentMagnitude     = 10_000
	HardMaxMutationResponseBytes = 1_048_576
	HardMaxRenderedTextBytes     = 262_144
	HardMaxArtifactChunkBytes    = 1_048_576
	HardMaxPageSize              = 500
	HardMaxCursorTTLSeconds      = 86_400
	HardMaxTasksPerCase          = 100_000
	HardMaxAttemptsPerTask       = 1_000
	HardMaxEventsPerCase         = 1_000_000
	HardMaxR2OrphanGraceDays     = 3_650
)

func validateBound(path string, value, maximum int) error {
	if value < 1 || value > maximum {
		return fmt.Errorf("INVALID_RELEASE_PROFILE: %s is outside its versioned bounds", path)
	}
	return nil
}

func ValidateReleaseProfile(profile ReleaseProfile) error {
	if profile.ProfileVersion != 1 || profile.ProfileID != "tdev.m1.default" {
		return fmt.Errorf("INVALID_RELEASE_PROFILE: unsupported profile identity")
	}
	checks := []struct {
		path    string
		value   int
		maximum int
	}{
		{"ingress.maxBodyBytes", profile.Ingress.MaxBodyBytes, HardMaxBodyBytes},
		{"ingress.maxJsonDepth", profile.Ingress.MaxJSONDepth, HardMaxJSONDepth},
		{"ingress.maxJsonTokens", profile.Ingress.MaxJSONTokens, HardMaxJSONTokens},
		{"ingress.maxObjectMembers", profile.Ingress.MaxObjectMembers, HardMaxObjectMembers},
		{"ingress.maxArrayItems", profile.Ingress.MaxArrayItems, HardMaxArrayItems},
		{"ingress.maxStringCodePoints", profile.Ingress.MaxStringCodePoints, HardMaxStringCodePoints},
		{"ingress.maxNumberDigits", profile.Ingress.MaxNumberDigits, HardMaxNumberDigits},
		{"ingress.maxExponentMagnitude", profile.Ingress.MaxExponentMagnitude, HardMaxExponentMagnitude},
		{"output.maxMutationResponseBytes", profile.Output.MaxMutationResponseBytes, HardMaxMutationResponseBytes},
		{"output.maxRenderedTextBytes", profile.Output.MaxRenderedTextBytes, HardMaxRenderedTextBytes},
		{"output.maxArtifactChunkBytes", profile.Output.MaxArtifactChunkBytes, HardMaxArtifactChunkBytes},
		{"pagination.maxPageSize", profile.Pagination.MaxPageSize, HardMaxPageSize},
		{"pagination.cursorTtlSeconds", profile.Pagination.CursorTTLSeconds, HardMaxCursorTTLSeconds},
		{"quota.maxTasksPerCase", profile.Quota.MaxTasksPerCase, HardMaxTasksPerCase},
		{"quota.maxAttemptsPerTask", profile.Quota.MaxAttemptsPerTask, HardMaxAttemptsPerTask},
		{"quota.maxEventsPerCase", profile.Quota.MaxEventsPerCase, HardMaxEventsPerCase},
		{"retention.r2OrphanGraceDays", profile.Retention.R2OrphanGraceDays, HardMaxR2OrphanGraceDays},
	}
	for _, check := range checks {
		if err := validateBound(check.path, check.value, check.maximum); err != nil {
			return err
		}
	}
	if profile.Pagination.CursorTTLSeconds < 60 {
		return fmt.Errorf("INVALID_RELEASE_PROFILE: pagination.cursorTtlSeconds is below minimum")
	}
	if profile.Pagination.DefaultPageSize < 1 || profile.Pagination.DefaultPageSize > profile.Pagination.MaxPageSize {
		return fmt.Errorf("INVALID_RELEASE_PROFILE: pagination.defaultPageSize exceeds maxPageSize")
	}
	if profile.Retention.EventCompaction != "disabled" ||
		profile.Retention.MutationReceiptRetention != "case_or_recovery" ||
		profile.Retention.ReferencedEvidenceCleanup != "forbidden" {
		return fmt.Errorf("INVALID_RELEASE_PROFILE: unsupported M1 retention policy")
	}
	return nil
}

func DefaultM1ReleaseProfile() ReleaseProfile {
	return generatedM1ReleaseProfile
}

func init() {
	if err := ValidateReleaseProfile(generatedM1ReleaseProfile); err != nil {
		panic(err)
	}
}
