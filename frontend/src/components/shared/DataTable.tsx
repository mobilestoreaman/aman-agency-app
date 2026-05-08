/**
 * DataTable<T>
 * ─────────────────────────────────────────────────────────────────────────────
 * Modern, accessible, fully-scrollable table with sticky headers, sorting,
 * pagination, and full support for large datasets.
 *
 * SCROLLING ARCHITECTURE
 * ──────────────────────
 * A single `overflow: auto` div acts as the scroll container for BOTH axes:
 *
 *   ┌─ card shell (rounded-xl border overflow-hidden) ──────────────────────┐
 *   │  ┌─ scroll container (overflow: auto) ─────────────────────────────┐  │
 *   │  │  ┌─ <table> (min-w-full; expands when columns overflow) ──────┐  │  │
 *   │  │  │  <thead> sticky top-0  ← sticks to TOP of scroll container │  │  │
 *   │  │  │  <tbody>               ← scrolls under sticky header       │  │  │
 *   │  │  └──────────────────────────────────────────────────────────────┘  │  │
 *   │  └──────────────────────────────────────────────────────────────────┘  │
 *   └────────────────────────────────────────────────────────────────────────┘
 *
 * • Horizontal scroll: when column content exceeds container width, the table
 *   expands and a scrollbar appears. The sticky thead moves WITH the horizontal
 *   scroll (keeping headers aligned with their data cells).
 * • Vertical scroll: `maxHeight` caps the container height. tbody rows scroll
 *   under the pinned thead.
 * • Parents MUST have `min-width: 0` (not `auto`) to bound the container. Use
 *   Tailwind `min-w-0` on any flex/grid ancestor.
 *
 * COLUMN DEFINITION
 * ─────────────────
 * interface Column<T> {
 *   key:          string            // unique column id
 *   header:       string            // header label
 *   cell:         (row: T) => ReactNode  // cell renderer
 *   sortValue?:   (row: T) => string | number  // enables client-side sort
 *   align?:       'left' | 'center' | 'right'  // text alignment
 *   className?:   string            // applied to both <th> and <td>
 *   minWidth?:    string            // e.g. '100px'
 *   truncate?:    boolean           // ellipsis + title tooltip for long text
 * }
 *
 * USAGE
 * ─────
 *   const columns: Column<Sale>[] = [
 *     { key: 'invoice', header: 'Invoice', cell: r => r.invoice_number, sortValue: r => r.invoice_number },
 *     { key: 'amount',  header: 'Amount',  cell: r => fmt(r.total),      align: 'right' },
 *   ]
 *   <DataTable columns={columns} data={data} isLoading={isLoading} meta={meta} onPageChange={setPage} />
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Skeleton }  from '@/components/ui/skeleton'
import { Button }    from '@/components/ui/button'
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ChevronUp, ChevronDown, ChevronsUpDown, Inbox,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PaginationMeta } from '@/types'

// ── Column definition ─────────────────────────────────────────────────────────

export interface Column<T> {
  /** Unique column identifier. Used as React key and sort key. */
  key: string
  /** Column header label (string; rendered inside <th>). */
  header: string
  /** Cell renderer — receives the row object, returns any React node. */
  cell: (row: T) => React.ReactNode
  /**
   * Return a primitive for client-side sorting.
   * - Numbers  → numeric comparison
   * - Strings  → locale-aware alphabetical (handles numeric strings too)
   * - ISO date strings → lexicographic (correct for ISO 8601 format)
   * Omit to make the column non-sortable.
   */
  sortValue?: (row: T) => string | number
  /** Text alignment for both header and cells. Defaults to 'left'. */
  align?: 'left' | 'center' | 'right'
  /**
   * CSS class applied to BOTH <th> and <td> for this column.
   * Use for visibility breakpoints: e.g. 'hidden sm:table-cell'
   * or alignment: 'text-right'. These are applied last so they override
   * component defaults.
   */
  className?: string
  /**
   * Minimum column width. Applied as a CSS min-width style.
   * e.g. '100px', '8rem'. Useful to prevent narrow columns from
   * collapsing when many columns are present.
   */
  minWidth?: string
  /**
   * When true, long text in cells is truncated with an ellipsis and
   * the full value is shown in a native `title` tooltip on hover.
   * Requires a maxWidth via `className` (e.g. 'max-w-[200px]') to
   * take effect — or the column's natural width will bound it.
   */
  truncate?: boolean
}

