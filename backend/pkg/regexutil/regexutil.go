// Package regexutil provides helpers for safe MongoDB regex construction.
package regexutil

import "regexp"

// Escape returns s with all regex metacharacters quoted so the string is
// treated as a literal pattern. Use this on every user-supplied search term
// before passing it to a MongoDB $regex query to prevent ReDoS attacks.
func Escape(s string) string {
	return regexp.QuoteMeta(s)
}
