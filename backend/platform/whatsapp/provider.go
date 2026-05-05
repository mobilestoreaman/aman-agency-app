package whatsapp

import "context"

// MessageProvider abstracts different WhatsApp messaging back-ends.
// Any provider must be able to send an invoice link to a customer.
type MessageProvider interface {
	// SendInvoiceLink sends the bill / invoice URL to the customer via WhatsApp.
	//   ctx          – caller context; provider must honour cancellation
	//   toPhone      – E.164 number, e.g. "+919876543210"
	//   customerName – display name used inside the message template
	//   invoiceURL   – publicly reachable URL for the HTML invoice
	//   billNumber   – human-readable bill reference, e.g. "BILL-0042"
	//   totalAmount  – pre-formatted total string, e.g. "₹12,500"
	SendInvoiceLink(ctx context.Context, toPhone, customerName, invoiceURL, billNumber, totalAmount string) error
}
