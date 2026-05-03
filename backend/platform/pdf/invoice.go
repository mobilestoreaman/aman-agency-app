// Package pdf provides invoice rendering utilities.
// Invoices are rendered as self-contained, print-ready HTML documents.
// The browser's native print-to-PDF functionality handles final PDF export,
// which works seamlessly on both desktop and mobile (Android/iOS).
package pdf

import (
	"bytes"
	"fmt"
	"html/template"
	"os"
	"path/filepath"
	"time"

	"aman-agency/backend/internal/models"
)

// InvoiceData bundles everything the HTML template needs.
type InvoiceData struct {
	Bill     *models.Bill
	Settings *models.Settings
	// Pre-formatted helpers (avoids logic in template)
	StoreName     string
	StoreAddr     string
	StorePhone    string
	StoreEmail    string
	HeaderText    string
	FooterText    string
	Currency      string
	BillNumber    string
	CustomerName  string
	CustomerPhone string
	IssuedAt      string
	CreatedAt     string
	Subtotal      string
	Discount      string
	Tax           string
	TaxPctLabel   string
	TotalAmount   string
	AmountPaid    string
	Balance       string
	Notes         string
	Items         []InvoiceItem
	// LogoBase64 is the store logo as a data URL ("data:image/...;base64,...").
	// It is typed as template.URL so html/template does not escape or block the
	// data: scheme — the value has already been validated by the controller.
	// Empty string means no logo — the template conditionally renders the <img>.
	LogoBase64 template.URL
	// InvoiceURL is the public URL to encode in the QR code.
	// It points to the statically-served HTML invoice so scanning the QR
	// opens the invoice directly in any browser.
	InvoiceURL string
}

// InvoiceItem is one line on the printed invoice.
type InvoiceItem struct {
	ProductName string
	BrandName   string
	IMEI        string
	Price       string
}

