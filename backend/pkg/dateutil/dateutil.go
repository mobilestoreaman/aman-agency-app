// Package dateutil provides shared date-parsing helpers for the Aman Agency
// backend. All user-facing dates use DD-MM-YYYY in IST (Asia/Kolkata).
package dateutil

import (
	"fmt"
	"time"
)

// ist is Asia/Kolkata (UTC+5:30). All user-supplied date strings are parsed
// against this timezone so that midnight boundaries align with IST calendar days.
var ist = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		// Fallback: fixed offset in case the timezone database is unavailable.
		loc = time.FixedZone("IST", 5*60*60+30*60)
	}
	return loc
}()

// ParseDDMMYYYY parses a DD-MM-YYYY string in IST and returns the start of
// that calendar day (00:00:00 IST).
//
//   - Empty string  → zero time, nil error  (caller treats as "no filter")
//   - Valid string  → start of day in IST, nil error
//   - Bad string    → zero time, non-nil error
func ParseDDMMYYYY(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, nil
	}
	t, err := time.ParseInLocation("02-01-2006", s, ist)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid date %q: expected DD-MM-YYYY", s)
	}
	// Normalise to start-of-day IST.
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, ist), nil
}

// EndOfDay returns the last nanosecond of the given day in IST
// (23:59:59.999999999). Use this as the upper bound for inclusive date filters.
func EndOfDay(t time.Time) time.Time {
	t = t.In(ist)
	return time.Date(t.Year(), t.Month(), t.Day(), 23, 59, 59, 999999999, ist)
}

