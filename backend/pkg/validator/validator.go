// Package validator wraps go-playground/validator with a singleton instance
// that has custom tags registered for the application's domain types.
//
// Custom tags:
//   - e164       : valid E.164 phone number  (+[country][number], 7-15 digits)
//   - objectid   : valid MongoDB ObjectID    (24 lowercase hex characters)
package validator

import (
	"reflect"
	"regexp"
	"sync"
	"time"

	"github.com/go-playground/validator/v10"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

var (
	instance *validator.Validate
	once     sync.Once

	// E.164: + followed by 1 country digit then 6–14 more digits (total 7–15 digits)
	e164Re = regexp.MustCompile(`^\+[1-9]\d{6,14}$`)
)

// Get returns the singleton *validator.Validate with all custom tags registered.
// Safe for concurrent use; initialised exactly once.
func Get() *validator.Validate {
	once.Do(func() {
		instance = validator.New()

		// Use JSON tag names in error messages instead of Go struct field names.
		// This makes validation errors match the API field names automatically.
		instance.RegisterTagNameFunc(func(fld reflect.StructField) string {
			name := fld.Tag.Get("json")
			if name == "" || name == "-" {
				return ""
			}
			// strip omitempty and other options
			for i := 0; i < len(name); i++ {
				if name[i] == ',' {
					return name[:i]
				}
			}
			return name
		})

		// ── Custom tag: e164 ─────────────────────────────────────────────
		// Validates E.164 international phone number format.
		// Examples: +917012345678  +14155552671
		_ = instance.RegisterValidation("e164", func(fl validator.FieldLevel) bool {
			v := fl.Field().String()
			if v == "" {
				return true // empty is handled by `required` tag
			}
			return e164Re.MatchString(v)
		})

		// ── Custom tag: objectid ─────────────────────────────────────────
		// Validates that a string is a valid MongoDB ObjectID hex (24 chars).
		_ = instance.RegisterValidation("objectid", func(fl validator.FieldLevel) bool {
			v := fl.Field().String()
			if v == "" {
				return true // empty is handled by `required` tag
			}
			_, err := primitive.ObjectIDFromHex(v)
			return err == nil
		})

		// ── Custom tag: ddmmyyyy ─────────────────────────────────────────
		// Validates that a string matches the DD-MM-YYYY date format.
		_ = instance.RegisterValidation("ddmmyyyy", func(fl validator.FieldLevel) bool {
			s := fl.Field().String()
			if s == "" {
				return true // omitempty handles the empty case
			}
			_, err := time.Parse("02-01-2006", s)
			return err == nil
		})
	})
	return instance
}

// Struct validates a struct and returns raw validator.ValidationErrors.
// The global error handler in middleware/error_handler.go formats these
// into field-level JSON errors automatically.
func Struct(s interface{}) error {
	return Get().Struct(s)
}

// Var validates a single variable against a tag string.
// Example: validator.Var(phone, "required,e164")
func Var(field interface{}, tag string) error {
	return Get().Var(field, tag)
}
