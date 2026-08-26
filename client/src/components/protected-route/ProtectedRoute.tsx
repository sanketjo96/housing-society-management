import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, type AuthUser } from '../../context/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  // Omitted = any authenticated role allowed, just not anonymous.
  allowedRoles?: AuthUser['role'][];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  // Session restore still in flight — don't redirect yet or an already-logged-in
  // user briefly bounces to /login on every page load.
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
