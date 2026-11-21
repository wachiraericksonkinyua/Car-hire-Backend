import type { PropsWithChildren } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { UserRole } from '../api/types'
import { useAuth } from '../hooks/AuthContext'
import { t } from '../i18n'
import { Skeleton } from './ui'

export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <main aria-label={t('styleguide.loading')} className="auth-loading"><Skeleton rows={3} /></main>
  if (!user) return <Navigate replace state={{ from: location }} to="/login" />
  if (roles && !roles.includes(user.role)) return <Navigate replace state={{ from: location }} to="/403" />
  return <Outlet />
}

export function ProtectedContent({ roles, children }: PropsWithChildren<{ roles: UserRole[] }>) {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <main aria-label={t('styleguide.loading')} className="auth-loading"><Skeleton rows={3} /></main>
  if (!user) return <Navigate replace state={{ from: location }} to="/login" />
  if (!roles.includes(user.role)) return <Navigate replace state={{ from: location }} to="/403" />
  return children
}