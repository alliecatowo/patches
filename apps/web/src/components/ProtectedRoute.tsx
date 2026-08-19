import type { JSX, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useSession } from '../hooks/useSession.js';

export function ProtectedRoute({ children }: { children: ReactNode }): JSX.Element {
  const session = useSession();
  const location = useLocation();
  if (session === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
