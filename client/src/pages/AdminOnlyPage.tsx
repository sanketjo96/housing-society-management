// Minimal example of a role-restricted route (Task 2.8) — a concrete vehicle for
// testing/demonstrating ProtectedRoute's allowedRoles behavior, ahead of Phase 3's
// real admin pages (flat management, etc.) landing on top of the same pattern.
export function AdminOnlyPage() {
  return (
    <main>
      <h1>Admin area</h1>
      <p>Only admins can see this page.</p>
    </main>
  );
}
