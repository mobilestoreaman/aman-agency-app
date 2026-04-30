import { useState, useMemo, useEffect } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft, ChevronRight, Inbox,
  ChevronsUpDown, ChevronUp, ChevronDown,
} from 'lucide-react'
import type { PaginationMeta } from '@/types'

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => React.ReactNode
  className?: string
  /**
   * Return a primitive used for client-side sorting.
   * Omit to make the column non-sortable.
   * - Strings → locale-aware alphabetical
   * - ISO date strings → lexicographic (correct for ISO 8601)
   * - Numbers → numeric
   */
  sortValue?: (row: T) => string | number
}

type SortDir = 'asc' | 'desc'

interface SortState {
  key:  string
  dir:  SortDir
  /** How many times this column has been clicked (resets on column change). */
  ticks: number
}

interface DataTableProps<T> {
  columns:      Column<T>[]
  data:         T[]
  isLoading?:   boolean
  meta?:        PaginationMeta
  onPageChange?: (page: number) => void
  emptyMessage?: string
  skeletonRows?: number
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  meta,
  onPageChange,
  emptyMessage = 'No records found.',
  skeletonRows = 6,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(null)

  // Auto-reset to page 1 if we're on an invalid page (e.g. items were deleted
  // reducing total pages below the current page number).
  useEffect(() => {
    if (!isLoading && meta && meta.page > meta.total_pages && meta.total_pages > 0) {
      onPageChange?.(1)
    }
  }, [meta, isLoading, onPageChange])

  // Click behaviour:
  //  1st click on any column  → DESC (newest / highest first)
  //  2nd click (same column)  → ASC
  //  3rd click (same column)  → reset (server order — already newest-first)
  const handleSort = (col: Column<T>) => {
    if (!col.sortValue) return
    setSort((prev) => {
      if (!prev || prev.key !== col.key) {
        return { key: col.key, dir: 'desc', ticks: 1 }
      }
      if (prev.ticks === 1) return { ...prev, dir: 'asc', ticks: 2 }
      return null  // reset to server order
    })
  }

  const sortedData = useMemo(() => {
    if (!sort) return data
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return data

    return [...data].sort((a, b) => {
      const av = col.sortValue!(a)
      const bv = col.sortValue!(b)
      let cmp = 0
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv
      } else {
        cmp = String(av).localeCompare(String(bv), undefined, {
          numeric: true, sensitivity: 'base',
        })
      }
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [data, sort, columns])

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-border/70 bg-card shadow-card">
        <div className="overflow-x-auto">
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/70">
              {columns.map((col) => {
                const isSortable = !!col.sortValue
                const isActive   = sort?.key === col.key
                const dir        = isActive ? sort!.dir : null

                return (
                  <TableHead
                    key={col.key}
                    className={`bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground h-10 ${col.className ?? ''} ${isSortable ? 'cursor-pointer select-none' : ''}`}
                    onClick={isSortable ? () => handleSort(col) : undefined}
                  >
                    {isSortable ? (
                      <span className="inline-flex items-center gap-1 group">
                        {col.header}
                        <span className={`transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
                          {dir === 'asc'  ? <ChevronUp   className="h-3 w-3" /> :
                           dir === 'desc' ? <ChevronDown  className="h-3 w-3" /> :
                                           <ChevronsUpDown className="h-3 w-3" />}
                        </span>
                      </span>
                    ) : col.header}
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
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <Inbox className="h-6 w-6 opacity-50" />
                    </div>
                    <span className="text-sm font-medium">{emptyMessage}</span>
                  </div>
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

      {/* Pagination — always visible when data exists so users always see the record count */}
      {meta && meta.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
          <span className="text-xs">
            {meta.total_pages > 1
              ? `${(meta.page - 1) * meta.limit + 1}–${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total} records`
              : `${meta.total} record${meta.total !== 1 ? 's' : ''}`
            }
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
      )}
    </div>
  )
}
