import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, Search, Phone, MapPin,
  CreditCard, ShoppingBag, ChevronRight, TrendingDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ResponsiveTable, type Column } from '@/components/shared/ResponsiveTable'
import PageHeader from '@/components/shared/PageHeader'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import CustomerFormModal from '@/components/customers/CustomerFormModal'
import CreditEntryModal from '@/components/creditLedger/CreditEntryModal'
import { useCustomers, useDeleteCustomer } from '@/hooks/useCustomers'
import { useIsAdmin } from '@/store/authStore'
import { useDebounce } from '@/hooks/useDebounce'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/date'
import type { Customer } from '@/types'

/** Colour-code outstanding credit balance */
function CreditBadge({ balance }: { balance: number }) {
  if (balance === 0) return <span className="text-sm text-muted-foreground">—</span>
  if (balance > 0)
    return (
      <Badge variant="destructive" className="gap-1 font-mono">
        <CreditCard className="h-3 w-3" />
        {formatCurrency(balance)}
      </Badge>
    )
  // negative = customer has advance / overpaid
  return (
    <Badge variant="secondary" className="gap-1 font-mono text-emerald-600">
      <CreditCard className="h-3 w-3" />
      +{formatCurrency(Math.abs(balance))}
    </Badge>
  )
}

export default function CustomersPage() {
  const isAdmin = useIsAdmin()

  const [page, setPage]                   = useState(1)
  const [search, setSearch]               = useState('')
  const [creditFilter, setCreditFilter]   = useState<string>('')
  const [formOpen, setFormOpen]           = useState(false)
  const [editing, setEditing]             = useState<Customer | null>(null)
  const [deleting, setDeleting]           = useState<Customer | null>(null)
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null)

  const q = useDebounce(search)

  const { data, isLoading } = useCustomers({
    page,
    limit:  15,
    search: q || undefined,
    credit: creditFilter || undefined,
  })
  const deleteCustomer = useDeleteCustomer()

  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit   = (c: Customer) => { setEditing(c); setFormOpen(true) }

  const handleDelete = () => {
    if (!deleting) return
    deleteCustomer.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
  }

  const columns: Column<Customer>[] = [
    {
      key:    'name',
      header: 'Customer',
      sortValue: (c) => c.name,
      cell:   (c) => (
        <div>
          <p className="font-medium">{c.name}</p>
          {c.notes && (
            <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{c.notes}</p>
          )}
        </div>
      ),
    },
    {
      key:    'contact',
      header: 'Contact',
      cell:   (c) => (
        <div className="space-y-0.5 text-sm text-muted-foreground">
          {c.phone && (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 shrink-0" />
              <a href={`tel:${c.phone}`} className="hover:text-foreground hover:underline">{c.phone}</a>
            </div>
          )}
          {!c.phone && <span className="text-xs italic">No contact info</span>}
        </div>
      ),
      className: 'hidden sm:table-cell',
    },
    {
      key:    'address',
      header: 'Address',
      cell:   (c) =>
        c.address ? (
          <div className="flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="min-w-0 line-clamp-2">{c.address}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">—</span>
        ),
      className: 'hidden lg:table-cell',
    },
    {
      key:    'credit',
      header: 'Outstanding',
      sortValue: (c) => c.credit_balance,
      cell:   (c) => <CreditBadge balance={c.credit_balance} />,
    },
    {
      key:    'since',
      header: 'Since',
      sortValue: (c) => c.created_at,
      cell:   (c) => <span className="text-sm text-muted-foreground">{formatDate(c.created_at)}</span>,
      className: 'hidden md:table-cell',
    },
    {
      key:    'actions',
      header: '',
      cell:   (c) => (
        <div className="flex items-center justify-end gap-1">
          {/* Record payment — shown whenever customer has an outstanding balance */}
          {c.credit_balance > 0 && (
            <Button
              variant="ghost" size="sm"
              className="h-8 gap-1 px-2 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
              onClick={() => setPaymentCustomer(c)}
              title={`Record payment — ${formatCurrency(c.credit_balance)} outstanding`}
            >
              <TrendingDown className="h-3 w-3" />
              <span className="hidden sm:inline">Pay</span>
            </Button>
          )}

          {/* View sales history */}
          <Button
            variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs"
            asChild
          >
            <Link to={`/sales?customer_id=${c.id}`}>
              <ShoppingBag className="h-3 w-3" />
              <span className="hidden sm:inline">Sales</span>
              <ChevronRight className="h-3 w-3" />
            </Link>
          </Button>

          {isAdmin && (
            <>
              <Button
                variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => openEdit(c)} aria-label="Edit customer"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setDeleting(c)} aria-label="Delete customer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      ),
      className: 'w-auto whitespace-nowrap',
    },
  ]

  // Aggregate outstanding credit across current page for a quick callout
  const pageCredit = (data?.data ?? []).reduce((s, c) => s + c.credit_balance, 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Customers"
        description="Manage customer profiles and track outstanding credit balances."
        action={
          isAdmin && (
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Customer
            </Button>
          )
        }
      />

      {/* Outstanding credit callout */}
      {!isLoading && pageCredit > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm">
          <CreditCard className="h-4 w-4 text-destructive" />
          <span className="text-muted-foreground">Total outstanding on this page:</span>
          <span className="font-semibold text-destructive">{formatCurrency(pageCredit)}</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>

        <Select
          value={creditFilter || 'all'}
          onValueChange={(v) => { setCreditFilter(v === 'all' ? '' : v); setPage(1) }}
        >
          <SelectTrigger className="w-full sm:w-[190px]">
            <SelectValue placeholder="Credit status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            <SelectItem value="with_balance">With outstanding balance</SelectItem>
            <SelectItem value="no_balance">No outstanding balance</SelectItem>
          </SelectContent>
        </Select>

        {(search || creditFilter) && (
          <Button
            variant="ghost" size="sm"
            className="text-muted-foreground"
            onClick={() => { setSearch(''); setCreditFilter(''); setPage(1) }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <ResponsiveTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        meta={data?.meta}
        onPageChange={setPage}
        emptyMessage="No customers yet. Add your first customer to get started."
        mobileCard={{
          top:     ['name', 'credit'],
          middle:  [],
          bottom:  ['contact', 'since'],
          actions: 'actions',
        }}
      />

      <CustomerFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        customer={editing}
      />

      {/* Record payment modal — triggered from the Pay button in the table */}
      <CreditEntryModal
        open={!!paymentCustomer}
        onClose={() => setPaymentCustomer(null)}
        customerId={paymentCustomer?.id}
        defaultType="payment"
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        isPending={deleteCustomer.isPending}
        title={`Delete customer "${deleting?.name}"?`}
        description="This will permanently remove the customer profile. Their sales and credit history will not be affected."
        confirmLabel="Delete customer"
      />
    </div>
  )
}
