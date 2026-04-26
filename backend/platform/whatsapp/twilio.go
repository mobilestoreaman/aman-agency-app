package whatsapp

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// TwilioProvider sends WhatsApp messages through Twilio's Messaging API.
//
// Required env vars (injected via Config):
//   WA_TWILIO_SID          – Twilio Account SID
//   WA_TWILIO_TOKEN        – Twilio Auth Token
//   WA_TWILIO_FROM         – "whatsapp:+14155238886" (Twilio sandbox or approved number)
//
// The message body is a plain-text template; swap for a pre-approved Twilio
// content template SID if you need structured HSM messages in production.
type TwilioProvider struct {
	AccountSID string
	AuthToken  string
	FromNumber string // must be in "whatsapp:+E164" format
	httpClient *http.Client
}

func NewTwilioProvider(accountSID, authToken, fromNumber string) *TwilioProvider {
	return &TwilioProvider{
		AccountSID: accountSID,
		AuthToken:  authToken,
		FromNumber: fromNumber,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func (t *TwilioProvider) SendInvoiceLink(
	toPhone, customerName, invoiceURL, billNumber, totalAmount string,
) error {
	body := fmt.Sprintf(
		"Hello %s,\n\nThank you for your purchase! 🎉\n\n"+
			"Your invoice %s for %s is ready:\n%s\n\n"+
			"You can open the link to view or print your invoice.\n\n"+
			"– Aman Agency",
		customerName, billNumber, totalAmount, invoiceURL,
	)

	// E.164 → whatsapp:+E164
	to := toPhone
	if !strings.HasPrefix(to, "whatsapp:") {
		to = "whatsapp:" + to
	}

	apiURL := fmt.Sprintf(
		"https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json",
		t.AccountSID,
	)

	form := url.Values{}
	form.Set("To", to)
	form.Set("From", t.FromNumber)
	form.Set("Body", body)

	req, err := http.NewRequest(http.MethodPost, apiURL, strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("whatsapp/twilio: build request: %w", err)
	}
	req.SetBasicAuth(t.AccountSID, t.AuthToken)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := t.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("whatsapp/twilio: http request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(resp.Body)
		var errBody struct {
			Message string `json:"message"`
			Code    int    `json:"code"`
		}
		_ = json.Unmarshal(raw, &errBody)
		return fmt.Errorf("whatsapp/twilio: API error %d — %s (code %d)",
			resp.StatusCode, errBody.Message, errBody.Code)
	}

	return nil
}
