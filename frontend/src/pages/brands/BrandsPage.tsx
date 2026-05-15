import { useState } from 'react'
import { Plus, Pencil, Trash2, Search, Tag, LayoutGrid, List, ImageOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ResponsiveTable, type Column } from '@/components/shared/ResponsiveTable'
import PageHeader from '@/components/shared/PageHeader'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import BrandFormModal from '@/components/brands/BrandFormModal'
import { useBrands, useDeleteBrand } from '@/hooks/useBrands'
import { useIsAdmin } from '@/store/authStore'
import { useDebounce } from '@/hooks/useDebounce'
import { formatDate } from '@/utils/date'
import type { Brand } from '@/types'

// ── Brand logo / placeholder ──────────────────────────────────────────────────
function BrandLogo({ brand, size = 'md' }: { brand: Brand; size?: 'sm' | 'md' | 'lg' }) {
  const [imgError, setImgError] = useState(false)
  const sizeMap = {
    sm: 'h-7 w-7',
    md: 'h-14 w-14',
    lg: 'h-20 w-20',
  }
  const iconMap = {
    sm: 'h-3.5 w-3.5',
    md: 'h-6 w-6',
    lg: 'h-9 w-9',
  }
  if (brand.logo_url && !imgError) {
    return (
      <img
        src={brand.logo_url}
        alt={brand.name}
        className={`${sizeMap[size]} rounded-lg object-contain`}
        onError={() => setImgError(true)}
      />
    )
  }
  return (
    <div
      className={`${sizeMap[size]} flex items-center justify-center rounded-lg bg-muted`}
      title={imgError ? 'Image failed to load' : undefined}
    >
      <Tag className={`${iconMap[size]} text-muted-foreground`} />
    </div>
  )
}

// ── Card grid view ─────────────────────────────────────────────────────────────
function BrandCard({
  brand,
  isAdmin,
  onEdit,
  onDelete,
}: {
  brand: Brand
  isAdmin: boolean
  onEdit: (b: Brand) => void
  onDelete: (b: Brand) => void
}) {
  const [imgError, setImgError] = useState(false)
  return (
    <div className="group relative flex flex-col items-center gap-3 rounded-xl border bg-card p-5 text-center shadow-sm transition-shadow hover:shadow-md">
      {/* Logo area */}
      <div className="flex h-24 w-full items-center justify-center rounded-lg bg-muted/40 p-3">
        {brand.logo_url && !imgError ? (
          <img
            src={brand.logo_url}
            alt={brand.name}
            className="h-full w-full object-contain"
            onError={() => setImgError(true)}
          />
        ) : (
          <ImageOff className="h-10 w-10 text-muted-foreground/30" />
        )}
      </div>

      {/* Name */}
      <p className="text-sm font-semibold leading-tight">{brand.name}</p>

      {/* Admin actions — visible on hover */}
      {isAdmin && (
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 bg-background/80 backdrop-blur-sm shadow-sm"
            onClick={() => onEdit(brand)}
            aria-label="Edit brand"
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 bg-background/80 backdrop-blur-sm shadow-sm text-destructive hover:text-destructive"
            onClick={() => onDelete(brand)}
            aria-label="Delete brand"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function BrandsPage() {
  const isAdmin = useIsAdmin()
  const [page, setPage]             = useState(1)
  const [search, setSearch]         = useState('')
  const [view, setView]             = useState<'grid' | 'table'>('grid')
  const [modalOpen, setModalOpen]   = useState(false)
  const [editing, setEditing]       = useState<Brand | null>(null)
  const [deleting, setDeleting]     = useState<Brand | null>(null)

  const q = useDebounce(search)

  // Grid view: fetch more at once for a better showcase experience
  const gridLimit = 48
  const tableLimit = 15

  const { data, isLoading } = useBrands({
    page,
    limit:  view === 'grid' ? gridLimit : tableLimit,
    search: q || undefined,
  })

  const deleteBrand = useDeleteBrand()

  const openCreate = () => { setEditing(null); setModalOpen(true) }
  const openEdit   = (b: Brand) => { setEditing(b); setModalOpen(true) }

  const handleDelete = () => {
    if (!deleting) return
    deleteBrand.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
  }

  const brands = data?.data ?? []

  const columns: Column<Brand>[] = [
    {
      key: 'name',
      header: 'Brand',
      sortValue: (b) => b.name,
      cell: (b) => (
        <div className="flex items-center gap-3">
          <BrandLogo brand={b} size="sm" />
          <span className="font-medium">{b.name}</span>
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Added',
      sortValue: (b) => b.created_at,
      cell: (b) => (
        <span className="text-sm text-muted-foreground">{formatDate(b.created_at)}</span>
      ),
      className: 'hidden lg:table-cell',
      shrink: true,
    },
    {
      key: 'actions',
      header: '',
      cell: (b) => (
        <div className="flex items-center justify-end gap-1">
          {isAdmin && (
            <>
              <Button
                variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => openEdit(b)}
                aria-label="Edit brand"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setDeleting(b)}
                aria-label="Delete brand"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      ),
      className: 'whitespace-nowrap',
      shrink: true,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Brands"
        description="Manage mobile brands in your catalog."
        action={
          isAdmin && (
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" /> New Brand
            </Button>
          )
        }
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search brands…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>

        {/* View toggle */}
        <div className="flex items-center rounded-md border bg-muted/40 p-0.5 gap-0.5">
          <Button
            variant={view === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => { setView('grid'); setPage(1) }}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={view === 'table' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => { setView('table'); setPage(1) }}
            aria-label="Table view"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>

        {/* Total count */}
        {!isLoading && data?.meta && (
          <p className="text-sm text-muted-foreground whitespace-nowrap">
            {data.meta.total} brand{data.meta.total !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* ── Grid view ── */}
      {view === 'grid' && (
        <>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center gap-3 rounded-xl border bg-card p-5 animate-pulse"
                >
                  <div className="h-24 w-full rounded-lg bg-muted" />
                  <div className="h-4 w-20 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : brands.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
              <Tag className="h-10 w-10 text-muted-foreground/40" />
              <div>
                <p className="font-medium text-muted-foreground">No brands found</p>
                {!search && isAdmin && (
                  <p className="text-sm text-muted-foreground/70">
                    Add your first brand to get started.
                  </p>
                )}
              </div>
              {!search && isAdmin && (
                <Button onClick={openCreate} variant="outline" className="gap-1.5 mt-1">
                  <Plus className="h-4 w-4" /> New Brand
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {brands.map((brand) => (
                  <BrandCard
                    key={brand.id}
                    brand={brand}
                    isAdmin={isAdmin}
                    onEdit={openEdit}
                    onDelete={setDeleting}
                  />
                ))}
              </div>

              {/* Grid pagination */}
              {data?.meta && data.meta.total_pages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {data.meta.total_pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.meta.total_pages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Table view ── */}
      {view === 'table' && (
        <ResponsiveTable
          columns={columns}
          data={brands}
          isLoading={isLoading}
          meta={data?.meta}
          onPageChange={setPage}
          emptyMessage="No brands found. Add your first brand to get started."
          minWidth="320px"
          mobileCard={{
            top:     ['name'],
            middle:  [],
            bottom:  ['created_at'],
            actions: 'actions',
          }}
        />
      )}

      {/* Modals */}
      <BrandFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        brand={editing}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        isPending={deleteBrand.isPending}
        title={`Delete "${deleting?.name}"?`}
        description="This will permanently remove the brand. Products under this brand will be unlinked."
        confirmLabel="Delete brand"
      />
    </div>
  )
}
