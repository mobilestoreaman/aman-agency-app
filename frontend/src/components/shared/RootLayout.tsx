import { useThemeInit } from '@/store/themeStore'

interface Props {
  children: React.ReactNode
}

// Thin wrapper that initialises the persisted theme before anything renders.
// Placed above QueryClientProvider and RouterProvider in main.tsx so the
// correct dark/light class is on <html> before the first paint.
export default function RootLayout({ children }: Props) {
  useThemeInit()
  return <>{children}</>
}