// ── Internal sort state ───────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc'

interface SortState {
  key:   string
  dir:   SortDir
  /** Click counter — 1 = DESC, 2 = ASC, 3 = reset to server order */
  ticks: number
}

// ── DataTable props ───────────────────────────────────────────────────────────

export interface DataTableProps<T> {
  /** Column definitions. */
  columns: Column<T>[]
  /** Row data. */
  data: T[]
  /** Shows skeleton rows while true. */
  isLoading?: boolean
  /** Server pagination metadata. When provided, the pagination bar is shown. */
  meta?: PaginationMeta
  /** Called when the user navigates to a different page. */
  onPageChange?: (page: number) => void
  /** Text shown in the empty state. Default: 'No records found.' */
  emptyMessage?: string
  /** Number of skeleton rows shown while loading. Default: 6. */
  skeletonRows?: number
  /**
   * Hard minimum width for the table before horizontal scroll kicks in.
   * Default: '560px'. Pass a narrower value for simple 2-3 column tables.
   */
  minWidth?: string
  /**
   * Pre-select a sort column and direction on first render.
   * The user can still change or clear it by clicking headers.
   */
  defaultSort?: { key: string; dir: 'asc' | 'desc' }
  /**
   * Maximum height of the scroll container before vertical scroll kicks in.
   * Default: undefined (table grows to its natural height).
   * Pass a CSS value: e.g. 'calc(100vh - 280px)' or '600px'.
   */
  maxHeight?: string
  /** Optional click handler for rows. Adds a pointer cursor to rows. */
  onRowClick?: (row: T) => void
  /** ARIA label for the table element itself. Default: 'Data table'. */
  ariaLabel?: string
}

// ── Pagination bar ────────────────────────────────────────────────────────────

