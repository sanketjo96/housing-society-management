import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from './components/DashboardLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { CreditBookPage } from './pages/CreditBookPage'
import { FlatsListPage } from './pages/admin/FlatsListPage'
import { FlatWiseDuesPage } from './pages/admin/FlatWiseDuesPage'
import { OtherChargesFlatDuesPage } from './pages/admin/OtherChargesFlatDuesPage'
import { OtherChargesPage } from './pages/admin/OtherChargesPage'
import { PaymentProofsPage } from './pages/admin/PaymentProofsPage'
import { ReceiptBookPage } from './pages/admin/ReceiptBookPage'
import { ResidentLedgerPage } from './pages/admin/ResidentLedgerPage'
import { TenantsListPage } from './pages/admin/TenantsListPage'
import { BillingPlanPage } from './pages/admin/settings/BillingPlanPage'
import { FeeTypesPage } from './pages/admin/settings/FeeTypesPage'
import { SocietyDetailsPage } from './pages/admin/settings/SocietyDetailsPage'
import { DashboardPage } from './pages/DashboardPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { LoginPage } from './pages/LoginPage'
import { MaintenanceBookPage } from './pages/MaintenanceBookPage'
import { MyDetailsPage } from './pages/MyDetailsPage'
import { OtherChargesBookPage } from './pages/OtherChargesBookPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'

// staleTime > 0 so switching pages (which mount/unmount their content) doesn't
// re-fetch on every switch — data from the last 30s is treated as fresh. Any mutation
// still invalidates its own query explicitly, so this doesn't mask real updates.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* One shared authenticated shell (nav + top bar) for every page below —
                each page is its own top-level, deep-linkable/shareable URL. Dashboard
                is just the default landing page ("/dashboard"), not a container every
                other page lives under. */}
            <Route
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />

              <Route path="/flats" element={<ProtectedRoute allowedRoles={['ADMIN']}><FlatsListPage /></ProtectedRoute>} />
              {/* Sidebar nav item (DashboardLayout.tsx) — also still reachable via the
                  "N payment proofs pending review" tile on AdminDashboardPage, same
                  page either way. Menu access exists specifically so "Mark as paid"
                  (this page's manual cash/bank-transfer fallback) doesn't require
                  going through the dashboard tile first. */}
              <Route
                path="/payment-proofs"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><PaymentProofsPage /></ProtectedRoute>}
              />
              <Route
                path="/receipt-book"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><ReceiptBookPage /></ProtectedRoute>}
              />
              {/* Sidebar nav item, labeled "Resident Charges" (DashboardLayout.tsx)
                  — a comprehensive per-flat overview (both pools in one row), unlike
                  /flat-dues and /other-charges-dues, which are dashboard-card
                  drill-downs filtered to only what's still owed. */}
              <Route
                path="/resident-ledger"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><ResidentLedgerPage /></ProtectedRoute>}
              />
              {/* Not a sidebar nav item — reached only via the "Maintenance Outstanding
                  Total" tile on AdminDashboardPage, same admin-only guard as every
                  other admin route here. */}
              <Route
                path="/flat-dues"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><FlatWiseDuesPage /></ProtectedRoute>}
              />
              {/* Not a sidebar nav item — reached only via the "Total Tenants" tile on
                  AdminDashboardPage, same admin-only guard as every other admin route
                  here. */}
              <Route
                path="/tenants"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><TenantsListPage /></ProtectedRoute>}
              />
              <Route
                path="/settings/society"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><SocietyDetailsPage /></ProtectedRoute>}
              />
              <Route
                path="/settings/billing"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><BillingPlanPage /></ProtectedRoute>}
              />
              <Route
                path="/settings/fee-types"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><FeeTypesPage /></ProtectedRoute>}
              />
              {/* Sidebar nav item, labeled "Custom Bills" (DashboardLayout.tsx) — the
                  primary action of billing a new ad-hoc charge, distinct from the
                  read-only /other-charges-dues drill-down below. */}
              <Route
                path="/other-charges"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><OtherChargesPage /></ProtectedRoute>}
              />
              {/* Not a sidebar nav item — reached only via the "Other Charges
                  Outstanding Total" tile on AdminDashboardPage, same drill-down
                  convention as /flat-dues above (docs/other-charges/). Deliberately
                  NOT linked from /other-charges — that page is the billing action,
                  this one is the read-only per-flat dues table. */}
              <Route
                path="/other-charges-dues"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><OtherChargesFlatDuesPage /></ProtectedRoute>}
              />

              <Route
                path="/maintenance-book"
                element={<ProtectedRoute allowedRoles={['OWNER', 'TENANT']}><MaintenanceBookPage /></ProtectedRoute>}
              />
              {/* Not a sidebar nav item — reached only via the resident Dashboard's
                  "Other Outstanding" card, same drill-down convention as admin's
                  /flat-dues (docs/other-charges/). */}
              <Route
                path="/other-charges-book"
                element={<ProtectedRoute allowedRoles={['OWNER', 'TENANT']}><OtherChargesBookPage /></ProtectedRoute>}
              />
              {/* Not a sidebar nav item — reached only via the resident Dashboard's
                  "Available Maintenance Credit" card, same drill-down convention as
                  /other-charges-book above (resident-dashboard restructure). */}
              <Route
                path="/credit-book"
                element={<ProtectedRoute allowedRoles={['OWNER', 'TENANT']}><CreditBookPage /></ProtectedRoute>}
              />
              <Route
                path="/my-details"
                element={<ProtectedRoute allowedRoles={['OWNER', 'TENANT']}><MyDetailsPage /></ProtectedRoute>}
              />

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
