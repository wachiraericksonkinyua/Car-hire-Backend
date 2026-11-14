import { lazy, Suspense, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { ProtectedContent, ProtectedRoute } from './components/ProtectedRoute'
import { AuthLayout } from './components/layouts/AuthLayout'
import { PublicLayout } from './components/layouts/PublicLayout'
import { StaffLayout } from './components/layouts/StaffLayout'
import type { UserRole } from './api/types'
import { Skeleton } from './components/ui'
import { t } from './i18n'
import { ForbiddenPage, NotFoundPage } from './pages/AccessPages'

const homePageModule = import('./features/home/HomePage')
void homePageModule.catch(() => undefined)
const HomePage = lazy(() => homePageModule.then((module) => ({ default: module.HomePage })))
const VehiclesPage = lazy(() => import('./pages/public').then((module) => ({ default: module.VehiclesPage })))
const VehicleDetailsPage = lazy(() => import('./pages/public').then((module) => ({ default: module.VehicleDetailsPage })))
const AboutPage = lazy(() => import('./pages/public').then((module) => ({ default: module.AboutPage })))
const ContactPage = lazy(() => import('./pages/public').then((module) => ({ default: module.ContactPage })))
const CheckoutPage = lazy(() => import('./pages/public').then((module) => ({ default: module.CheckoutPage })))
const BookingPage = lazy(() => import('./pages/public').then((module) => ({ default: module.BookingPage })))
const LoginPage = lazy(() => import('./features/auth/LoginPage').then((module) => ({ default: module.LoginPage })))
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const FleetPage = lazy(() => import('./pages/admin').then((module) => ({ default: module.FleetPage })))
const BookingsPage = lazy(() => import('./features/bookings/BookingsListPage').then((module) => ({ default: module.BookingsListPage })))
const BookingWizardPage = lazy(() => import('./features/bookings/BookingWizard').then((module) => ({ default: module.BookingWizard })))
const BookingDetailPage = lazy(() => import('./features/bookings/BookingDetailPage').then((module) => ({ default: module.BookingDetailPage })))
const HandoverPage = lazy(() => import('./features/bookings/HandoverPage').then((module) => ({ default: module.HandoverPage })))
const TimelinePage = lazy(() => import('./features/timeline/TimelinePage').then((module) => ({ default: module.TimelinePage })))
const DriversPage = lazy(() => import('./features/drivers/DriversPage').then((module) => ({ default: module.DriversPage })))
const MyTripsPage = lazy(() => import('./features/drivers/MyTripsPage').then((module) => ({ default: module.MyTripsPage })))
const MechanicsPage = lazy(() => import('./features/incidents/MechanicsPage').then((module) => ({ default: module.MechanicsPage })))
const IncidentsPage = lazy(() => import('./features/incidents/IncidentsPage').then((module) => ({ default: module.IncidentsPage })))
const ApprovalsPage = lazy(() => import('./pages/admin').then((module) => ({ default: module.ApprovalsPage })))
const StaffPage = lazy(() => import('./pages/admin').then((module) => ({ default: module.StaffPage })))
const AuditPage = lazy(() => import('./pages/admin').then((module) => ({ default: module.AuditPage })))
const ProfilePage = lazy(() => import('./pages/admin').then((module) => ({ default: module.ProfilePage })))
const StyleguidePage = lazy(() => import('./pages/StyleguidePage').then((module) => ({ default: module.StyleguidePage })))

const officeRoles: UserRole[] = ['owner', 'manager', 'agent']
const allRoles: UserRole[] = ['owner', 'manager', 'agent', 'driver', 'mechanic']
const vehicleReadRoles: UserRole[] = ['owner', 'manager', 'agent', 'mechanic']
const handoverRoles: UserRole[] = ['owner', 'manager', 'agent', 'driver']
const mechanicsRoles: UserRole[] = ['owner', 'manager', 'agent', 'driver']
const incidentRoles: UserRole[] = ['owner', 'manager', 'agent', 'mechanic']

function PendingPage() {
  return <div aria-label={t('styleguide.loading')} className="route-pending" role="status"><Skeleton rows={3} /></div>
}

function LoadPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PendingPage />}>{children}</Suspense>
}

const page = (Page: LazyExoticComponent<ComponentType>) => <LoadPage><Page /></LoadPage>
const protectedPage = (roles: UserRole[], Page: LazyExoticComponent<ComponentType>) => (
  <ProtectedContent roles={roles}>{page(Page)}</ProtectedContent>
)

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: page(HomePage) },
      { path: '/vehicles', element: page(VehiclesPage) },
      { path: '/vehicles/:id', element: page(VehicleDetailsPage) },
      { path: '/about', element: page(AboutPage) },
      { path: '/contact', element: page(ContactPage) },
      { path: '/checkout', element: page(CheckoutPage) },
      { path: '/booking/:ref', element: page(BookingPage) },
    ],
  },
  { path: '/styleguide', element: page(StyleguidePage) },
  { path: '/login', element: <AuthLayout />, children: [{ index: true, element: page(LoginPage) }] },
  { path: '/admin/login', element: <Navigate replace to="/login" /> },
  { path: '/403', element: <ForbiddenPage /> },
  { path: '/404', element: <NotFoundPage /> },
  {
    path: '/admin/my-trips',
    element: <ProtectedRoute roles={['driver']} />,
    children: [{ index: true, element: page(MyTripsPage) }],
  },
  {
    path: '/admin',
    element: <ProtectedRoute roles={allRoles} />,
    children: [{
      element: <StaffLayout />,
      children: [
        { index: true, element: protectedPage(officeRoles, DashboardPage) },
        { path: 'timeline', element: protectedPage(officeRoles, TimelinePage) },
        { path: 'vehicles', element: protectedPage(vehicleReadRoles, FleetPage) },
        { path: 'vehicles/:id', element: protectedPage(vehicleReadRoles, FleetPage) },
        { path: 'vehicles/new', element: protectedPage(['owner', 'manager'], FleetPage) },
        { path: 'vehicles/:id/edit', element: protectedPage(['owner', 'manager'], FleetPage) },
        { path: 'fleet', element: protectedPage(vehicleReadRoles, FleetPage) },
        { path: 'bookings', element: protectedPage(officeRoles, BookingsPage) },
        { path: 'bookings/new', element: protectedPage(officeRoles, BookingWizardPage) },
        { path: 'bookings/:id', element: protectedPage(['owner', 'manager', 'agent', 'driver'], BookingDetailPage) },
        { path: 'bookings/:id/check-out', element: protectedPage(handoverRoles, HandoverPage) },
        { path: 'bookings/:id/check-in', element: protectedPage(handoverRoles, HandoverPage) },
        { path: 'approvals', element: protectedPage(officeRoles, ApprovalsPage) },
        { path: 'handover', element: protectedPage(handoverRoles, HandoverPage) },
        { path: 'drivers', element: protectedPage(officeRoles, DriversPage) },
        { path: 'mechanics', element: protectedPage(mechanicsRoles, MechanicsPage) },
        { path: 'incidents', element: protectedPage(incidentRoles, IncidentsPage) },
        { path: 'staff', element: protectedPage(['owner', 'manager'], StaffPage) },
        { path: 'audit', element: protectedPage(['owner'], AuditPage) },
        { path: 'profile', element: protectedPage(allRoles, ProfilePage) },
      ],
    }],
  },
  { path: '*', element: <NotFoundPage /> },
])