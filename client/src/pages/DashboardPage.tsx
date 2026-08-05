import { useAuth } from '../context/AuthContext';

// Placeholder — proves the login → redirect flow (Task 2.7) and the auth
// context/protected-route mechanism (Task 2.8) both work end to end. The real
// dashboard is Phase 8; this page is intentionally minimal.
export function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <main>
      <h1>Dashboard</h1>
      <p>You are logged in{user ? ` as ${user.name} (${user.role})` : ''}.</p>
      <button type="button" onClick={() => void logout()}>
        Log out
      </button>
    </main>
  );
}
