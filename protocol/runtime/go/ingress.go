package protocolruntime

import (
	"bytes"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	MinSafeInteger = -9007199254740991
	MaxSafeInteger = 9007199254740991
)

type ProtocolErrorReason string

const (
	ReasonBodyBytes          ProtocolErrorReason = "BODY_BYTES"
	ReasonUTF8               ProtocolErrorReason = "UTF8"
	ReasonJSONGrammar        ProtocolErrorReason = "JSON_GRAMMAR"
	ReasonTrailingValue      ProtocolErrorReason = "TRAILING_VALUE"
	ReasonDuplicateMember    ProtocolErrorReason = "DUPLICATE_MEMBER"
	ReasonDepth              ProtocolErrorReason = "DEPTH"
	ReasonTokenCount         ProtocolErrorReason = "TOKEN_COUNT"
	ReasonObjectMembers      ProtocolErrorReason = "OBJECT_MEMBERS"
	ReasonArrayItems         ProtocolErrorReason = "ARRAY_ITEMS"
	ReasonStringLength       ProtocolErrorReason = "STRING_LENGTH"
	ReasonNumberDigits       ProtocolErrorReason = "NUMBER_DIGITS"
	ReasonExponentMagnitude  ProtocolErrorReason = "EXPONENT_MAGNITUDE"
	ReasonSafeInteger        ProtocolErrorReason = "SAFE_INTEGER"
	ReasonSchema             ProtocolErrorReason = "SCHEMA"
	ReasonOneOfNoMatch       ProtocolErrorReason = "ONE_OF_NO_MATCH"
	ReasonOneOfMultipleMatch ProtocolErrorReason = "ONE_OF_MULTIPLE_MATCH"
	ReasonRootDefinition     ProtocolErrorReason = "ROOT_DEFINITION"
	ReasonUnionDiscriminator ProtocolErrorReason = "UNION_DISCRIMINATOR"
)

type ProtocolErrorDetail struct {
	Code            string              `json:"code"`
	Reason          ProtocolErrorReason `json:"reason"`
	InstancePointer string              `json:"instancePointer,omitempty"`
	Limit           *int                `json:"limit,omitempty"`
}

type IngressError struct {
	Code    string
	Reason  ProtocolErrorReason
	Message string
}

func (e *IngressError) Error() string {
	return fmt.Sprintf("%s/%s: %s", e.Code, e.Reason, e.Message)
}

func ingressError(code string, reason ProtocolErrorReason, message string) *IngressError {
	return &IngressError{Code: code, Reason: reason, Message: message}
}

func ParseRawIngress(rawBytes []byte) (any, error) {
	return parseRawIngressWithProfile(rawBytes, DefaultM1ReleaseProfile())
}

