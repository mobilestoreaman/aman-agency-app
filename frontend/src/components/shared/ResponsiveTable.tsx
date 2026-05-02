/**
 * ResponsiveTable
 * ────────────────────────────────────────────────────────────────────────────
 * A single, generic table component with a built-in mobile card renderer.
 *
 * RESPONSIVE STRATEGY
 *  • ≥ sm (640 px)  → standard scrollable table  (overflow-x-auto)
 *  •  < sm (mobile) → stack rows as configurable cards (no scroll, no squish)
 *
 * USAGE
 * ─────
 * 1. Define columns exactly as you would for <DataTable> (same Column<T> type).
 * 2. Add a `mobileCard` prop that maps column keys to card sections:
 *
 *    <ResponsiveTable
 *      columns={columns}
 *      data={data}
 *      mobileCard={{
 *        top:     ['customer', 'type'],          // primary identity + badges
 *        middle:  ['amount', 'balance_after'],   // key numeric highlight data
 *        bottom:  ['date', 'ref', 'notes'],      // secondary / supplementary
 *        actions: 'actions',                     // action buttons → top-right
 *      }}
 *    />
 *
 * 3. Without `mobileCard`, the component behaves identically to <DataTable>
 *    (scrollable table at every breakpoint).
 *
 * IMPORTANT NOTES
 * ───────────────
 * • column.className values (hidden sm:table-cell, etc.) govern TABLE visibility.
 *   They are intentionally ignored for cards — mobileCard config is the sole
 *   source of truth for the mobile layout.
 * • Column keys listed in mobileCard but not present in columns[] are silently
 *   ignored — safe to include future columns without crashes.
 * • The `actions` column is still rendered in the table (all columns are).
 *   In the card, actions are placed at the top-right regardless of their
 *   position in the columns array.
 */

import { useState, useMemo, useEffect } from 'react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft, ChevronRight, Inbox,
  ChevronsUpDown, ChevronUp, ChevronDown,
} from 'lucide-react'
import EmptyState from '@/components/shared/EmptyState'
import type { PaginationMeta } from '@/types'

// ── Re-export Column so consumers can import from one place ───────────────────
export type { Column } from './DataTable'
import type { Column } from './DataTable'

// ── Mobile card configuration ─────────────────────────────────────────────────

/**
 * Describes how a table row maps to the three sections of a mobile card.
 *
 * top     – primary identity: name, status badge, invoice number, type chip.
 *           Rendered as a flex-wrap row. The `actions` key is pinned right.
 * middle  – key numeric / highlight data: amount, balance, count, percentage.
 *           Rendered as a row of labelled columns (label above, value below).
 * bottom  – secondary or supplementary info: date, reference, notes, address.
 *           Rendered as compact label: value rows with text truncation.
 * actions – column key whose cell() output is pinned to the top-right.
 *           The column is still rendered normally in the table view.
 */
export interface MobileCardConfig {
  top:      string[]
  middle?:  string[]
  bottom?:  string[]
  actions?: string
}

// ── Internal sort state ───────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc'

