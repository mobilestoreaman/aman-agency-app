package whatsapp

import (
	"fmt"
	"os"
	"strings"
)

// NewProvider reads WA_PROVIDER from the environment and returns the
// appropriate MessageProvider implementation.
//
//   WA_PROVIDER=twilio   → TwilioProvider  (needs WA_TWILIO_SID / TOKEN / FROM)
//   WA_PROVIDER=noop     → NoopProvider    (logs only, no real message)
//   (unset)              → NoopProvider    (safe default for local dev)
func NewProvider() (MessageProvider, error) {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("WA_PROVIDER"))) {
	case "twilio":
		sid   := os.Getenv("WA_TWILIO_SID")
		token := os.Getenv("WA_TWILIO_TOKEN")
		from  := os.Getenv("WA_TWILIO_FROM")
		if sid == "" || token == "" || from == "" {
			return nil, fmt.Errorf(
				"whatsapp/factory: WA_PROVIDER=twilio but WA_TWILIO_SID / WA_TWILIO_TOKEN / WA_TWILIO_FROM are not all set",
			)
		}
		return NewTwilioProvider(sid, token, from), nil

	case "noop", "":
		return &NoopProvider{}, nil

	default:
		return nil, fmt.Errorf(
			"whatsapp/factory: unknown WA_PROVIDER=%q; valid values: twilio, noop",
			os.Getenv("WA_PROVIDER"),
		)
	}
}
