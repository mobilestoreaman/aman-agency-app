import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Smartphone, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { useLogin } from '@/hooks/useAuth'

// ── Validation schema ─────────────────────────────────────────
const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters'),
})

type LoginFormValues = z.infer<typeof loginSchema>

// ── Component ─────────────────────────────────────────────────
export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const login = useLogin()

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onBlur',
  })

  const onSubmit = (values: LoginFormValues) => {
    login.mutate(values)
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-[hsl(234,45%,8%)] via-[hsl(240,40%,12%)] to-[hsl(234,45%,8%)]">
      {/* Top safe-area spacer for iOS PWA */}
      <div className="safe-top" />

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        {/* ── Logo / Brand ────────────────────────────────── */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/30">
            <Smartphone className="h-8 w-8 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              New Aman Agency
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Mobile Store Management
            </p>
          </div>
        </div>

        {/* ── Card ────────────────────────────────────────── */}
        <div className="w-full max-w-sm rounded-2xl border border-slate-700/60 bg-slate-800/60 p-8 shadow-2xl backdrop-blur">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white">Sign in</h2>
            <p className="mt-1 text-sm text-slate-400">
              Enter your credentials to access your account
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              {/* Email */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Email address</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        inputMode="email"
                        placeholder="you@example.com"
                        disabled={login.isPending}
                        className="border-slate-600 bg-slate-700/50 text-white placeholder:text-slate-500 focus-visible:ring-primary"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Password */}
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          placeholder="••••••••"
                          disabled={login.isPending}
                          className="border-slate-600 bg-slate-700/50 pr-10 text-white placeholder:text-slate-500 focus-visible:ring-primary"
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-200"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Submit */}
              <Button
                type="submit"
                className="mt-2 w-full"
                disabled={login.isPending}
              >
                {login.isPending ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>
          </Form>
        </div>

        {/* ── Footer ──────────────────────────────────────── */}
        <div className="mt-8 flex flex-col items-center gap-1">
          <p className="text-center text-xs text-slate-600">
            New Aman Agency &copy; {new Date().getFullYear()}
          </p>
          <p className="text-center text-[11px] text-slate-700">
            Developed by CM Singh
          </p>
        </div>
      </div>

      {/* Bottom safe-area spacer for iOS PWA */}
      <div className="safe-bottom" />
    </div>
  )
}
