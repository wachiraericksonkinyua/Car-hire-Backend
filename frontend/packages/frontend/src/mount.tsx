import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './hooks/AuthContext'
import { createAdminRouter, createWebRouter } from './router'
import './App.css'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

/**
 * Boots the shared React application.
 *
 * `__APP_TARGET__` is injected by each hosting app's Vite config, so the same
 * codebase renders the customer website or the staff workspace.
 */
export async function mountApp() {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS !== 'false') {
    const { worker } = await import('./mocks/browser')
    await worker.start()
  }

  const router =
    __APP_TARGET__ === 'admin' ? createAdminRouter() : createWebRouter()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
}
