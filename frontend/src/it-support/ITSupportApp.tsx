import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ITAdminAuthProvider, useITAdminAuth } from './context/ITAdminAuthContext';
import DashboardLayout from './components/DashboardLayout';
import Login from './pages/Login';
import DataExportPage from './pages/DataExportPage';
import './it-support.css';

function RequireITAdmin() {
  const { isAuthenticated, isLoading } = useITAdminAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Loader2 size={22} className="animate-spin text-accent" />
      </div>
    );
  }
  return isAuthenticated ? <Outlet /> : <Navigate to="/it-support/login" replace />;
}

function Router() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route element={<RequireITAdmin />}>
        <Route element={<DashboardLayout />}>
          <Route path="data-export" element={<DataExportPage />} />
          <Route index element={<Navigate to="data-export" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="login" replace />} />
    </Routes>
  );
}

/**
 * The IT Support portal's own, fully separate app tree — mounted by App.tsx at a level ABOVE
 * the consumer app's `#phone` frame, so this never inherits the phone-sized layout, the
 * Client-auth providers, or any of the consumer app's styling. See it-support.css for why
 * Tailwind here can't leak into the rest of the app either.
 */
export default function ITSupportApp() {
  return (
    <div id="it-support-root">
      <ITAdminAuthProvider>
        <Router />
      </ITAdminAuthProvider>
    </div>
  );
}
