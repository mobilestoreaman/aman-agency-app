import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Phone, MapPin, CreditCard, Pencil,
  ShoppingBag, TrendingDown, TrendingUp, User, Plus,
  CheckCircle2, MinusCircle, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ResponsiveTable, type Column } from '@/components/shared/ResponsiveTable'
import PageHeader from '@/components/shared/PageHeader'
import CustomerFormModal from '@/components/customers/CustomerFormModal'
import CreditEntryModal from '@/components/creditLedger/CreditEntryModal'
import { useCustomer } from '@/hooks/useCustomers'
import { useSales } from '@/hooks/useSales'
import { useCreditLedger } from '@/hooks/useCreditLedger'
import { useIsAdmin } from '@/store/authStore'
import { formatCurrency } from '@/utils/currency'
import { formatDate, formatDateTime } from '@/utils/date'
import type { CreditLedgerEntry, Sale } from '@/types'
import { SALE_STATUS_LABELS } from '@/hooks/useSales'

function InfoRow({ icon: Icon, label, value }: {
  icon: React.ElementType; label: string; value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  )
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isAdmin  = useIsAdmin()

  const [editOpen, setEditOpen]       = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [salesPage, setSalesPage]     = useState(1)
  const [ledgerPage, setLedgerPage]   = useState(1)

  const { data: customer, isLoading: loadingCustomer } = useCustomer(id ?? '')
  const { data: salesData,  isLoading: loadingSales,  isFetching: fetchingSales }  = useSales({
    page: salesPage, limit: 10, customer_id: id,
  })
  const { data: ledgerData, isLoading: loadingLedger, isFetching: fetchingLedger } = useCreditLedger({
    page: ledgerPage, limit: 10, customer_id: id,
  })

  const salesColumns: Column<Sale>[] = [
    {
      key:    'invoice',
      header: 'Invoice',
      cell:   (s) => (
        <Link
          to={`/sales/${s.id}`}
          className="font-mono text-sm font-medium underline-offset-4 hover:underline"
        >
          #{s.invoice_number}
        </Link>
      ),
    },
    {
      key:    'amount',
      header: 'Amount',
      cell:   (s) => (
        <div className="text-sm">
          <span className="font-semibold">{formatCurrency(s.total_amount)}</span>
          {s.balance > 0 && (
            <span className="ml-1.5 text-xs text-amber-600">bal: {formatCurrency(s.balance)}</span>
          )}
        </div>
      ),
      sortValue: (s) => s.total_amount,
      shrink: true,
    },
    {
      key:    'status',
      header: 'Status',
      cell:   (s) => (
        <Badge variant={s.status === 'completed' ? 'success' : 'destructive'} className="text-xs">
          {SALE_STATUS_LABELS[s.status]}
        </Badge>
      ),
      sortValue: (s) => s.status,
      shrink: true,
    },
    {
      key:    'date',
      header: 'Date',
      cell:   (s) => <span className="text-sm text-muted-foreground">{formatDate(s.sold_at)}</span>,
      sortValue: (s) => s.sold_at,
      shrink: true,
    },
    {
      key:    'actions',
      header: '',
      cell:   (s) => (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
          <Link to={`/sales/${s.id}`}>
            <ChevronRight className="h-3 w-3" />
          </Link>
        </Button>
      ),
      className: 'whitespace-nowrap',
      shrink: true,
    },
  ]

  const ledgerColumns: Column<CreditLedgerEntry>[] = [
    {
      key:    'type',
      header: 'Type',
      cell:   (e) => (
        <div className="flex items-center gap-2 text-sm">
          {e.amount < 0
            ? <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
            : e.type === 'sale'
            ? <CreditCard className="h-4 w-4 text-amber-500" />
            : <MinusCircle className="h-4 w-4 text-blue-500" />
          }
          <span className="capitalize">{e.type}</span>
        </div>
      ),
      sortValue: (e) => e.type,
      shrink: true,
    },
    {
      key:    'amount',
      header: 'Amount',
      cell:   (e) => (
        <span className={`font-mono font-semibold text-sm ${
          e.amount < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
        }`}>
          {e.amount < 0 ? '−' : '+'} {formatCurrency(Math.abs(e.amount))}
        </span>
      ),
      sortValue: (e) => e.amount,
      shrink: true,
    },
    {
      key:    'balance',
      header: 'Balance after',
      cell:   (e) => (
        <span className={`font-mono text-sm ${e.balance_after > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {formatCurrency(Math.abs(e.balance_after))}
          {e.balance_after < 0 && <span className="ml-1 text-xs opacity-70">(credit)</span>}
        </span>
      ),
      sortValue: (e) => e.balance_after,
      shrink: true,
    },
    {
      key:    'notes',
      header: 'Notes',
      cell:   (e) => (
        <span className="text-xs text-muted-foreground">{e.notes ?? '—'}</span>
      ),
      className: 'hidden md:table-cell',
    },
    {
      key:    'date',
      header: 'Date',
      cell:   (e) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDateTime(e.created_at)}
        </span>
      ),
      sortValue: (e) => e.created_at,
      shrink: true,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost" size="icon" className="h-8 w-8"
          onClick={() => navigate('/customers')}
          aria-label="Back to customers"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title={loadingCustomer ? 'Loading…' : (customer?.name ?? 'Customer')}
          description="Customer profile, sales history, and credit ledger."
          action={
            isAdmin && customer ? (
              <Button
                variant="outline" size="sm"
                onClick={() => setEditOpen(true)}
                className="gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            ) : undefined
          }
        />
      </div>

      {/* Profile cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Contact info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <User className="h-4 w-4" /> Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {loadingCustomer ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)
            ) : customer ? (
              <>
                <InfoRow icon={Phone}  label="Phone"    value={<a href={`tel:${customer.phone}`} className="hover:underline">{customer.phone}</a>} />
                {customer.address && (
                  <InfoRow icon={MapPin} label="Address"  value={customer.address} />
                )}
                <InfoRow icon={User}  label="Since"    value={formatDate(customer.created_at)} />
                {customer.notes && (
                  <p className="mt-2 rounded-md border bg-muted/40 px-3 py-2 text-xs italic text-muted-foreground">
                    {customer.notes}
                  </p>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Credit summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <CreditCard className="h-4 w-4" /> Credit
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingCustomer ? (
              <Skeleton className="h-10 w-full" />
            ) : customer ? (
              <>
                <div className="flex items-end justify-between">
                  <span className="text-xs text-muted-foreground">Outstanding</span>
                  <span className={`text-2xl font-bold font-mono ${
                    customer.credit_balance > 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {formatCurrency(customer.credit_balance)}
                  </span>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-xs text-muted-foreground">Credit ceiling</span>
                  <span className="font-mono text-sm">{formatCurrency(customer.credit_ceiling)}</span>
                </div>
                {customer.credit_balance > 0 ? (
                  <Button
                    size="sm"
                    className="w-full gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                    onClick={() => setPaymentOpen(true)}
                  >
                    <TrendingDown className="h-3.5 w-3.5" />
                    Record Payment
                  </Button>
                ) : (
                  <Badge variant="success" className="text-xs">
                    No outstanding balance
                  </Badge>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Sales summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingBag className="h-4 w-4" /> Sales
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingSales ? (
              <Skeleton className="h-10 w-full" />
            ) : salesData ? (
              <>
                <div className="flex items-end justify-between">
                  <span className="text-xs text-muted-foreground">Total sales</span>
                  <span className="text-2xl font-bold">{salesData.meta?.total ?? 0}</span>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-xs text-muted-foreground">Revenue (this page)</span>
                  <span className="font-mono font-semibold text-sm text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(
                      (salesData.data ?? [])
                        .filter((s) => s.status === 'completed')
                        .reduce((sum, s) => sum + s.total_amount, 0)
                    )}
                  </span>
                </div>
                <Button variant="outline" size="sm" className="w-full gap-1.5 mt-1" asChild>
                  <Link to={`/sales?customer_id=${id}`}>
                    <ShoppingBag className="h-3.5 w-3.5" />
                    View all sales
                  </Link>
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Recent sales */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent Sales</h2>
          <Button variant="ghost" size="sm" className="gap-1 text-xs" asChild>
            <Link to={`/sales?customer_id=${id}`}>
              View all <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        <ResponsiveTable
          columns={salesColumns}
          data={salesData?.data ?? []}
          isLoading={loadingSales || fetchingSales}
          meta={salesData?.meta}
          onPageChange={setSalesPage}
          emptyMessage="No sales recorded for this customer."
          skeletonRows={4}
          mobileCard={{
            top:     ['invoice', 'status'],
            middle:  ['amount'],
            bottom:  ['date'],
            actions: 'actions',
          }}
        />
      </div>

      <Separator />

      {/* Credit ledger */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Credit Ledger</h2>
          {isAdmin && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
              <Link to={`/credit-ledger?customer_id=${id}`}>
                <Plus className="h-3.5 w-3.5" /> Add entry
              </Link>
            </Button>
          )}
        </div>
        <ResponsiveTable
          columns={ledgerColumns}
          data={ledgerData?.data ?? []}
          isLoading={loadingLedger || fetchingLedger}
          meta={ledgerData?.meta}
          onPageChange={setLedgerPage}
          emptyMessage="No credit entries for this customer."
          skeletonRows={4}
          mobileCard={{
            top:     ['type', 'amount'],
            middle:  ['balance'],
            bottom:  ['date', 'notes'],
          }}
        />
      </div>

      {/* Edit modal */}
      <CustomerFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        customer={customer ?? null}
      />

      {/* Record payment modal */}
      <CreditEntryModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        customerId={id}
        defaultType="payment"
      />
    </div>
  )
}