func parseRawIngressWithProfile(rawBytes []byte, profile ReleaseProfile) (any, error) {
	limits := profile.Ingress
	if len(rawBytes) > limits.MaxBodyBytes {
		return nil, ingressError("PAYLOAD_TOO_LARGE", ReasonBodyBytes, "request body exceeds the configured release limit")
	}
	if !utf8.Valid(rawBytes) {
		return nil, ingressError("INVALID_UTF8", ReasonUTF8, "raw request body is not valid UTF-8")
	}

	pos, tokenCount := 0, 0
	text := string(rawBytes)
	countToken := func() error {
		tokenCount++
		if tokenCount > limits.MaxJSONTokens {
			return ingressError("JSON_LIMIT_EXCEEDED", ReasonTokenCount, "JSON token count exceeds the configured release limit")
		}
		return nil
	}
	skipWhitespace := func() {
		for pos < len(text) {
			ch := text[pos]
			if ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r' {
				pos++
			} else {
				break
			}
		}
	}

	var parseValue func(int) (any, error)
	var parseObject func(int) (map[string]any, error)
	var parseArray func(int) ([]any, error)
	var parseString func() (string, error)
	var parseNumber func() (int64, error)
	var parseLiteral func(string, any) (any, error)

	parseLiteral = func(expected string, value any) (any, error) {
		if err := countToken(); err != nil {
			return nil, err
		}
		if !strings.HasPrefix(text[pos:], expected) {
			return nil, ingressError("MALFORMED_JSON", ReasonJSONGrammar, "invalid JSON literal")
		}
		pos += len(expected)
		return value, nil
	}

	parseString = func() (string, error) {
		if err := countToken(); err != nil {
			return "", err
		}
		if pos >= len(text) || text[pos] != '"' {
			return "", ingressError("MALFORMED_JSON", ReasonJSONGrammar, "expected string quote")
		}
		pos++
		var buf bytes.Buffer
		codePoints := 0
		appendRune := func(r rune) error {
			codePoints++
			if codePoints > limits.MaxStringCodePoints {
				return ingressError("JSON_LIMIT_EXCEEDED", ReasonStringLength, "decoded string length exceeds the configured release limit")
			}
			buf.WriteRune(r)
			return nil
		}
		for pos < len(text) {
			ch := text[pos]
			if ch == '"' {
				pos++
				return buf.String(), nil
			}
			if ch == '\\' {
				pos++
				if pos >= len(text) {
					return "", ingressError("MALFORMED_JSON", ReasonJSONGrammar, "unterminated escape sequence")
				}
				esc := text[pos]
				pos++
				var r rune
				switch esc {
				case '"':
					r = '"'
				case '\\':
					r = '\\'
				case '/':
					r = '/'
				case 'b':
					r = '\b'
				case 'f':
					r = '\f'
				case 'n':
					r = '\n'
				case 'r':
					r = '\r'
				case 't':
					r = '\t'
				case 'u':
					if pos+4 > len(text) {
						return "", ingressError("MALFORMED_JSON", ReasonJSONGrammar, "invalid Unicode escape")
					}
					codeUnit, err := strconv.ParseUint(text[pos:pos+4], 16, 16)
					if err != nil {
						return "", ingressError("MALFORMED_JSON", ReasonJSONGrammar, "invalid Unicode escape")
					}
					pos += 4
					if codeUnit >= 0xd800 && codeUnit <= 0xdbff {
						if pos+6 > len(text) || text[pos:pos+2] != "\\u" {
							return "", ingressError("MALFORMED_JSON", ReasonJSONGrammar, "escaped lone high surrogate")
						}
						lowUnit, err := strconv.ParseUint(text[pos+2:pos+6], 16, 16)
						if err != nil || lowUnit < 0xdc00 || lowUnit > 0xdfff {
							return "", ingressError("MALFORMED_JSON", ReasonJSONGrammar, "escaped lone high surrogate")
						}
						pos += 6
						r = rune(0x10000 + ((codeUnit - 0xd800) << 10) + (lowUnit - 0xdc00))
					} else if codeUnit >= 0xdc00 && codeUnit <= 0xdfff {
						return "", ingressError("MALFORMED_JSON", ReasonJSONGrammar, "escaped lone low surrogate")
					} else {
						r = rune(codeUnit)
					}
				default:
					return "", ingressError("MALFORMED_JSON", ReasonJSONGrammar, "invalid escape character")
				}
				if err := appendRune(r); err != nil {
					return "", err
				}
			} else if ch < 0x20 {
				return "", ingressError("MALFORMED_JSON", ReasonJSONGrammar, "unescaped control character in string")
			} else {
				r, size := utf8.DecodeRuneInString(text[pos:])
				if r == utf8.RuneError && size == 1 {
					return "", ingressError("INVALID_UTF8", ReasonUTF8, "raw request body is not valid UTF-8")
				}
				if err := appendRune(r); err != nil {
					return "", err
				}
				pos += size
			}
		}
		return "", ingressError("MALFORMED_JSON", ReasonJSONGrammar, "unterminated string literal")
	}

	parseNumber = func() (int64, error) {
		if err := countToken(); err != nil {
			return 0, err
		}
		isNeg := false
		if text[pos] == '-' {
			isNeg = true
			pos++
		}
		if pos >= len(text) {
			return 0, ingressError("MALFORMED_JSON", ReasonJSONGrammar, "invalid number literal")
		}
		intStart := pos
		if text[pos] == '0' {
			pos++
		} else if text[pos] >= '1' && text[pos] <= '9' {
			for pos < len(text) && text[pos] >= '0' && text[pos] <= '9' {
				pos++
			}
		} else {
			return 0, ingressError("MALFORMED_JSON", ReasonJSONGrammar, "invalid number format")
		}
		intDigits := text[intStart:pos]
		fracDigits := ""
		if pos < len(text) && text[pos] == '.' {
			pos++
			start := pos
			for pos < len(text) && text[pos] >= '0' && text[pos] <= '9' {
				pos++
			}
			if pos == start {
				return 0, ingressError("MALFORMED_JSON", ReasonJSONGrammar, "invalid number fraction")
			}
			fracDigits = text[start:pos]
		}
		expSign, expDigits := 1, ""
		if pos < len(text) && (text[pos] == 'e' || text[pos] == 'E') {
			pos++
			if pos < len(text) && (text[pos] == '+' || text[pos] == '-') {
				if text[pos] == '-' {
					expSign = -1
				}
				pos++
			}
			start := pos
			for pos < len(text) && text[pos] >= '0' && text[pos] <= '9' {
				pos++
			}
			if pos == start {
				return 0, ingressError("MALFORMED_JSON", ReasonJSONGrammar, "invalid number exponent")
			}
			expDigits = text[start:pos]
		}
		digitsStr := intDigits + fracDigits
		if len(digitsStr) > limits.MaxNumberDigits {
			return 0, ingressError("JSON_LIMIT_EXCEEDED", ReasonNumberDigits, "number digit count exceeds the configured release limit")
		}
		expMagnitude := 0
		if expDigits != "" {
			significant := strings.TrimLeft(expDigits, "0")
			if significant == "" {
				significant = "0"
			}
			maxText := strconv.Itoa(limits.MaxExponentMagnitude)
			if len(significant) > len(maxText) || (len(significant) == len(maxText) && significant > maxText) {
				return 0, ingressError("JSON_LIMIT_EXCEEDED", ReasonExponentMagnitude, "number exponent exceeds the configured release limit")
			}
			expMagnitude, _ = strconv.Atoi(significant)
		}
		effectiveExp := expMagnitude*expSign - len(fracDigits)
		if effectiveExp > limits.MaxExponentMagnitude || effectiveExp < -limits.MaxExponentMagnitude {
			return 0, ingressError("JSON_LIMIT_EXCEEDED", ReasonExponentMagnitude, "effective number exponent exceeds the configured release limit")
		}
		value := new(big.Int)
		if _, ok := value.SetString(digitsStr, 10); !ok {
			return 0, ingressError("UNSAFE_JSON_NUMBER", ReasonSafeInteger, "invalid number digits")
		}
		if effectiveExp >= 0 {
			value.Mul(value, new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(effectiveExp)), nil))
		} else {
			divisor := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(-effectiveExp)), nil)
			remainder := new(big.Int)
			value.DivMod(value, divisor, remainder)
			if remainder.Sign() != 0 {
				return 0, ingressError("UNSAFE_JSON_NUMBER", ReasonSafeInteger, "number is not an integer")
			}
		}
		if isNeg {
			value.Neg(value)
		}
		if !value.IsInt64() {
			return 0, ingressError("UNSAFE_JSON_NUMBER", ReasonSafeInteger, "number exceeds the protocol safe-integer range")
		}
		result := value.Int64()
		if result < MinSafeInteger || result > MaxSafeInteger {
			return 0, ingressError("UNSAFE_JSON_NUMBER", ReasonSafeInteger, "number exceeds the protocol safe-integer range")
		}
		return result, nil
	}

	parseValue = func(depth int) (any, error) {
		if depth > limits.MaxJSONDepth {
			return nil, ingressError("JSON_LIMIT_EXCEEDED", ReasonDepth, "JSON nesting depth exceeds the configured release limit")
		}
		skipWhitespace()
		if pos >= len(text) {
			return nil, ingressError("MALFORMED_JSON", ReasonJSONGrammar, "unexpected end of JSON input")
		}
		ch := text[pos]
		switch {
		case ch == '{':
			return parseObject(depth)
		case ch == '[':
			return parseArray(depth)
		case ch == '"':
			return parseString()
		case ch == 't':
			return parseLiteral("true", true)
		case ch == 'f':
			return parseLiteral("false", false)
		case ch == 'n':
			return parseLiteral("null", nil)
		case ch == '-' || (ch >= '0' && ch <= '9'):
			return parseNumber()
		default:
			return nil, ingressError("MALFORMED_JSON", ReasonJSONGrammar, "unexpected JSON character")
		}
	}

	parseObject = func(depth int) (map[string]any, error) {
		if err := countToken(); err != nil {
			return nil, err
		}
		pos++
		obj, keys, count := make(map[string]any), make(map[string]bool), 0
		skipWhitespace()
		if pos < len(text) && text[pos] == '}' {
			if err := countToken(); err != nil {
				return nil, err
			}
			pos++
			return obj, nil
		}
		for pos < len(text) {
			skipWhitespace()
			if pos >= len(text) || text[pos] != '"' {
				return nil, ingressError("MALFORMED_JSON", ReasonJSONGrammar, "expected member name string")
			}
			key, err := parseString()
			if err != nil {
				return nil, err
			}
			if keys[key] {
				return nil, ingressError("DUPLICATE_JSON_MEMBER", ReasonDuplicateMember, "duplicate object member name")
			}
			keys[key] = true
			count++
			if count > limits.MaxObjectMembers {
				return nil, ingressError("JSON_LIMIT_EXCEEDED", ReasonObjectMembers, "object member count exceeds the configured release limit")
			}
			skipWhitespace()
			if pos >= len(text) || text[pos] != ':' {
				return nil, ingressError("MALFORMED_JSON", ReasonJSONGrammar, "expected colon after member name")
			}
			if err := countToken(); err != nil {
				return nil, err
			}
			pos++
			value, err := parseValue(depth + 1)
			if err != nil {
				return nil, err
			}
			obj[key] = value
			skipWhitespace()
			if pos >= len(text) {
				return nil, ingressError("MALFORMED_JSON", ReasonJSONGrammar, "unexpected end of object")
			}
			if text[pos] == '}' {
				if err := countToken(); err != nil {
					return nil, err
				}
				pos++
				return obj, nil
			}
			if text[pos] != ',' {
				return nil, ingressError("MALFORMED_JSON", ReasonJSONGrammar, "expected object delimiter")
			}
			if err := countToken(); err != nil {
				return nil, err
			}
			pos++
		}
		return nil, ingressError("MALFORMED_JSON", ReasonJSONGrammar, "unterminated object literal")
	}

	parseArray = func(depth int) ([]any, error) {
		if err := countToken(); err != nil {
			return nil, err
		}
		pos++
		arr := []any{}
		skipWhitespace()
		if pos < len(text) && text[pos] == ']' {
			if err := countToken(); err != nil {
				return nil, err
			}
			pos++
			return arr, nil
		}
		for pos < len(text) {
			if len(arr) >= limits.MaxArrayItems {
				return nil, ingressError("JSON_LIMIT_EXCEEDED", ReasonArrayItems, "array item count exceeds the configured release limit")
			}
			value, err := parseValue(depth + 1)
			if err != nil {
				return nil, err
			}
			arr = append(arr, value)
			skipWhitespace()
			if pos >= len(text) {
				return nil, ingressError("MALFORMED_JSON", ReasonJSONGrammar, "unexpected end of array")
			}
			if text[pos] == ']' {
				if err := countToken(); err != nil {
					return nil, err
				}
				pos++
				return arr, nil
			}
			if text[pos] != ',' {
				return nil, ingressError("MALFORMED_JSON", ReasonJSONGrammar, "expected array delimiter")
			}
			if err := countToken(); err != nil {
				return nil, err
			}
			pos++
		}
		return nil, ingressError("MALFORMED_JSON", ReasonJSONGrammar, "unterminated array literal")
	}

	rootValue, err := parseValue(1)
	if err != nil {
		return nil, err
	}
	skipWhitespace()
	if pos < len(text) {
		return nil, ingressError("MALFORMED_JSON", ReasonTrailingValue, "unexpected trailing JSON content")
	}
	return rootValue, nil
}
