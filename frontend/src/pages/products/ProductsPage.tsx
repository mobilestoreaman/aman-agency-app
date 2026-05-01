import { useState } from 'react'
import { Plus, Pencil, Trash2, Search, Package, LayoutGrid, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ResponsiveTable, type Column } from '@/components/shared/ResponsiveTable'
import PageHeader from '@/components/shared/PageHeader'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import ProductFormModal from '@/components/products/ProductFormModal'
import { useProducts, useDeleteProduct } from '@/hooks/useProducts'
import { useBrands } from '@/hooks/useBrands'
import { useIsAdmin } from '@/store/authStore'
import { useDebounce } from '@/hooks/useDebounce'
import type { Product } from '@/types'

// ── Product card ──────────────────────────────────────────────────────────────
function ProductCard({
  product,
  isAdmin,
  onEdit,
  onDelete,
}: {
  product: Product
  isAdmin: boolean
  onEdit: (p: Product) => void
  onDelete: (p: Product) => void
}) {
  const firstImage = product.images?.[0]

  return (
    <div className="group relative flex flex-col rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md overflow-hidden">
      {/* Image area */}
      <div className="relative h-40 w-full bg-muted/40 flex items-center justify-center overflow-hidden">
        {firstImage ? (
          <img
            src={firstImage}
            alt={product.display_name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <Package className="h-12 w-12 text-muted-foreground/30" />
        )}

        {/* Image count badge */}
        {product.images && product.images.length > 1 && (
          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] text-white font-medium">
            +{product.images.length - 1}
          </span>
        )}

        {/* Admin actions on hover */}
        {isAdmin && (
          <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 bg-background/80 backdrop-blur-sm shadow-sm"
              onClick={() => onEdit(product)}
              aria-label="Edit product"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 bg-background/80 backdrop-blur-sm shadow-sm text-destructive hover:text-destructive"
              onClick={() => onDelete(product)}
              aria-label="Delete product"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1 p-3">
        <p className="text-xs font-semibold text-muted-foreground truncate">{product.brand_name}</p>
        <p className="text-sm font-medium leading-snug line-clamp-2">{product.model_name}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {product.variant?.ram && product.variant.ram !== 'N/A' && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {product.variant.ram}
            </Badge>
          )}
          {product.variant?.storage && product.variant.storage !== 'N/A' && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {product.variant.storage}
            </Badge>
          )}
          {product.color && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {product.color}
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProductsPage() {
  const isAdmin = useIsAdmin()
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [brandId, setBrandId]     = useState('')
  const [view, setView]           = useState<'grid' | 'table'>('grid')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<Product | null>(null)
  const [deleting, setDeleting]   = useState<Product | null>(null)

  const q = useDebounce(search)

  const gridLimit  = 24
  const tableLimit = 15

  const { data, isLoading } = useProducts({
    page,
    limit:    view === 'grid' ? gridLimit : tableLimit,
    search:   q || undefined,
    brand_id: brandId || undefined,
  })

  const { data: brandsData } = useBrands({ limit: 100 })
  const brands = brandsData?.data ?? []

  const deleteProduct = useDeleteProduct()

  const openCreate = () => { setEditing(null); setModalOpen(true) }
  const openEdit   = (p: Product) => { setEditing(p); setModalOpen(true) }

  const handleDelete = () => {
    if (!deleting) return
    deleteProduct.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
  }

  const clearFilters = () => { setSearch(''); setBrandId(''); setPage(1) }
  const hasFilters   = !!search || !!brandId

  const products = data?.data ?? []

  const columns: Column<Product>[] = [
    {
      key: 'model_name',
      header: 'Product',
      sortValue: (p) => p.model_name,
      cell: (p) => (
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center">
            {p.images?.[0] ? (
              <img src={p.images[0]} alt={p.model_name} className="h-full w-full object-cover" />
            ) : (
              <Package className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{p.model_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {p.variant?.ram}/{p.variant?.storage} · {p.color}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'brand',
      header: 'Brand',
      sortValue: (p) => p.brand_name,
      cell: (p) => <span className="text-sm">{p.brand_name}</span>,
      className: 'hidden sm:table-cell',
    },
    {
      key: 'barcode',
      header: 'Barcode',
      cell: (p) => (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{p.barcode}</code>
      ),
      className: 'hidden md:table-cell',
    },
    {
      key: 'screen_size',
      header: 'Screen',
      sortValue: (p) => p.screen_size ?? '',
      cell: (p) => (
        <span className="text-sm text-muted-foreground">{p.screen_size || '—'}</span>
      ),
      className: 'hidden lg:table-cell',
    },
    {
      key: 'actions',
      header: '',
      cell: (p) => (
        <div className="flex items-center justify-end gap-1">
          {isAdmin && (
            <>
              <Button
                variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => openEdit(p)}
                aria-label="Edit product"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setDeleting(p)}
                aria-label="Delete product"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      ),
      className: 'w-20 whitespace-nowrap',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Products"
        description="Catalog of all products across brands."
        action={
          isAdmin && (
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" /> New Product
            </Button>
          )
        }
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>

        {/* Brand filter */}
        <Select value={brandId} onValueChange={(v) => { setBrandId(v === 'all' ? '' : v); setPage(1) }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All brands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All brands</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            Clear
          </Button>
        )}

        {/* View toggle */}
        <div className="flex items-center rounded-md border bg-muted/40 p-0.5 gap-0.5 ml-auto">
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

        {!isLoading && data?.meta && (
          <p className="text-sm text-muted-foreground whitespace-nowrap">
            {data.meta.total} product{data.meta.total !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* ── Grid view ──────────────────────────────────────────────── */}
      {view === 'grid' && (
        <>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex flex-col rounded-xl border bg-card overflow-hidden animate-pulse">
                  <div className="h-40 w-full bg-muted" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 w-16 rounded bg-muted" />
                    <div className="h-4 w-28 rounded bg-muted" />
                    <div className="h-3 w-20 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
              <Package className="h-10 w-10 text-muted-foreground/40" />
              <div>
                <p className="font-medium text-muted-foreground">No products found</p>
                {!hasFilters && isAdmin && (
                  <p className="text-sm text-muted-foreground/70">
                    Add your first product to get started.
                  </p>
                )}
              </div>
              {!hasFilters && isAdmin && (
                <Button onClick={openCreate} variant="outline" className="gap-1.5 mt-1">
                  <Plus className="h-4 w-4" /> New Product
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
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

      {/* ── Table view ─────────────────────────────────────────────── */}
      {view === 'table' && (
        <ResponsiveTable
          columns={columns}
          data={products}
          isLoading={isLoading}
          meta={data?.meta}
          onPageChange={setPage}
          emptyMessage="No products found. Adjust your filters or add the first product."
          mobileCard={{
            top:     ['model_name', 'brand'],
            middle:  [],
            bottom:  ['barcode', 'screen_size'],
            actions: 'actions',
          }}
        />
      )}

      {/* Modals */}
      <ProductFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        product={editing}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        isPending={deleteProduct.isPending}
        title={`Delete "${deleting?.model_name}"?`}
        description="This will permanently delete the product. Existing device records will not be affected."
        confirmLabel="Delete product"
      />
    </div>
  )
}
