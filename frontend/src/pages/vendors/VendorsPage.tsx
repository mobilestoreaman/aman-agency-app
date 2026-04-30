import { useState } from 'react'
import { Plus, Pencil, Trash2, Search, Phone, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataTable, type Column } from '@/components/shared/DataTable'
import PageHeader from '@/components/shared/PageHeader'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import VendorFormModal from '@/components/vendors/VendorFormModal'
import { useVendors, useDeleteVendor } from '@/hooks/useVendors'
import { useIsAdmin } from '@/store/authStore'
import { useDebounce } from '@/hooks/useDebounce'
import { formatDate } from '@/utils/date'
import type { Vendor } from '@/types'

export default function VendorsPage() {
  const isAdmin = useIsAdmin()

  const [page, setPage]     = useState(1)
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen]   = useState(false)
  const [editing, setEditing]     = useState<Vendor | null>(null)
  const [deleting, setDeleting]   = useState<Vendor | null>(null)

  const q = useDebounce(search)

  const { data, isLoading } = useVendors({ page, limit: 15, search: q || undefined })
  const deleteVendor = useDeleteVendor()

  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit   = (v: Vendor) => { setEditing(v); setFormOpen(true) }

  const handleDelete = () => {
    if (!deleting) return
    deleteVendor.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
  }

  const columns: Column<Vendor>[] = [
    {
      key:    'name',
      header: 'Vendor',
      sortValue: (v) => v.name,
      cell:   (v) => (
        <div>
          <p className="font-medium">{v.name}</p>
          {v.notes && (
            <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{v.notes}</p>
          )}
        </div>
      ),
    },
    {
      key:    'contact',
      header: 'Contact',
      sortValue: (v) => v.phone,
      cell:   (v) => (
        <div className="space-y-0.5 text-sm text-muted-foreground">
          {v.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 shrink-0" />
              <a href={`tel:${v.phone}`} className="hover:text-foreground hover:underline">{v.phone}</a>
            </div>
          )}
          {!v.phone && <span className="text-xs italic">No contact info</span>}
        </div>
      ),
      className: 'hidden sm:table-cell',
    },
    {
      key:    'address',
      header: 'Address',
      cell:   (v) =>
        v.address ? (
          <div className="flex max-w-xs items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="line-clamp-2">{v.address}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">—</span>
        ),
      className: 'hidden lg:table-cell',
    },
    {
      key:    'since',
      header: 'Added',
      sortValue: (v) => v.created_at,
      cell:   (v) => <span className="text-sm text-muted-foreground">{formatDate(v.created_at)}</span>,
      className: 'hidden md:table-cell',
    },
    {
      key:    'actions',
      header: '',
      cell:   (v) =>
        isAdmin ? (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => openEdit(v)} aria-label="Edit vendor"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => setDeleting(v)} aria-label="Delete vendor"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null,
      className: 'w-20 whitespace-nowrap',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Vendors"
        description="Manage suppliers you procure devices and accessories from."
        action={
          isAdmin && (
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Vendor
            </Button>
          )
        }
      />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search vendors…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="pl-9"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        emptyMessage="No vendors yet. Add your first supplier to get started."
      />

      <VendorFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        vendor={editing}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        isPending={deleteVendor.isPending}
        title={`Delete vendor "${deleting?.name}"?`}
        description="This will permanently remove the vendor. Existing purchase records that reference this vendor will not be affected."
        confirmLabel="Delete vendor"
      />
    </div>
  )
}
