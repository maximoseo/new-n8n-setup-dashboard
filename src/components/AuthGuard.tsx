import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../contexts/AuthContext";
import { SetupRequiredPage } from "../pages/SetupRequiredPage";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { configMissing, loading, session } = useAuth();
  const location = useLocation();

  if (configMissing) {
    return <SetupRequiredPage />;
  }

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-paper text-sm font-black text-ink">Loading session...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
