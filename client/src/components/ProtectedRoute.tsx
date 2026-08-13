import { Navigate } from 'react-router-dom';
import { getToken, getUser, type UserRole } from '../lib/auth';

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

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
