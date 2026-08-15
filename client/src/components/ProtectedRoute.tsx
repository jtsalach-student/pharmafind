import { Navigate } from 'react-router-dom';
import { getRoleDashboard, getToken, getUser, normalizeRoleInput, type UserRole } from '../lib/auth';

type ProtectedRouteProps = {
  children: React.ReactNode;
};

type RoleProtectedRouteProps = ProtectedRouteProps & {
  allowedRoles: UserRole[];
};

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const token = getToken();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function RoleProtectedRoute({ children, allowedRoles }: RoleProtectedRouteProps) {
  const token = getToken();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const user = getUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const normalizedRole = normalizeRoleInput(user.role) ?? 'USER';

  if (!allowedRoles.includes(normalizedRole)) {
    return <Navigate to={getRoleDashboard(normalizedRole)} replace />;
  }

  return <>{children}</>;
}
