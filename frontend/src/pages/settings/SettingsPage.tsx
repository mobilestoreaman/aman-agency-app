import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Store, Users, Key, Loader2, Plus, Shield, ShieldOff,
  ImagePlus, Trash2, Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import PageHeader from '@/components/shared/PageHeader'
import { PhoneInput } from '@/components/shared/PhoneInput'
import { useSettings, useUpdateSettings, useUploadLogo, useDeleteLogo } from '@/hooks/useSettings'
import { useUsers, useCreateUser, useUpdateUser } from '@/hooks/useUsers'
import { useAuthStore } from '@/store/authStore'
import { PHONE_RE } from '@/utils/validation'
import ChangePasswordModal from '@/components/auth/ChangePasswordModal'
import type { User } from '@/types'

// ── Logo upload sub-component ────────────────────────────────────────────────
interface LogoUploadProps {
  currentLogo?: string
}

function LogoUpload({ currentLogo }: LogoUploadProps) {
  const fileInputRef         = useRef<HTMLInputElement>(null)
  const uploadLogo           = useUploadLogo()
  const deleteLogo           = useDeleteLogo()
  const isBusy               = uploadLogo.isPending || deleteLogo.isPending

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    uploadLogo.mutate(file, {
      onSettled: () => {
        // Reset the input so the same file can be re-selected after removal
        if (fileInputRef.current) fileInputRef.current.value = ''
      },
    })
  }

  return (
    <div className="sm:col-span-2">
      <p className="mb-2 text-sm font-medium leading-none">
        Store Logo <span className="text-muted-foreground text-xs">(optional)</span>
      </p>
      <div className="flex items-center gap-4">
        {/* Preview / placeholder */}
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {currentLogo ? (
            <img
              src={currentLogo}
              alt="Store logo"
              className="h-full w-full object-contain p-1"
            />
          ) : (
            <ImagePlus className="h-6 w-6 text-muted-foreground" />
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2">
          {/* Hidden file input — triggered by the button below */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => fileInputRef.current?.click()}
            className="gap-1.5"
          >
            {uploadLogo.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <ImagePlus className="h-3.5 w-3.5" />
            }
            {currentLogo ? 'Change logo' : 'Upload logo'}
          </Button>
          {currentLogo && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isBusy}
              onClick={() => deleteLogo.mutate()}
              className="gap-1.5 text-destructive hover:text-destructive"
            >
              {deleteLogo.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Trash2 className="h-3.5 w-3.5" />
              }
              Remove
            </Button>
          )}
          <p className="text-[11px] text-muted-foreground">
            PNG, JPG, WebP, SVG · max 2 MB
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Store settings schema ─────────────────────────────────────────────────────
const storeSchema = z.object({
  store_name:          z.string().min(1, 'Store name is required'),
  store_tagline:       z.string().max(100).optional().or(z.literal('')),
  store_address:       z.string().max(300).optional().or(z.literal('')),
  store_phone:         z.string().regex(PHONE_RE).optional().or(z.literal('')),
  store_email:         z.string().email().optional().or(z.literal('')),
  currency:            z.string().min(1),
  default_tax_pct:     z.coerce.number().min(0).max(100),
  low_stock_threshold: z.coerce.number().min(0),
  credit_ceiling:      z.coerce.number().min(0),
  bill_header_text:    z.string().max(300).optional().or(z.literal('')),
  bill_footer_text:    z.string().max(300).optional().or(z.literal('')),
  receipt_footer:      z.string().max(300).optional().or(z.literal('')),
})
type StoreFormValues = z.infer<typeof storeSchema>

// ── Create user schema ────────────────────────────────────────────────────────
const createUserSchema = z.object({
  name:     z.string().min(1, 'Name required'),
  email:    z.string().email('Invalid email'),
  password: z.string().min(8, 'Min 8 chars'),
  role:     z.enum(['admin', 'staff']),
})
type CreateUserValues = z.infer<typeof createUserSchema>

// ── Create user modal ─────────────────────────────────────────────────────────
function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createUser = useCreateUser()

  const form = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: '', email: '', password: '', role: 'staff' },
  })

  const onSubmit = (values: CreateUserValues) => {
    createUser.mutate(values, {
      onSuccess: () => { form.reset(); onClose() },
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl><Input placeholder="Full name" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl><Input type="email" placeholder="user@example.com" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl><Input type="password" placeholder="Min 8 characters" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="role" render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create user
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const currentUser = useAuthStore((s) => s.user)

  const { data: settings,  isLoading: loadingSettings } = useSettings()
  const { data: usersData, isLoading: loadingUsers }    = useUsers({ limit: 50 })
  const updateSettings = useUpdateSettings()
  const updateUser     = useUpdateUser()

  const [createUserOpen,  setCreateUserOpen]  = useState(false)
  const [changePwdOpen,   setChangePwdOpen]   = useState(false)

  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      store_name: '', store_tagline: '', store_address: '', store_phone: '',
      store_email: '', currency: '₹', default_tax_pct: 0,
      low_stock_threshold: 3, credit_ceiling: 0,
      bill_header_text: '', bill_footer_text: '', receipt_footer: '',
    },
  })

  useEffect(() => {
    if (settings) form.reset(settings)
  }, [settings, form])

  const onSubmit = (values: StoreFormValues) => {
    updateSettings.mutate(values)
  }

  const users = usersData?.data ?? []

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Settings"
        description="Configure store details, tax defaults, and manage users."
      />

      {/* ── Store settings ──────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Store className="h-4 w-4" /> Store Settings
        </h2>

        {loadingSettings ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground">Store Identity</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Logo upload — outside the form so it doesn't block Save */}
                  <LogoUpload currentLogo={settings?.logo_base64} />

                  <FormField control={form.control} name="store_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Store Name</FormLabel>
                      <FormControl><Input placeholder="New Aman Agency" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="store_tagline" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tagline <span className="text-muted-foreground">(optional)</span></FormLabel>
                      <FormControl><Input placeholder="Your trusted mobile store" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="store_phone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <PhoneInput
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="store_email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input type="email" placeholder="store@example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="store_address" render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Address</FormLabel>
                      <FormControl><Textarea rows={2} placeholder="Full store address" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground">Financial Defaults</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField control={form.control} name="currency" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency Symbol</FormLabel>
                      <FormControl><Input placeholder="₹" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="default_tax_pct" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Tax %</FormLabel>
                      <FormControl><Input type="number" min={0} max={100} step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="credit_ceiling" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Credit Ceiling (₹)</FormLabel>
                      <FormControl><Input type="number" min={0} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="low_stock_threshold" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Low Stock Threshold</FormLabel>
                      <FormControl><Input type="number" min={0} {...field} /></FormControl>
                      <FormDescription className="text-xs">Alert when available units fall below this.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-medium text-muted-foreground">Bill / Receipt Text</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField control={form.control} name="bill_header_text" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bill Header</FormLabel>
                      <FormControl><Textarea rows={2} placeholder="e.g. GSTIN: 29ABC…" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="bill_footer_text" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bill Footer</FormLabel>
                      <FormControl><Textarea rows={2} placeholder="Thank you for your purchase!" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="receipt_footer" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Thermal Receipt Footer</FormLabel>
                      <FormControl><Textarea rows={2} placeholder="Visit again!" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button type="submit" disabled={updateSettings.isPending} className="gap-2">
                  {updateSettings.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Settings
                </Button>
              </div>
            </form>
          </Form>
        )}
      </section>

      <Separator />

      {/* ── User management ─────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" /> User Management
          </h2>
          <Button size="sm" onClick={() => setCreateUserOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add User
          </Button>
        </div>

        {loadingUsers ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : (
          <div className="divide-y rounded-lg border">
            {users.map((u: User) => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                  {u.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-xs capitalize">
                      {u.role}
                    </Badge>
                    {!u.is_active && (
                      <Badge variant="destructive" className="text-xs">Inactive</Badge>
                    )}
                    {u.id === currentUser?.id && (
                      <Badge variant="outline" className="text-xs">You</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Toggle active */}
                  {u.id !== currentUser?.id && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {u.is_active
                        ? <Shield className="h-3.5 w-3.5 text-emerald-500" />
                        : <ShieldOff className="h-3.5 w-3.5 text-muted-foreground" />
                      }
                      <Switch
                        checked={u.is_active}
                        onCheckedChange={(v) =>
                          updateUser.mutate({ id: u.id, is_active: v })
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {users.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">No users found.</p>
            )}
          </div>
        )}
      </section>

      <Separator />

      {/* ── Account / Security ──────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Key className="h-4 w-4" /> Account &amp; Security
        </h2>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Change Password</p>
                <p className="text-xs text-muted-foreground">Update your login password securely.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setChangePwdOpen(true)}>
                Change
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* ── About ───────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Info className="h-4 w-4" /> About
        </h2>
        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Application</span>
                <span className="font-medium">New Aman Agency</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Description</span>
                <span className="font-medium">Mobile Store Management System</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Developed by</span>
                <span className="font-semibold text-primary">CM Singh</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Stack</span>
                <span className="font-medium text-xs text-muted-foreground">
                  Go · Fiber · React · MongoDB · Docker
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Modals */}
      <CreateUserModal open={createUserOpen} onClose={() => setCreateUserOpen(false)} />
      <ChangePasswordModal open={changePwdOpen} onClose={() => setChangePwdOpen(false)} />
    </div>
  )
}