// RenderInvoiceHTML generates a complete, self-contained HTML invoice for the
// given bill + store settings and returns the HTML as a byte slice.
// It also writes the file to storagePath/<billID>.html for later retrieval.
// If storagePath is empty the file is not persisted.
// staticBaseURL is used to build the QR code link (e.g. "http://yourdomain.com/static").
func RenderInvoiceHTML(bill *models.Bill, settings *models.Settings, storagePath, staticBaseURL string) ([]byte, error) {
	currency := "₹"
	if settings != nil && settings.Currency != "" {
		currency = settings.Currency
	}

	storeName := "New Aman Agency"
	if settings != nil && settings.StoreName != "" {
		storeName = settings.StoreName
	}

	data := InvoiceData{
		Bill:          bill,
		Settings:      settings,
		StoreName:     storeName,
		Currency:      currency,
		BillNumber:    bill.BillNumber,
		CustomerName:  bill.CustomerName,
		CustomerPhone: bill.CustomerPhone,
		CreatedAt:     bill.CreatedAt.In(istLoc()).Format("02 Jan 2006"),
		Subtotal:      fmt.Sprintf("%s %.2f", currency, bill.Subtotal),
		TotalAmount:   fmt.Sprintf("%s %.2f", currency, bill.TotalAmount),
		AmountPaid:    fmt.Sprintf("%s %.2f", currency, bill.AmountPaid),
		Balance:       fmt.Sprintf("%s %.2f", currency, bill.Balance),
		InvoiceURL:    InvoiceStaticURL(staticBaseURL, bill.ID.Hex()),
	}

	if settings != nil {
		data.StoreAddr = settings.StoreAddress
		data.StorePhone = settings.StorePhone
		data.StoreEmail = settings.StoreEmail
		data.HeaderText = settings.BillHeaderText
		data.FooterText = settings.BillFooterText
		// Cast to template.URL so html/template trusts the data: scheme.
		// The value was validated on upload (controller enforces image/* MIME).
		data.LogoBase64 = template.URL(settings.LogoBase64)
	}

	if bill.Discount > 0 {
		data.Discount = fmt.Sprintf("-%s %.2f", currency, bill.Discount)
	}
	if bill.Tax > 0 {
		data.TaxPctLabel = fmt.Sprintf("GST %.0f%%", bill.TaxPct*100)
		data.Tax = fmt.Sprintf("+%s %.2f", currency, bill.Tax)
	}
	if bill.Notes != "" {
		data.Notes = bill.Notes
	}
	if bill.IssuedAt != nil {
		data.IssuedAt = bill.IssuedAt.In(istLoc()).Format("02 Jan 2006, 15:04")
	}

	for _, item := range bill.Items {
		imei := item.IMEI1
		if item.IMEI2 != "" {
			imei += " / " + item.IMEI2
		}
		data.Items = append(data.Items, InvoiceItem{
			ProductName: item.ProductName,
			BrandName:   item.BrandName,
			IMEI:        imei,
			Price:       fmt.Sprintf("%s %.2f", currency, item.UnitPrice),
		})
	}

	tmpl, err := template.New("invoice").Parse(invoiceHTMLTemplate)
	if err != nil {
		return nil, fmt.Errorf("pdf: template parse error: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return nil, fmt.Errorf("pdf: template execute error: %w", err)
	}

	htmlBytes := buf.Bytes()

	// Persist to disk if storage path is configured
	if storagePath != "" {
		if err := os.MkdirAll(storagePath, 0o755); err == nil {
			filename := filepath.Join(storagePath, bill.ID.Hex()+".html")
			_ = os.WriteFile(filename, htmlBytes, 0o644)
		}
	}

	return htmlBytes, nil
}

// InvoiceStaticPath returns the expected filesystem path for a bill's invoice HTML.
func InvoiceStaticPath(storagePath, billID string) string {
	return filepath.Join(storagePath, billID+".html")
}

// InvoiceStaticURL returns the public URL where the invoice HTML can be viewed.
func InvoiceStaticURL(staticBaseURL, billID string) string {
	return fmt.Sprintf("%s/invoices/%s.html", staticBaseURL, billID)
}

// istLoc returns Asia/Kolkata timezone; falls back to UTC on error.
func istLoc() *time.Location {
	loc, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		return time.UTC
	}
	return loc
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML invoice template — A4 print-ready, works on thermal printers too
// ─────────────────────────────────────────────────────────────────────────────

const invoiceHTMLTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice {{.BillNumber}}</title>
  {{if .InvoiceURL}}
  <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
  {{end}}
  <style>
    /* ── Reset ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Page / body ── */
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 13px;
      color: #111;
      background: #f4f4f4;
      padding: 20px;
    }

    /* ── Invoice card ── */
    .invoice-wrapper {
      position: relative;
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 8px;
      overflow: hidden;
    }

    /* ── Watermark ── */
    /* SVG tile set as background-image via JS — covers the full card */
    .watermark {
      position: absolute;
      inset: 0;
      opacity: 0.09;
      pointer-events: none;
      z-index: 0;
      user-select: none;
      background-repeat: repeat;
    }

    /* ── Header ── */
    .header {
      position: relative; z-index: 1;
      background: #0f172a;
      color: #fff;
      padding: 24px 28px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .store-logo {
      max-height: 56px;
      max-width: 180px;
      width: auto;
      object-fit: contain;
      margin-bottom: 8px;
      border-radius: 4px;
      display: block;
    }
    .store-name { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
    .store-meta { font-size: 11px; color: #94a3b8; margin-top: 4px; line-height: 1.6; }
    .header-right { text-align: right; }
    .invoice-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
    .invoice-number { font-size: 18px; font-weight: 700; color: #fff; margin-top: 2px; }
    .invoice-date { font-size: 11px; color: #94a3b8; margin-top: 4px; }
    .header-text { font-size: 11px; color: #94a3b8; margin-top: 6px; white-space: pre-line; }

    /* ── Customer + Bill Info row ── */
    .info-row {
      position: relative; z-index: 1;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .info-box { padding: 20px 28px; }
    .info-box:first-child { border-right: 1px solid #e5e7eb; }
    .info-label { font-size: 10px; font-weight: 600; text-transform: uppercase;
                  letter-spacing: 0.8px; color: #6b7280; margin-bottom: 8px; }
    .info-value { font-size: 14px; font-weight: 600; color: #111; }
    .info-sub   { font-size: 12px; color: #6b7280; margin-top: 3px; }

    /* ── Items table ── */
    .items-section { position: relative; z-index: 1; padding: 20px 28px; }
    .items-title { font-size: 11px; font-weight: 600; text-transform: uppercase;
                   letter-spacing: 0.8px; color: #6b7280; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.5px; color: #6b7280; padding: 8px 0;
      border-bottom: 2px solid #e5e7eb; text-align: left;
    }
    thead th:last-child { text-align: right; }
    tbody td {
      padding: 12px 0; border-bottom: 1px solid #f3f4f6;
      vertical-align: top;
    }
    tbody td:last-child { text-align: right; white-space: nowrap; }
    .item-name { font-weight: 600; font-size: 13px; }
    .item-brand { font-size: 11px; color: #6b7280; }
    .item-imei { font-family: 'Courier New', monospace; font-size: 11px; color: #6b7280; margin-top: 2px; }
    .item-price { font-weight: 600; font-size: 14px; }

    /* ── Totals ── */
    .totals-section {
      position: relative; z-index: 1;
      background: #f8fafc;
      border-top: 2px solid #e5e7eb;
      padding: 20px 28px;
      display: flex;
      justify-content: flex-end;
    }
    .totals-table { min-width: 260px; }
    .totals-row { display: flex; justify-content: space-between; gap: 24px;
                  padding: 4px 0; font-size: 13px; }
    .totals-row.discount { color: #16a34a; }
    .totals-row.tax { color: #6b7280; font-size: 12px; }
    .totals-divider { border: none; border-top: 1px solid #e5e7eb; margin: 8px 0; }
    .totals-row.grand { font-size: 16px; font-weight: 700; padding: 6px 0; }
    .totals-row.balance { color: #dc2626; font-weight: 600; }
    .totals-label { color: #6b7280; }
    .totals-value { font-weight: 600; text-align: right; }
    .totals-row.grand .totals-label,
    .totals-row.grand .totals-value { color: #111; }

    /* ── Notes ── */
    .notes-section { position: relative; z-index: 1; padding: 16px 28px; border-top: 1px solid #e5e7eb; }
    .notes-text { font-size: 12px; color: #6b7280; font-style: italic; }

    /* ── Footer ── */
    .footer {
      position: relative; z-index: 1;
      background: #f8fafc;
      padding: 16px 28px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
    }
    .footer-text { font-size: 12px; color: #9ca3af; white-space: pre-line; flex: 1; }
    .footer-right {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    /* ── QR code ── */
    .qr-wrap { text-align: center; }
    #bill-qr img,
    #bill-qr canvas { width: 88px !important; height: 88px !important; display: block; }
    .qr-label {
      font-size: 9px;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-top: 4px;
      text-align: center;
    }

    /* ── Print button ── */
    .print-btn {
      background: #0f172a; color: #fff; border: none; border-radius: 6px;
      padding: 8px 18px; font-size: 13px; font-weight: 600; cursor: pointer;
      display: flex; align-items: center; gap: 6px;
    }
    .print-btn:hover { background: #1e293b; }

    /* ── Status badge ── */
    .status-badge {
      display: inline-block;
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.8px; padding: 3px 8px; border-radius: 20px;
      margin-top: 6px;
    }
    .status-issued  { background: #d1fae5; color: #065f46; }
    .status-draft   { background: #fef3c7; color: #92400e; }
    .status-voided  { background: #fee2e2; color: #991b1b; }

    /* ── Print styles ── */
    @media print {
      body { background: #fff; padding: 0; }
      .invoice-wrapper { border: none; border-radius: 0; box-shadow: none; }
      .print-btn { display: none !important; }
      .watermark { opacity: 0.10; }
      @page { size: A4; margin: 15mm; }
    }

    /* ── Thermal print override (58mm/80mm receipt) ── */
    @media print and (max-width: 80mm) {
      body { font-size: 11px; }
      .invoice-wrapper { max-width: 100%; }
      .header { flex-direction: column; gap: 8px; padding: 12px; }
      .header-right { text-align: left; }
      .info-row { grid-template-columns: 1fr; }
      .info-box:first-child { border-right: none; border-bottom: 1px solid #e5e7eb; }
      .watermark { display: none; }
      @page { size: 80mm auto; margin: 2mm; }
    }
  </style>
</head>
<body>
  <div class="invoice-wrapper">

    <!-- Watermark: staggered tiled grid, populated by JS -->
    <div class="watermark" id="invoice-watermark" aria-hidden="true"
         data-text="{{.StoreName}}"
         {{if .LogoBase64}}data-logo="{{.LogoBase64}}"{{end}}></div>

    <!-- Header -->
    <div class="header">
      <div>
        {{if .LogoBase64}}
        <img class="store-logo" src="{{.LogoBase64}}" alt="{{.StoreName}} logo" />
        {{end}}
        <div class="store-name">{{.StoreName}}</div>
        <div class="store-meta">
          {{if .StoreAddr}}{{.StoreAddr}}<br/>{{end}}
          {{if .StorePhone}}📞 {{.StorePhone}}{{if .StoreEmail}} &nbsp;|&nbsp; {{end}}{{end}}
          {{if .StoreEmail}}✉️ {{.StoreEmail}}{{end}}
        </div>
        {{if .HeaderText}}<div class="header-text">{{.HeaderText}}</div>{{end}}
      </div>
      <div class="header-right">
        <div class="invoice-label">Invoice</div>
        <div class="invoice-number">{{.BillNumber}}</div>
        <div class="invoice-date">
          {{if .IssuedAt}}Issued: {{.IssuedAt}}{{else}}Created: {{.CreatedAt}}{{end}}
        </div>
        <span class="status-badge status-{{.Bill.Status}}">{{.Bill.Status}}</span>
      </div>
    </div>

    <!-- Customer & Bill Info -->
    <div class="info-row">
      <div class="info-box">
        <div class="info-label">Bill To</div>
        <div class="info-value">{{.CustomerName}}</div>
        {{if .CustomerPhone}}<div class="info-sub">📞 {{.CustomerPhone}}</div>{{end}}
      </div>
      <div class="info-box">
        <div class="info-label">Payment</div>
        <div class="info-value">{{.AmountPaid}} paid</div>
        {{if .Notes}}<div class="info-sub">{{.Notes}}</div>{{end}}
      </div>
    </div>

    <!-- Items -->
    <div class="items-section">
      <div class="items-title">Items ({{len .Items}})</div>
      <table>
        <thead>
          <tr>
            <th style="width:55%">Product</th>
            <th style="width:30%">IMEI</th>
            <th style="width:15%">Price</th>
          </tr>
        </thead>
        <tbody>
          {{range .Items}}
          <tr>
            <td>
              <div class="item-name">{{.ProductName}}</div>
              <div class="item-brand">{{.BrandName}}</div>
            </td>
            <td><div class="item-imei">{{.IMEI}}</div></td>
            <td><div class="item-price">{{.Price}}</div></td>
          </tr>
          {{end}}
        </tbody>
      </table>
    </div>

    <!-- Totals -->
    <div class="totals-section">
      <div class="totals-table">
        <div class="totals-row">
          <span class="totals-label">Subtotal</span>
          <span class="totals-value">{{.Subtotal}}</span>
        </div>
        {{if .Discount}}
        <div class="totals-row discount">
          <span class="totals-label">Discount</span>
          <span class="totals-value">{{.Discount}}</span>
        </div>
        {{end}}
        {{if .Tax}}
        <div class="totals-row tax">
          <span class="totals-label">{{.TaxPctLabel}}</span>
          <span class="totals-value">{{.Tax}}</span>
        </div>
        {{end}}
        <hr class="totals-divider" />
        <div class="totals-row grand">
          <span class="totals-label">Total</span>
          <span class="totals-value">{{.TotalAmount}}</span>
        </div>
        {{if gt .Bill.Balance 0.01}}
        <div class="totals-row balance">
          <span class="totals-label">Balance Due</span>
          <span class="totals-value">{{.Balance}}</span>
        </div>
        {{end}}
      </div>
    </div>

    {{if .Notes}}
    <div class="notes-section">
      <div class="info-label">Notes</div>
      <div class="notes-text">{{.Notes}}</div>
    </div>
    {{end}}

    <!-- Footer -->
    <div class="footer">
      <div class="footer-text">
        {{if .FooterText}}{{.FooterText}}{{else}}Thank you for your purchase! 🙏{{end}}
      </div>
      <div class="footer-right">
        {{if .InvoiceURL}}
        <div class="qr-wrap">
          <div id="bill-qr" data-url="{{.InvoiceURL}}"></div>
          <div class="qr-label">Scan to view invoice</div>
        </div>
        {{end}}
        <button class="print-btn" onclick="window.print()">
          🖨️ Print / Save PDF
        </button>
      </div>
    </div>

  </div>

  <script>
    // Build the staggered-grid watermark as a repeating SVG background.
    // Each tile is 400×220px with TWO instances placed at opposite quadrants
    // (offset by W/2, H/2) so CSS repeat creates the classic brick stagger.
    // When a logo is present it appears above the store name in every tile.
    (function() {
      var wm = document.getElementById('invoice-watermark');
      if (!wm) return;

      var raw  = wm.getAttribute('data-text') || 'New Aman Agency';
      var name = raw.toUpperCase();
      var year = '©' + new Date().getFullYear();
      var logo = wm.getAttribute('data-logo') || '';

      var esc = function(s) {
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      };
      var n = esc(name), y = esc(year);

      var W = 400, H = 220;
      var iW = 28, iH = 28; // logo dimensions inside tile

      // Build one tile instance.
      // cx = horizontal centre; topY = top edge of the instance block.
      var inst = function(cx, topY) {
        var s = '';
        var textY, yearY;
        if (logo) {
          // Logo centred horizontally above the text
          s += '<image href="' + logo + '"' +
               ' x="' + (cx - iW / 2) + '" y="' + topY + '"' +
               ' width="' + iW + '" height="' + iH + '"' +
               ' preserveAspectRatio="xMidYMid meet"/>';
          textY = topY + iH + 14;
          yearY = topY + iH + 30;
        } else {
          textY = topY + 16;
          yearY = topY + 32;
        }
        var font = 'font-family="Georgia,\'Times New Roman\',serif"';
        s += '<text x="' + cx + '" y="' + textY + '" ' + font +
             ' font-size="14" font-weight="bold" fill="#0f172a"' +
             ' text-anchor="middle" letter-spacing="3">' + n + '</text>';
        s += '<text x="' + cx + '" y="' + yearY + '" ' + font +
             ' font-size="10" fill="#0f172a" text-anchor="middle" letter-spacing="2">' + y + '</text>';
        return s;
      };

      // Instance 1: upper-left quadrant  (cx=W/4=100,  topY=20)
      // Instance 2: lower-right quadrant (cx=3W/4=300, topY=20+H/2=130)
      var svg =
        '<svg xmlns="http://www.w3.org/2000/svg"' +
            ' xmlns:xlink="http://www.w3.org/1999/xlink"' +
            ' width="' + W + '" height="' + H + '">' +
          inst(100, 20) +
          inst(300, 130) +
        '</svg>';

      wm.style.backgroundImage = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
      wm.style.backgroundSize  = W + 'px ' + H + 'px';
    })();
  </script>

  {{if .InvoiceURL}}
  <script>
    (function() {
      var el = document.getElementById('bill-qr');
      // URL is stored in a data attribute so html/template's HTML-escaping
      // is applied at write time; the browser HTML-decodes it on read,
      // giving us back the original URL with no JS escaping issues.
      if (!el || typeof QRCode === 'undefined') return;
      var url = el.getAttribute('data-url');
      if (!url) return;
      new QRCode(el, {
        text: url,
        width: 88,
        height: 88,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    })();
  </script>
  {{end}}
</body>
</html>`
