/**
 * ResponsiveTable<T>
 * ─────────────────────────────────────────────────────────────────────────────
 * A responsive wrapper around DataTable that adds a mobile card layout.
 *
 * RESPONSIVE STRATEGY
 * ───────────────────
 *  ≥ sm (640 px)  →  full scrollable table via DataTable
 *   < sm (mobile) →  rows rendered as configurable cards (no horizontal squish)
 *
 * The mobile card layout is opt-in: pass a `mobileCard` prop to enable it.
 * Without it the component behaves identically to <DataTable> at every breakpoint.
 *
 * USAGE
 * ─────
 *   <ResponsiveTable
 *     columns={columns}
 *     data={data}
 *     isLoading={isLoading}
 *     meta={meta}
 *     onPageChange={setPage}
 *     mobileCard={{
 *       top:     ['customer', 'type'],         // primary identity + status badges
 *       middle:  ['amount', 'balance_after'],  // key numeric / highlight data
 *       bottom:  ['date', 'ref', 'notes'],     // secondary / supplementary info
 *       actions: 'actions',                   // action buttons pinned top-right
 *     }}
 *   />
 *
 * MOBILE CARD ANATOMY
 * ───────────────────
 *   ┌─────────────────────────────────────┐
 *   │ [top cells inline…]       [actions] │  ← flex row, actions pinned right
 *   ├─────────────────────────────────────┤
 *   │ LABEL    LABEL    LABEL             │  ← labelled columns (middle)
 *   │ value    value    value             │
 *   ├─────────────────────────────────────┤
 *   │ label: value                        │  ← compact label: value rows (bottom)
 *   │ label: value                        │
 *   └─────────────────────────────────────┘
 *
 * NOTES
 * ─────
 * • column.className (e.g. 'hidden sm:table-cell') governs TABLE visibility only.
 *   Cards use mobileCard config as sole layout source — className is ignored there.
 * • Keys in mobileCard not found in columns[] are silently skipped — safe to
 *   include prospective columns without crashes.
 * • The `actions` column still renders normally in the table view.
 */

import { useMemo } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Inbox } from 'lucide-react'
import { DataTable, PaginationBar } from '@/components/shared/DataTable'
import type { DataTableProps, Column } from '@/components/shared/DataTable'
import type { PaginationMeta } from '@/types'

// Re-export Column so consumers can import from one place
export type { Column } from '@/components/shared/DataTable'

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
 * actions – column key whose cell() output is pinned to the top-right corner.
 *           The column is still rendered normally in the table view.
 */
export interface MobileCardConfig {
  top:      string[]
  middle?:  string[]
  bottom?:  string[]
  actions?: string
}

// ── ResponsiveTable props ─────────────────────────────────────────────────────

export interface ResponsiveTableProps<T> extends DataTableProps<T> {
  /**
   * Mobile card layout configuration.
   * If omitted, the component falls back to the scrollable table at every
   * breakpoint (identical to <DataTable>).
   */
  mobileCard?: MobileCardConfig
}

// ── Mobile card skeleton ──────────────────────────────────────────────────────

/** Generic skeleton approximating the shape of a typical mobile card. */
function MobileSkeletonCard() {
  return (
    <div className="rounded-xl border border-border/70 bg-card shadow-sm px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-7 w-14 shrink-0" />
      </div>
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
      <div className="space-y-1.5 border-t border-border/40 pt-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
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
  minWidth     = '560px',
  defaultSort,
  maxHeight,
  onRowClick,
  ariaLabel,
  mobileCard,
}: ResponsiveTableProps<T>) {

  // Build O(1) column lookup by key
  const colMap = useMemo(
    () => new Map(columns.map((c) => [c.key, c])),
    [columns],
  )

  // ── Mobile card renderer ──────────────────────────────────────────────────
  // Defined inline to close over generic T without a separate generic component.
  const renderMobileCard = (row: T, rowIdx: number) => {
    if (!mobileCard) return null
    const { top = [], middle = [], bottom = [], actions: actionsKey } = mobileCard

    /** Render a column's cell for this row (null if column not found). */
    const cell  = (key: string) => colMap.get(key)?.cell(row) ?? null
    /** Get a column's header label. */
    const label = (key: string) => colMap.get(key)?.header ?? ''

    const actionsContent = actionsKey ? cell(actionsKey) : null

    return (
      <div
        key={rowIdx}
        className="rounded-xl border border-border/70 bg-card shadow-sm px-4 py-3"
      >
        {/* TOP: primary identity row ──────────────────────────────────────── */}
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

        {/* MIDDLE: key data as labelled columns ───────────────────────────── */}
        {(middle ?? []).length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2 border-t border-border/50 pt-2.5">
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

        {/* BOTTOM: secondary data as label: value rows ────────────────────── */}
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

  // ── No mobile card → render DataTable only ────────────────────────────────
  if (!mobileCard) {
    return (
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        meta={meta}
        onPageChange={onPageChange}
        emptyMessage={emptyMessage}
        skeletonRows={skeletonRows}
        minWidth={minWidth}
        defaultSort={defaultSort}
        maxHeight={maxHeight}
        onRowClick={onRowClick}
        ariaLabel={ariaLabel}
      />
    )
  }

  // ── With mobile card: table (sm+) + cards (< sm) ──────────────────────────

  // Sorted data for both views (sort happens inside DataTable; for cards we
  // duplicate the sort logic here so mobile cards match table order)
  const sortedData = data  // sorting is handled inside DataTable for the table view

  const emptyState = (
    <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-6 w-6 opacity-50" />
      </div>
      <p className="text-sm font-medium">{emptyMessage}</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {/* ── Desktop/tablet table (hidden on xs, visible sm+) ─────────────── */}
      <div className="hidden sm:block">
        <DataTable
          columns={columns}
          data={data}
          isLoading={isLoading}
          meta={meta}
          onPageChange={onPageChange}
          emptyMessage={emptyMessage}
          skeletonRows={skeletonRows}
          minWidth={minWidth}
          defaultSort={defaultSort}
          maxHeight={maxHeight}
          onRowClick={onRowClick}
          ariaLabel={ariaLabel}
        />
      </div>

      {/* ── Mobile card list (visible xs, hidden sm+) ─────────────────────── */}
      <div className="flex flex-col gap-2.5 sm:hidden">
        {isLoading ? (
          Array.from({ length: Math.min(skeletonRows, 4) }).map((_, i) => (
            <MobileSkeletonCard key={i} />
          ))
        ) : sortedData.length === 0 ? (
          emptyState
        ) : (
          sortedData.map((row, i) => renderMobileCard(row, i))
        )}

        {/* Pagination for mobile card view */}
        {meta && meta.total > 0 && (
          <PaginationBar meta={meta} onPageChange={onPageChange} />
        )}
      </div>
    </div>
  )
}