/** Smart pagination bar with page-window, first/last buttons, and record count. */
export function PaginationBar({
  meta,
  onPageChange,
}: {
  meta: PaginationMeta
  onPageChange?: (page: number) => void
}) {
  const { page, total, limit, total_pages } = meta
  const from = (page - 1) * limit + 1
  const to   = Math.min(page * limit, total)

  /**
   * Returns an array of page numbers and 'ellipsis' sentinels.
   * Always shows first and last page; shows up to 5 consecutive around current.
   */
  const pageWindow = useMemo((): (number | 'ellipsis')[] => {
    if (total_pages <= 7) {
      return Array.from({ length: total_pages }, (_, i) => i + 1)
    }
    if (page <= 4) {
      return [1, 2, 3, 4, 5, 'ellipsis', total_pages]
    }
    if (page >= total_pages - 3) {
      return [
        1, 'ellipsis',
        total_pages - 4, total_pages - 3, total_pages - 2,
        total_pages - 1, total_pages,
      ]
    }
    return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', total_pages]
  }, [page, total_pages])

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
      {/* Record count */}
      <p className="text-xs text-muted-foreground shrink-0">
        {total_pages > 1
          ? `Showing ${from}–${to} of ${total.toLocaleString()} records`
          : `${total.toLocaleString()} record${total !== 1 ? 's' : ''}`}
      </p>

      {total_pages > 1 && (
        <div className="flex items-center gap-1" role="navigation" aria-label="Pagination">
          {/* First */}
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 border-border/70"
            disabled={page <= 1}
            onClick={() => onPageChange?.(1)}
            aria-label="First page"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
          {/* Prev */}
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 border-border/70"
            disabled={page <= 1}
            onClick={() => onPageChange?.(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>

          {/* Page number window — hidden on xs, visible sm+ */}
          <div className="hidden sm:flex items-center gap-0.5">
            {pageWindow.map((p, i) =>
              p === 'ellipsis' ? (
                <span
                  key={`ellipsis-${i}`}
                  className="w-7 text-center text-xs text-muted-foreground/60 select-none"
                  aria-hidden
                >
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  variant={p === page ? 'default' : 'outline'}
                  size="icon"
                  className={cn(
                    'h-7 w-7 text-xs font-medium',
                    p !== page && 'border-border/70',
                  )}
                  onClick={() => onPageChange?.(p as number)}
                  aria-label={`Page ${p}`}
                  aria-current={p === page ? 'page' : undefined}
                >
                  {p}
                </Button>
              ),
            )}
          </div>

          {/* Mobile: current / total */}
          <span
            className="sm:hidden px-2 text-xs font-medium text-foreground"
            aria-live="polite"
          >
            {page} / {total_pages}
          </span>

          {/* Next */}
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 border-border/70"
            disabled={page >= total_pages}
            onClick={() => onPageChange?.(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          {/* Last */}
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 border-border/70"
            disabled={page >= total_pages}
            onClick={() => onPageChange?.(total_pages)}
            aria-label="Last page"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({
  active,
  dir,
}: {
  active: boolean
  dir: SortDir | null
}) {
  if (active && dir === 'asc')  return <ChevronUp   className="h-3 w-3 shrink-0 text-primary" />
  if (active && dir === 'desc') return <ChevronDown  className="h-3 w-3 shrink-0 text-primary" />
  return (
    <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
  )
}

// ── Main DataTable component ──────────────────────────────────────────────────

export function DataTable<T>({
  columns,
  data,
  isLoading,
  meta,
  onPageChange,
  emptyMessage  = 'No records found.',
  skeletonRows  = 6,
  minWidth      = '560px',
  defaultSort,
  maxHeight,
  onRowClick,
  ariaLabel     = 'Data table',
}: DataTableProps<T>) {

  // ── Sorting ──────────────────────────────────────────────────────────────
  const [sort, setSort] = useState<SortState | null>(
    defaultSort
      ? { key: defaultSort.key, dir: defaultSort.dir, ticks: defaultSort.dir === 'desc' ? 1 : 2 }
      : null,
  )

  // 3-state sort cycle: unsorted → DESC → ASC → reset
  const handleSort = useCallback((col: Column<T>) => {
    if (!col.sortValue) return
    setSort((prev) => {
      if (!prev || prev.key !== col.key) return { key: col.key, dir: 'desc', ticks: 1 }
      if (prev.ticks === 1) return { ...prev, dir: 'asc', ticks: 2 }
      return null  // 3rd click → reset to server order
    })
  }, [])

  // Keyboard sort activation (Enter / Space on sortable header)
  const handleSortKeyDown = useCallback(
    (e: React.KeyboardEvent, col: Column<T>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        handleSort(col)
      }
    },
    [handleSort],
  )

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
          : String(av ?? '').localeCompare(String(bv ?? ''), undefined, {
              numeric: true,
              sensitivity: 'base',
            })
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [data, sort, columns])

  // ── Auto-reset to page 1 when page > total_pages (e.g. after deletion) ───
  useEffect(() => {
    if (!isLoading && meta && meta.page > meta.total_pages && meta.total_pages > 0) {
      onPageChange?.(1)
    }
  }, [meta, isLoading, onPageChange])

  // ── Sticky header shadow on scroll ───────────────────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [headerShadow, setHeaderShadow] = useState(false)

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    setHeaderShadow(el.scrollTop > 2)
  }, [])

  // ── Alignment helper ──────────────────────────────────────────────────────
  const alignClass = (col: Column<T>) => {
    if (col.align === 'center') return 'text-center'
    if (col.align === 'right')  return 'text-right'
    return 'text-left'
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      {/* ── Card shell — visual chrome only, no overflow ───────────────── */}
      <div className="rounded-xl border border-border/70 bg-card shadow-card overflow-hidden">

        {/*
          ── Scroll container ────────────────────────────────────────────────
          Single element that handles BOTH horizontal and vertical overflow.
          This is the critical piece: sticky thead is relative to THIS element,
          so it stays pinned at the top while rows scroll under it, AND it
          moves horizontally with the table so headers stay over their columns.
        */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="overflow-auto"
          style={maxHeight ? { maxHeight } : undefined}
          tabIndex={-1}
          role="region"
          aria-label={ariaLabel}
        >
          <table
            className="min-w-full border-collapse text-sm"
            style={{ minWidth }}
            aria-label={ariaLabel}
          >
            {/* ── Sticky header ─────────────────────────────────────────── */}
            <thead
              className={cn(
                'sticky top-0 z-10 transition-shadow duration-150',
                headerShadow
                  ? 'shadow-[0_2px_8px_0_rgba(0,0,0,0.09)] dark:shadow-[0_2px_8px_0_rgba(0,0,0,0.3)]'
                  : '',
              )}
            >
              <tr className="border-b border-border/70">
                {columns.map((col) => {
                  const isSortable = !!col.sortValue
                  const isActive   = sort?.key === col.key
                  const dir        = isActive ? sort!.dir : null

                  return (
                    <th
                      key={col.key}
                      scope="col"
                      className={cn(
                        // Base styles
                        'bg-muted/40 px-4 py-2.5 h-10',
                        'text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                        'whitespace-nowrap',
                        // Sortable affordance
                        isSortable && 'cursor-pointer select-none hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                        // Active sort column tint
                        isActive && 'text-primary bg-primary/5',
                        // Alignment
                        alignClass(col),
                        // Consumer className (visibility, overrides)
                        col.className,
                      )}
                      style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                      onClick={isSortable ? () => handleSort(col) : undefined}
                      onKeyDown={isSortable ? (e) => handleSortKeyDown(e, col) : undefined}
                      tabIndex={isSortable ? 0 : undefined}
                      aria-sort={
                        isActive
                          ? dir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : isSortable
                          ? 'none'
                          : undefined
                      }
                    >
                      <span className="group inline-flex items-center gap-1">
                        {col.header}
                        {isSortable && <SortIcon active={isActive} dir={dir} />}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>

            {/* ── Body ──────────────────────────────────────────────────── */}
            <tbody>
              {isLoading ? (
                /* Skeleton rows */
                Array.from({ length: skeletonRows }).map((_, i) => (
                  <tr key={i} className="border-b border-border/40">
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn('px-4 py-3', col.className)}
                        style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                      >
                        <Skeleton className="h-4 w-full max-w-[140px] rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sortedData.length === 0 ? (
                /* Empty state */
                <tr>
                  <td colSpan={columns.length} className="px-4 py-14 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <Inbox className="h-6 w-6 opacity-50" />
                      </div>
                      <p className="text-sm font-medium">{emptyMessage}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                /* Data rows */
                sortedData.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      'border-b border-border/40 transition-colors',
                      // Zebra striping: even rows get a very subtle tint
                      rowIdx % 2 === 1 && 'bg-muted/15',
                      // Hover always brighter than zebra
                      'hover:bg-muted/40 dark:hover:bg-muted/20',
                      // Row click affordance
                      onRowClick && 'cursor-pointer',
                    )}
                  >
                    {columns.map((col) => {
                      const content = col.cell(row)
                      // For truncated columns, get raw text for tooltip
                      const titleAttr =
                        col.truncate && typeof content === 'string' ? content : undefined

                      return (
                        <td
                          key={col.key}
                          className={cn(
                            'px-4 py-3 align-middle text-sm text-foreground/90',
                            col.truncate && 'truncate max-w-[200px]',
                            alignClass(col),
                            col.className,
                          )}
                          style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                          title={titleAttr}
                        >
                          {content}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      {meta && meta.total > 0 && (
        <PaginationBar meta={meta} onPageChange={onPageChange} />
      )}
    </div>
  )
}
