import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, type AuthUser } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  // Omitted entirely = any authenticated role is allowed, just not an anonymous visitor.
  allowedRoles?: AuthUser['role'][];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  // Still attempting the silent session-restore (see AuthContext) — don't redirect
  // yet, that would bounce an already-logged-in user to /login for a split second on
  // every page load, before their session even had a chance to be restored.
  if (isLoading) {
    return <p>Loading…</p>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <p role="alert">Access denied — you don't have permission to view this page.</p>;
  }

  return <>{children}</>;
}