interface SortState {
  key:   string
  dir:   SortDir
  /** Click counter — 1 = DESC, 2 = ASC, 3 = reset */
  ticks: number
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ResponsiveTableProps<T> {
  columns:       Column<T>[]
  data:          T[]
  isLoading?:    boolean
  meta?:         PaginationMeta
  onPageChange?: (page: number) => void
  emptyMessage?: string
  skeletonRows?: number
  /**
   * Table min-width before horizontal scroll kicks in.
   * Default '560px'. Pass a smaller value for narrow tables (Brands, Vendors).
   * Ignored below sm breakpoint (cards render instead).
   */
  minWidth?:     string
  /**
   * Mobile card layout configuration.
   * If omitted, the component falls back to scrollable-table-only behaviour
   * identical to <DataTable>, at every breakpoint.
   */
  mobileCard?:   MobileCardConfig
  /**
   * Pre-select an initial sort column and direction on first render.
   * The user can still click column headers to change or clear the sort.
   */
  defaultSort?:  { key: string; dir: 'asc' | 'desc' }
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Generic card skeleton — approximate shape of a typical mobile card. */
function MobileSkeletonCard() {
  return (
    <div className="rounded-xl border border-border/70 bg-card shadow-card px-4 py-3 space-y-3">
      {/* top */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-7 w-14 shrink-0" />
      </div>
      {/* middle */}
      <div className="flex gap-5 border-t border-border/50 pt-2.5">
        <div className="space-y-1">
          <Skeleton className="h-2.5 w-12" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-5 w-24" />
        </div>
      </div>
      {/* bottom */}
      <div className="space-y-1.5 border-t border-border/40 pt-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  )
}

/** Shared pagination bar used below both the table and the card list. */
function PaginationBar({
  meta,
  onPageChange,
}: {
  meta: PaginationMeta
  onPageChange?: (page: number) => void
}) {
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
      <span className="text-xs">
        {meta.total_pages > 1
          ? `${(meta.page - 1) * meta.limit + 1}–${Math.min(
              meta.page * meta.limit,
              meta.total,
            )} of ${meta.total} records`
          : `${meta.total} record${meta.total !== 1 ? 's' : ''}`}
      </span>
      {meta.total_pages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-border/70"
            disabled={meta.page <= 1}
            onClick={() => onPageChange?.(meta.page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-3 text-xs font-medium text-foreground">
            {meta.page} / {meta.total_pages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-border/70"
            disabled={meta.page >= meta.total_pages}
            onClick={() => onPageChange?.(meta.page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Main exported component ───────────────────────────────────────────────────

export function ResponsiveTable<T,>({
  columns,
  data,
  isLoading,
  meta,
  onPageChange,
  emptyMessage = 'No records found.',
  skeletonRows = 6,
  minWidth = '560px',
  mobileCard,
  defaultSort,
}: ResponsiveTableProps<T>) {
  // ── Sorting ────────────────────────────────────────────────────────────────
  const [sort, setSort] = useState<SortState | null>(
    defaultSort
      ? { key: defaultSort.key, dir: defaultSort.dir, ticks: defaultSort.dir === 'desc' ? 1 : 2 }
      : null,
  )

  // Auto-reset to page 1 when current page exceeds total_pages (e.g. after deletion)
  useEffect(() => {
    if (!isLoading && meta && meta.page > meta.total_pages && meta.total_pages > 0) {
      onPageChange?.(1)
    }
  }, [meta, isLoading, onPageChange])

  const handleSort = (col: Column<T>) => {
    if (!col.sortValue) return
    setSort((prev) => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: 'desc', ticks: 1 }
      if (prev.ticks === 1) return { ...prev, dir: 'asc', ticks: 2 }
      return null // 3rd click → reset to server order
    })
  }

  const sortedData = useMemo(() => {
    if (!sort) return data
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return data
    return [...data].sort((a, b) => {
      const av = col.sortValue!(a)
      const bv = col.sortValue!(b)
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, {
              numeric: true,
              sensitivity: 'base',
            })
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [data, sort, columns])

  // ── Column lookup map — O(1) access by key ─────────────────────────────────
  const colMap = useMemo(
    () => new Map(columns.map((c) => [c.key, c])),
    [columns],
  )

  // ── Shared empty state ─────────────────────────────────────────────────────
  const emptyState = (
    <EmptyState icon={Inbox} title={emptyMessage} />
  )

  // ── Mobile card renderer ───────────────────────────────────────────────────
  // Defined inside the component body so it closes over T without needing
  // a separate generic component (avoids TSX generic ambiguity).
  const renderMobileCard = (row: T, rowIdx: number) => {
    if (!mobileCard) return null

    const { top = [], middle = [], bottom = [], actions: actionsKey } = mobileCard

    /** Render a column's cell for this row, or null if the column doesn't exist. */
    const cell  = (key: string) => colMap.get(key)?.cell(row) ?? null
    /** Get a column's header label. */
    const label = (key: string) => colMap.get(key)?.header ?? ''

    const actionsContent = actionsKey ? cell(actionsKey) : null

    return (
      <div
        key={rowIdx}
        className="rounded-xl border border-border/70 bg-card shadow-card px-4 py-3"
      >
        {/* ── TOP: primary identity row ─────────────────────────────────── */}
        <div className="flex items-start justify-between gap-2">
          {/* Left: top cells inline (name, badge, invoice, etc.) */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 py-0.5">
            {top.map((key) => {
              const content = cell(key)
              if (content == null) return null
              return (
                <div key={key} className="min-w-0 max-w-full">
                  {content}
                </div>
              )
            })}
          </div>

          {/* Right: action buttons pinned to top-right */}
          {actionsContent != null && (
            <div className="-mr-1.5 -mt-0.5 shrink-0">
              {actionsContent}
            </div>
          )}
        </div>

        {/* ── MIDDLE: key data as labelled columns ─────────────────────── */}
        {(middle ?? []).length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-2 border-t border-border/50 pt-2.5">
            {(middle ?? []).map((key) => {
              const content = cell(key)
              if (content == null) return null
              const lbl = label(key)
              return (
                <div key={key} className="flex min-w-0 flex-col gap-0.5">
                  {lbl && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-none">
                      {lbl}
                    </span>
                  )}
                  <div className="min-w-0">{content}</div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── BOTTOM: secondary data as label: value rows ───────────────── */}
        {(bottom ?? []).length > 0 && (
          <div className="mt-2 flex flex-col gap-1 border-t border-border/40 pt-2">
            {(bottom ?? []).map((key) => {
              const content = cell(key)
              if (content == null) return null
              const lbl = label(key)
              return (
                <div key={key} className="flex min-w-0 items-baseline gap-1.5">
                  {lbl && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {lbl}:
                    </span>
                  )}
                  <div className="min-w-0 flex-1 overflow-hidden text-xs text-foreground/80">
                    {content}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── Table section (sm+, or always when mobileCard is omitted) ─────────────
  const tableSection = (
    <div
      className={[
        'rounded-xl border border-border/70 bg-card shadow-card',
        mobileCard ? 'hidden sm:block' : '',
      ].join(' ')}
    >
      <div className="overflow-x-auto">
        <Table style={{ minWidth }}>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/70">
              {columns.map((col) => {
                const isSortable = !!col.sortValue
                const isActive   = sort?.key === col.key
                const dir        = isActive ? sort!.dir : null

                return (
                  <TableHead
                    key={col.key}
                    className={[
                      'bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground h-10',
                      col.className ?? '',
                      isSortable ? 'cursor-pointer select-none' : '',
                    ].join(' ')}
                    onClick={isSortable ? () => handleSort(col) : undefined}
                    aria-sort={
                      isActive
                        ? dir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                  >
                    {isSortable ? (
                      <span className="group inline-flex items-center gap-1">
                        {col.header}
                        <span
                          className={`transition-opacity ${
                            isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'
                          }`}
                        >
                          {dir === 'asc' ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : dir === 'desc' ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronsUpDown className="h-3 w-3" />
                          )}
                        </span>
                      </span>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <TableRow key={i} className="border-border/50">
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      <Skeleton className="h-4 w-full max-w-[120px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : sortedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-44 text-center">
                  {emptyState}
                </TableCell>
              </TableRow>
            ) : (
              sortedData.map((row, i) => (
                <TableRow
                  key={i}
                  className="border-border/50 transition-colors hover:bg-muted/30"
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )

  // ── Mobile card section (< sm, only when mobileCard config is given) ───────
  const cardSection = mobileCard ? (
    <div className="flex flex-col gap-3 sm:hidden">
      {isLoading ? (
        Array.from({ length: Math.min(skeletonRows, 4) }).map((_, i) => (
          <MobileSkeletonCard key={i} />
        ))
      ) : sortedData.length === 0 ? (
        emptyState
      ) : (
        sortedData.map((row, i) => renderMobileCard(row, i))
      )}
    </div>
  ) : null

  // ── Compose ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      {tableSection}
      {cardSection}

      {/* Pagination — always rendered when data exists, shared across both views */}
      {meta && meta.total > 0 && (
        <PaginationBar meta={meta} onPageChange={onPageChange} />
      )}
    </div>
  )
}
