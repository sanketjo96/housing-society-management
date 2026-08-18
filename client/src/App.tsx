import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from './components/DashboardLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { FlatsListPage } from './pages/admin/FlatsListPage'
import { FlatWiseDuesPage } from './pages/admin/FlatWiseDuesPage'
import { PaymentProofsPage } from './pages/admin/PaymentProofsPage'
import { ReceiptBookPage } from './pages/admin/ReceiptBookPage'
import { TenantsListPage } from './pages/admin/TenantsListPage'
import { BillingPlanPage } from './pages/admin/settings/BillingPlanPage'
import { SocietyDetailsPage } from './pages/admin/settings/SocietyDetailsPage'
import { DashboardPage } from './pages/DashboardPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { LoginPage } from './pages/LoginPage'
import { MaintenanceBookPage } from './pages/MaintenanceBookPage'
import { MyDetailsPage } from './pages/MyDetailsPage'
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
              <Route
                path="/payment-proofs"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><PaymentProofsPage /></ProtectedRoute>}
              />
              <Route
                path="/receipt-book"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><ReceiptBookPage /></ProtectedRoute>}
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
                path="/maintenance-book"
                element={<ProtectedRoute allowedRoles={['OWNER', 'TENANT']}><MaintenanceBookPage /></ProtectedRoute>}
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
