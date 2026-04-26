package whatsapp

import "log"

// NoopProvider satisfies MessageProvider without sending any real messages.
// Use this in development / test environments where WA_PROVIDER is unset or "noop".
type NoopProvider struct{}

func (n *NoopProvider) SendInvoiceLink(
	toPhone, customerName, invoiceURL, billNumber, totalAmount string,
) error {
	log.Printf("[whatsapp/noop] would send invoice %s (%s) to %s — URL: %s",
		billNumber, totalAmount, toPhone, invoiceURL)
	return nil
}
