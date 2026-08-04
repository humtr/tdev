package protocolruntime

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

const maxSafeInteger int64 = 9_007_199_254_740_991

// Canonicalize implements the RFC 8785 ordering and string rules for the M0
// protocol domain. The protocol schema permits JSON integers only; fractions,
// non-finite numbers, and integers outside the cross-language safe range fail.
func Canonicalize(value any) ([]byte, error) {
	var out strings.Builder
	if err := appendCanonical(&out, value); err != nil {
		return nil, err
	}
	return []byte(out.String()), nil
}

func appendCanonical(out *strings.Builder, value any) error {
	switch current := value.(type) {
	case nil:
		out.WriteString("null")
	case bool:
		if current {
			out.WriteString("true")
		} else {
			out.WriteString("false")
		}
	case string:
		return appendJSONString(out, current)
	case json.Number:
		integer, err := current.Int64()
		if err != nil {
			return fmt.Errorf("M0 canonical JSON accepts only integers: %w", err)
		}
		return appendInteger(out, integer)
	case int:
		return appendInteger(out, int64(current))
	case int8:
		return appendInteger(out, int64(current))
	case int16:
		return appendInteger(out, int64(current))
	case int32:
		return appendInteger(out, int64(current))
	case int64:
		return appendInteger(out, current)
	case uint:
		if uint64(current) > uint64(maxSafeInteger) {
			return errors.New("integer exceeds cross-language safe range")
		}
		return appendInteger(out, int64(current))
	case uint8:
		return appendInteger(out, int64(current))
	case uint16:
		return appendInteger(out, int64(current))
	case uint32:
		return appendInteger(out, int64(current))
	case uint64:
		if current > uint64(maxSafeInteger) {
			return errors.New("integer exceeds cross-language safe range")
		}
		return appendInteger(out, int64(current))
	case float32:
		return appendFloat(out, float64(current))
	case float64:
		return appendFloat(out, current)
	case []any:
		out.WriteByte('[')
		for index, item := range current {
			if index > 0 {
				out.WriteByte(',')
			}
			if err := appendCanonical(out, item); err != nil {
				return fmt.Errorf("array item %d: %w", index, err)
			}
		}
		out.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(current))
		for key := range current {
			if !utf8.ValidString(key) {
				return errors.New("object key is not valid UTF-8")
			}
			keys = append(keys, key)
		}
		sort.Slice(keys, func(left, right int) bool {
			return compareUTF16(keys[left], keys[right]) < 0
		})
		out.WriteByte('{')
		for index, key := range keys {
			if index > 0 {
				out.WriteByte(',')
			}
			if err := appendJSONString(out, key); err != nil {
				return err
			}
			out.WriteByte(':')
			if err := appendCanonical(out, current[key]); err != nil {
				return fmt.Errorf("object property %q: %w", key, err)
			}
		}
		out.WriteByte('}')
	default:
		return fmt.Errorf("unsupported canonical JSON value %T", value)
	}
	return nil
}

func appendInteger(out *strings.Builder, value int64) error {
	if value < -maxSafeInteger || value > maxSafeInteger {
		return errors.New("integer exceeds cross-language safe range")
	}
	out.WriteString(strconv.FormatInt(value, 10))
	return nil
}

func appendFloat(out *strings.Builder, value float64) error {
	if math.IsNaN(value) || math.IsInf(value, 0) || math.Trunc(value) != value || math.Abs(value) > float64(maxSafeInteger) {
		return errors.New("M0 canonical JSON accepts only safe integers")
	}
	if value == 0 {
		out.WriteByte('0')
		return nil
	}
	out.WriteString(strconv.FormatInt(int64(value), 10))
	return nil
}

func appendJSONString(out *strings.Builder, value string) error {
	if !utf8.ValidString(value) {
		return errors.New("string is not valid UTF-8")
	}
	const hexadecimal = "0123456789abcdef"
	out.WriteByte('"')
	for _, current := range value {
		switch current {
		case '"', '\\':
			out.WriteByte('\\')
			out.WriteRune(current)
		case '\b':
			out.WriteString("\\b")
		case '\t':
			out.WriteString("\\t")
		case '\n':
			out.WriteString("\\n")
		case '\f':
			out.WriteString("\\f")
		case '\r':
			out.WriteString("\\r")
		default:
			if current < 0x20 {
				out.WriteString("\\u00")
				out.WriteByte(hexadecimal[byte(current)>>4])
				out.WriteByte(hexadecimal[byte(current)&0x0f])
			} else {
				out.WriteRune(current)
			}
		}
	}
	out.WriteByte('"')
	return nil
}

func compareUTF16(left, right string) int {
	leftUnits := utf16.Encode([]rune(left))
	rightUnits := utf16.Encode([]rune(right))
	limit := len(leftUnits)
	if len(rightUnits) < limit {
		limit = len(rightUnits)
	}
	for index := 0; index < limit; index++ {
		if leftUnits[index] < rightUnits[index] {
			return -1
		}
		if leftUnits[index] > rightUnits[index] {
			return 1
		}
	}
	if len(leftUnits) < len(rightUnits) {
		return -1
	}
	if len(leftUnits) > len(rightUnits) {
		return 1
	}
	return 0
}

func TypedDigest(domain string, value any) (string, error) {
	if domain == "" || strings.ContainsRune(domain, '\x00') {
		return "", errors.New("digest domain must be non-empty and contain no NUL")
	}
	canonical, err := Canonicalize(value)
	if err != nil {
		return "", err
	}
	digest := sha256.New()
	_, _ = digest.Write([]byte(domain))
	_, _ = digest.Write([]byte{0})
	_, _ = digest.Write(canonical)
	return hex.EncodeToString(digest.Sum(nil)), nil
}
