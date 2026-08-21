import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from './components/DashboardLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { BulkChargesImportPage } from './pages/admin/BulkChargesImportPage'
import { FinanceHistoryImportPage } from './pages/admin/FinanceHistoryImportPage'
import { FlatsListPage } from './pages/admin/FlatsListPage'
import { FlatWiseDuesPage } from './pages/admin/FlatWiseDuesPage'
import { ImportsPage } from './pages/admin/ImportsPage'
import { ManageFinancePage } from './pages/admin/ManageFinancePage'
import { MarkAsPaidPage } from './pages/admin/MarkAsPaidPage'
import { OtherChargesFlatDuesPage } from './pages/admin/OtherChargesFlatDuesPage'
import { OtherChargesPage } from './pages/admin/OtherChargesPage'
import { PaymentProofsPage } from './pages/admin/PaymentProofsPage'
import { ReceiptBookPage } from './pages/admin/ReceiptBookPage'
import { ResidentLedgerPage } from './pages/admin/ResidentLedgerPage'
import { TenantsListPage } from './pages/admin/TenantsListPage'
import { BillingPlanPage } from './pages/admin/settings/BillingPlanPage'
import { FeeTypesPage } from './pages/admin/settings/FeeTypesPage'
import { FinanceCategoriesPage } from './pages/admin/settings/FinanceCategoriesPage'
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
              {/* "Resident" child under the "Imports" submenu (DashboardLayout.tsx)
                  — the Flats/Owners/Tenants roster CSV import (moved out of
                  FlatsListPage.tsx 2026-08-21). */}
              <Route
                path="/imports/residents"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><ImportsPage /></ProtectedRoute>}
              />
              {/* "Charges" child under the "Imports" submenu — Phase C of
                  docs/society-onboarding/ (Opening Balance arrears + Other Charges
                  bulk import, 2026-08-21). */}
              <Route
                path="/imports/charges"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><BulkChargesImportPage /></ProtectedRoute>}
              />
              {/* "Finance" child under the "Imports" submenu — Phase E of
                  docs/society-onboarding/ (historical Manage Finance bulk import,
                  2026-08-21) — a dedicated page under Imports rather than an inline
                  panel on ManageFinancePage.tsx, so every onboarding import lives in
                  one place. */}
              <Route
                path="/imports/finance"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><FinanceHistoryImportPage /></ProtectedRoute>}
              />
              {/* Not a sidebar item (DashboardLayout.tsx) — reached only via the
                  "N payment proofs pending review" tile on AdminDashboardPage, same
                  drill-down convention as /flats, /tenants, /flat-dues, and
                  /other-charges-dues. Moved out of the sidebar 2026-08-20 once
                  /mark-as-paid below took over as the "Mark Paid" child under the
                  Manage Finance submenu — the manual cash/bank-transfer fallback
                  ("Mark as paid") used to live here too as a modal, but a
                  manualDeposit entry has no proof file and so never actually
                  appeared in this page's proof-filtered tabs anyway. */}
              <Route
                path="/payment-proofs"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><PaymentProofsPage /></ProtectedRoute>}
              />
              {/* "Mark Paid" child under the "Manage Finance" submenu (DashboardLayout.tsx)
                  — the manual cash/bank-transfer fallback (manualDeposit), delinked
                  from /payment-proofs above. Lists only entries an admin recorded
                  directly (createdByType=ADMIN); the payer is still whichever
                  resident the payment was recorded against. */}
              <Route
                path="/mark-as-paid"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><MarkAsPaidPage /></ProtectedRoute>}
              />
              {/* "Receipt Book" child under the "Manage Finance" submenu
                  (DashboardLayout.tsx) — covers issued receipts for both Maintenance
                  and Other Charges (its backend query has no category filter). */}
              <Route
                path="/receipt-book"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><ReceiptBookPage /></ProtectedRoute>}
              />
              {/* Sidebar nav item, labeled "Resident Book" (DashboardLayout.tsx)
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
              <Route
                path="/settings/finance-categories"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><FinanceCategoriesPage /></ProtectedRoute>}
              />
              {/* "Record" child under the "Manage Finance" submenu (DashboardLayout.tsx,
                  restructured 2026-08-20 from a standalone top-level item) — the
                  primary action of recording the society's own income/expenditure
                  (SocietyLedgerEntry, docs/manage-finance/), entirely separate from
                  resident-billing LedgerEntry. */}
              <Route
                path="/manage-finance"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><ManageFinancePage /></ProtectedRoute>}
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
