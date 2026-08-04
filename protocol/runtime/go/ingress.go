package protocolruntime

import (
	"bytes"
	"fmt"
	"math/big"
	"strconv"
	"unicode/utf8"
)

const (
	MaxBodyBytes     = 1048576
	MaxJSONDepth     = 64
	MaxJSONTokens    = 100000
	MaxObjectMembers = 4096
	MaxArrayItems    = 10000
	MinSafeInteger   = -9007199254740991
	MaxSafeInteger   = 9007199254740991
)

type IngressError struct {
	Code    string
	Message string
}

func (e *IngressError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func ParseRawIngress(rawBytes []byte) (any, error) {
	if len(rawBytes) > MaxBodyBytes {
		return nil, &IngressError{
			Code:    "PAYLOAD_TOO_LARGE",
			Message: "payload size exceeds maximum allowed limit",
		}
	}

	if !utf8.Valid(rawBytes) {
		return nil, &IngressError{
			Code:    "INVALID_UTF8",
			Message: "raw request body is not valid UTF-8",
		}
	}

	pos := 0
	tokenCount := 0
	text := string(rawBytes)

	countToken := func() error {
		tokenCount++
		if tokenCount > MaxJSONTokens {
			return &IngressError{
				Code:    "JSON_LIMIT_EXCEEDED",
				Message: fmt.Sprintf("token count exceeds maximum %d", MaxJSONTokens),
			}
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

	var parseValue func(depth int) (any, error)
	var parseObject func(depth int) (map[string]any, error)
	var parseArray func(depth int) ([]any, error)
	var parseString func() (string, error)
	var parseNumber func() (int64, error)
	var parseLiteral func(expected string, val any) (any, error)

	parseLiteral = func(expected string, val any) (any, error) {
		if err := countToken(); err != nil {
			return nil, err
		}
		if stringsHasPrefix(text[pos:], expected) {
			pos += len(expected)
			return val, nil
		}
		return nil, &IngressError{Code: "MALFORMED_JSON", Message: "invalid literal"}
	}

	parseString = func() (string, error) {
		if err := countToken(); err != nil {
			return "", err
		}
		if pos >= len(text) || text[pos] != '"' {
			return "", &IngressError{Code: "MALFORMED_JSON", Message: "expected string quote"}
		}
		pos++
		var buf bytes.Buffer
		for pos < len(text) {
			ch := text[pos]
			if ch == '"' {
				pos++
				return buf.String(), nil
			}
			if ch == '\\' {
				pos++
				if pos >= len(text) {
					return "", &IngressError{Code: "MALFORMED_JSON", Message: "unterminated escape sequence"}
				}
				esc := text[pos]
				pos++
				switch esc {
				case '"':
					buf.WriteByte('"')
				case '\\':
					buf.WriteByte('\\')
				case '/':
					buf.WriteByte('/')
				case 'b':
					buf.WriteByte('\b')
				case 'f':
					buf.WriteByte('\f')
				case 'n':
					buf.WriteByte('\n')
				case 'r':
					buf.WriteByte('\r')
				case 't':
					buf.WriteByte('\t')
				case 'u':
					if pos+4 > len(text) {
						return "", &IngressError{Code: "MALFORMED_JSON", Message: "invalid hex escape sequence"}
					}
					hexStr := text[pos : pos+4]
					codeUnit, err := strconv.ParseUint(hexStr, 16, 16)
					if err != nil {
						return "", &IngressError{Code: "MALFORMED_JSON", Message: "invalid hex code"}
					}
					pos += 4
					if codeUnit >= 0xd800 && codeUnit <= 0xdbff {
						if pos+6 <= len(text) && text[pos:pos+2] == "\\u" {
							lowHex := text[pos+2 : pos+6]
							lowUnit, err := strconv.ParseUint(lowHex, 16, 16)
							if err == nil && lowUnit >= 0xdc00 && lowUnit <= 0xdfff {
								pos += 6
								r := rune(0x10000 + ((codeUnit - 0xd800) << 10) + (lowUnit - 0xdc00))
								buf.WriteRune(r)
								break
							}
						}
						return "", &IngressError{Code: "MALFORMED_JSON", Message: "escaped lone high surrogate"}
					}
					if codeUnit >= 0xdc00 && codeUnit <= 0xdfff {
						return "", &IngressError{Code: "MALFORMED_JSON", Message: "escaped lone low surrogate"}
					}
					buf.WriteRune(rune(codeUnit))
				default:
					return "", &IngressError{Code: "MALFORMED_JSON", Message: "invalid escape character"}
				}
			} else if ch < 0x20 {
				return "", &IngressError{Code: "MALFORMED_JSON", Message: "unescaped control character in string"}
			} else {
				buf.WriteByte(ch)
				pos++
			}
		}
		return "", &IngressError{Code: "MALFORMED_JSON", Message: "unterminated string literal"}
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
			return 0, &IngressError{Code: "MALFORMED_JSON", Message: "invalid number literal"}
		}
		intStart := pos
		if text[pos] == '0' {
			pos++
		} else if text[pos] >= '1' && text[pos] <= '9' {
			for pos < len(text) && text[pos] >= '0' && text[pos] <= '9' {
				pos++
			}
		} else {
			return 0, &IngressError{Code: "MALFORMED_JSON", Message: "invalid number format"}
		}
		intDigits := text[intStart:pos]

		fracDigits := ""
		if pos < len(text) && text[pos] == '.' {
			pos++
			fracStart := pos
			for pos < len(text) && text[pos] >= '0' && text[pos] <= '9' {
				pos++
			}
			if pos == fracStart {
				return 0, &IngressError{Code: "MALFORMED_JSON", Message: "invalid number fraction"}
			}
			fracDigits = text[fracStart:pos]
		}

		expSign := int64(1)
		expDigits := ""
		if pos < len(text) && (text[pos] == 'e' || text[pos] == 'E') {
			pos++
			if pos < len(text) && (text[pos] == '+' || text[pos] == '-') {
				if text[pos] == '-' {
					expSign = -1
				}
				pos++
			}
			expStart := pos
			for pos < len(text) && text[pos] >= '0' && text[pos] <= '9' {
				pos++
			}
			if pos == expStart {
				return 0, &IngressError{Code: "MALFORMED_JSON", Message: "invalid number exponent"}
			}
			expDigits = text[expStart:pos]
		}

		var expVal int64
		if expDigits != "" {
			parsedExp, err := strconv.ParseInt(expDigits, 10, 64)
			if err != nil {
				return 0, &IngressError{Code: "UNSAFE_JSON_NUMBER", Message: "invalid number exponent"}
			}
			expVal = parsedExp * expSign
		}

		digitsStr := intDigits + fracDigits
		effectiveExp := expVal - int64(len(fracDigits))

		bigInt := new(big.Int)
		if _, ok := bigInt.SetString(digitsStr, 10); !ok {
			return 0, &IngressError{Code: "UNSAFE_JSON_NUMBER", Message: "invalid number digits"}
		}

		if effectiveExp >= 0 {
			if effectiveExp > 10000 {
				return 0, &IngressError{Code: "UNSAFE_JSON_NUMBER", Message: "number exponent too large"}
			}
			mul := new(big.Int).Exp(big.NewInt(10), big.NewInt(effectiveExp), nil)
			bigInt.Mul(bigInt, mul)
		} else {
			k := -effectiveExp
			if k > 10000 {
				return 0, &IngressError{Code: "UNSAFE_JSON_NUMBER", Message: "number exponent too small"}
			}
			div := new(big.Int).Exp(big.NewInt(10), big.NewInt(k), nil)
			rem := new(big.Int)
			bigInt.DivMod(bigInt, div, rem)
			if rem.Sign() != 0 {
				return 0, &IngressError{Code: "UNSAFE_JSON_NUMBER", Message: "number is not an integer"}
			}
		}

		if isNeg {
			bigInt.Neg(bigInt)
		}

		if !bigInt.IsInt64() {
			return 0, &IngressError{Code: "UNSAFE_JSON_NUMBER", Message: "number is out of safe integer range"}
		}

		val := bigInt.Int64()
		if val < MinSafeInteger || val > MaxSafeInteger {
			return 0, &IngressError{Code: "UNSAFE_JSON_NUMBER", Message: "number is out of safe integer range"}
		}
		return val, nil
	}

	parseValue = func(depth int) (any, error) {
		if depth > MaxJSONDepth {
			return nil, &IngressError{Code: "JSON_LIMIT_EXCEEDED", Message: fmt.Sprintf("nesting depth exceeds maximum %d", MaxJSONDepth)}
		}
		skipWhitespace()
		if pos >= len(text) {
			return nil, &IngressError{Code: "MALFORMED_JSON", Message: "unexpected end of JSON input"}
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
			return nil, &IngressError{Code: "MALFORMED_JSON", Message: "unexpected character"}
		}
	}

	parseObject = func(depth int) (map[string]any, error) {
		if err := countToken(); err != nil {
			return nil, err
		}
		pos++ // skip {
		obj := make(map[string]any)
		keys := make(map[string]bool)
		memberCount := 0

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
			if text[pos] != '"' {
				return nil, &IngressError{Code: "MALFORMED_JSON", Message: "expected member name string"}
			}
			key, err := parseString()
			if err != nil {
				return nil, err
			}
			if keys[key] {
				return nil, &IngressError{Code: "DUPLICATE_JSON_MEMBER", Message: "duplicate object member name"}
			}
			keys[key] = true
			memberCount++
			if memberCount > MaxObjectMembers {
				return nil, &IngressError{Code: "JSON_LIMIT_EXCEEDED", Message: fmt.Sprintf("object member count exceeds maximum %d", MaxObjectMembers)}
			}

			skipWhitespace()
			if pos >= len(text) || text[pos] != ':' {
				return nil, &IngressError{Code: "MALFORMED_JSON", Message: "expected ':' after member name"}
			}
			if err := countToken(); err != nil {
				return nil, err
			}
			pos++ // skip :

			val, err := parseValue(depth + 1)
			if err != nil {
				return nil, err
			}
			obj[key] = val

			skipWhitespace()
			if pos >= len(text) {
				return nil, &IngressError{Code: "MALFORMED_JSON", Message: "unexpected end of object"}
			}
			nextChar := text[pos]
			if nextChar == '}' {
				if err := countToken(); err != nil {
					return nil, err
				}
				pos++
				return obj, nil
			}
			if nextChar == ',' {
				if err := countToken(); err != nil {
					return nil, err
				}
				pos++
			} else {
				return nil, &IngressError{Code: "MALFORMED_JSON", Message: "expected ',' or '}'"}
			}
		}
		return nil, &IngressError{Code: "MALFORMED_JSON", Message: "unterminated object literal"}
	}

	parseArray = func(depth int) ([]any, error) {
		if err := countToken(); err != nil {
			return nil, err
		}
		pos++ // skip [
		var arr []any

		skipWhitespace()
		if pos < len(text) && text[pos] == ']' {
			if err := countToken(); err != nil {
				return nil, err
			}
			pos++
			return arr, nil
		}

		for pos < len(text) {
			if len(arr) >= MaxArrayItems {
				return nil, &IngressError{Code: "JSON_LIMIT_EXCEEDED", Message: fmt.Sprintf("array item count exceeds maximum %d", MaxArrayItems)}
			}
			val, err := parseValue(depth + 1)
			if err != nil {
				return nil, err
			}
			arr = append(arr, val)

			skipWhitespace()
			if pos >= len(text) {
				return nil, &IngressError{Code: "MALFORMED_JSON", Message: "unexpected end of array"}
			}
			nextChar := text[pos]
			if nextChar == ']' {
				if err := countToken(); err != nil {
					return nil, err
				}
				pos++
				return arr, nil
			}
			if nextChar == ',' {
				if err := countToken(); err != nil {
					return nil, err
				}
				pos++
			} else {
				return nil, &IngressError{Code: "MALFORMED_JSON", Message: "expected ',' or ']'"}
			}
		}
		return nil, &IngressError{Code: "MALFORMED_JSON", Message: "unterminated array literal"}
	}

	rootValue, err := parseValue(1)
	if err != nil {
		return nil, err
	}
	skipWhitespace()
	if pos < len(text) {
		return nil, &IngressError{Code: "MALFORMED_JSON", Message: "unexpected trailing content"}
	}
	return rootValue, nil
}

func stringsHasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}
