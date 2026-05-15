import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { router } from '@/router'
import { registerServiceWorker } from '@/pwa/register'
import RootLayout from '@/components/shared/RootLayout'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30s before refetch
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
})

// Register PWA service worker (no-op in dev when devOptions.enabled = false)
registerServiceWorker()

// After a new deployment, Vite generates new content-hashed chunk filenames.
// Old browser tabs still reference the previous chunk URLs — when those are
// lazily imported they get served index.html (SPA rewrite) instead of JS,
// causing "'text/html' is not a valid JavaScript MIME type".
// Catch this event and force a full reload to pick up the new bundle.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  window.location.reload()
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RootLayout>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary>
            <RouterProvider router={router} />
          </ErrorBoundary>
          <Toaster
            position="top-center"
            richColors
            closeButton
            duration={4000}
          />
        </QueryClientProvider>
      </RootLayout>
    </ErrorBoundary>
  </React.StrictMode>,
)
