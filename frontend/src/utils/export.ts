/**
 * Lightweight export helpers — no third-party library required.
 *
 * CSV   → plain comma-separated text, downloaded as .csv
 * Excel → SpreadsheetML XML (.xls), opened natively by Excel, LibreOffice, Google Sheets
 */

export type ExportRow  = Record<string, string | number | null | undefined>
export type ExportFormat = 'csv' | 'excel'

// ── CSV ────────────────────────────────────────────────────────────────────────

function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  // Wrap in quotes if the value contains a comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCSV(headers: string[], rows: ExportRow[]): string {
  const lines: string[] = [headers.map(escapeCSV).join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCSV(row[h])).join(','))
  }
  return lines.join('\r\n')
}

// ── SpreadsheetML (Excel XML) ─────────────────────────────────────────────────

function xmlEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function toExcelXML(sheetName: string, headers: string[], rows: ExportRow[]): string {
  const headerRow = headers
    .map((h) => `<Cell ss:StyleID="header"><Data ss:Type="String">${xmlEscape(h)}</Data></Cell>`)
    .join('')

  const dataRows = rows.map((row) => {
    const cells = headers.map((h) => {
      const val = row[h]
      const type = typeof val === 'number' ? 'Number' : 'String'
      return `<Cell><Data ss:Type="${type}">${xmlEscape(val)}</Data></Cell>`
    }).join('')
    return `<Row>${cells}</Row>`
  }).join('\n        ')

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:x="urn:schemas-microsoft-com:office:excel">
  <Styles>
    <Style ss:ID="header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#D9E1F2" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="${xmlEscape(sheetName)}">
    <Table>
      <Row>${headerRow}</Row>
        ${dataRows}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <FreezePanes/>
      <FrozenNoSplit/>
      <SplitHorizontal>1</SplitHorizontal>
      <TopRowBottomPane>1</TopRowBottomPane>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`
}

// ── Trigger download ───────────────────────────────────────────────────────────

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function downloadExport(
  format: ExportFormat,
  sheetName: string,
  headers: string[],
  rows: ExportRow[],
): void {
  const ts = new Date().toISOString().slice(0, 10)          // YYYY-MM-DD
  const safeName = sheetName.replace(/[^a-z0-9]/gi, '_')

  if (format === 'csv') {
    triggerDownload(
      toCSV(headers, rows),
      `${safeName}_${ts}.csv`,
      'text/csv;charset=utf-8;',
    )
  } else {
    triggerDownload(
      toExcelXML(sheetName, headers, rows),
      `${safeName}_${ts}.xls`,
      'application/vnd.ms-excel;charset=utf-8;',
    )
  }
}
