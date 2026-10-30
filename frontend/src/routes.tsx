import { useMemo } from 'react';
import { Navigate, Outlet, useRoutes } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { getToken } from '@/services/client-auth.service';
import Welcome from '@/screens/Welcome';
import Login from '@/screens/Login';
import Register from '@/screens/Register';
import ForgotPassword from '@/screens/auth/forgot-password';
import DashboardLayout from '@/screens/DashboardLayout';
import NotFound from '@/screens/NotFound';

import Home from '@/screens/dashboard/home';
import Wallets from '@/screens/dashboard/wallets';
import Debts from '@/screens/dashboard/debts';
import Profile from '@/screens/dashboard/profile';
import Add from '@/screens/dashboard/add';
import Scan from '@/screens/dashboard/scan';
import History from '@/screens/dashboard/history';
import Expense from '@/screens/dashboard/expense';
import WalletDetail from '@/screens/dashboard/wallet-detail';
import Transfer from '@/screens/dashboard/transfer';
import Reports from '@/screens/dashboard/reports';
import DebtLedger from '@/screens/dashboard/debt-ledger';
import Scheduled from '@/screens/dashboard/scheduled';
import Trash from '@/screens/dashboard/trash';
import Activity from '@/screens/dashboard/activity';
import Budget from '@/screens/dashboard/budget';
import TransactionDetail from '@/screens/dashboard/transaction-detail';
import Family from '@/screens/dashboard/family';
import FamilyCreate from '@/screens/dashboard/family-create';
import FamilyJoin from '@/screens/dashboard/family-join';
import JoinPage from '@/screens/JoinPage';

import About from '@/screens/settings/about';
import AppUpdates from '@/screens/settings/app-updates';
import Appearance from '@/screens/settings/appearance';
import Currency from '@/screens/settings/currency';
import DateTime from '@/screens/settings/date-time';
import Devices from '@/screens/settings/devices';
import EditProfile from '@/screens/settings/edit-profile';
import Help from '@/screens/settings/help';
import NotificationSettings from '@/screens/settings/notification-settings';
import Notifications from '@/screens/settings/notifications';
import Passkeys from '@/screens/settings/passkeys';
import Privacy from '@/screens/settings/privacy';
import Schedule from '@/screens/settings/schedule';
import Security from '@/screens/settings/security';
import Verify from '@/screens/settings/verify';

/** Signed-out visitors are sent to sign in. */
function RequireAuth() {
  return getToken() ? <Outlet /> : <Navigate to="/login" replace />;
}

/**
 * Every screen of the phone app. The addresses are the phone app's, without the invisible "(group)" folders,
 * and the dashboard ones live under /app (see router/paths.ts).
 */
const dashboardScreens: RouteObject[] = [
  { index: true, element: <Home /> },
  { path: 'wallets', element: <Wallets /> },
  { path: 'debts', element: <Debts /> },
  { path: 'profile', element: <Profile /> },
  { path: 'add', element: <Add /> },
  { path: 'scan', element: <Scan /> },
  { path: 'history', element: <History /> },
  { path: 'expense', element: <Expense /> },
  { path: 'wallet-detail', element: <WalletDetail /> },
  { path: 'transfer', element: <Transfer /> },
  { path: 'reports', element: <Reports /> },
  { path: 'debt-ledger', element: <DebtLedger /> },
  { path: 'scheduled', element: <Scheduled /> },
  { path: 'trash', element: <Trash /> },
  { path: 'activity', element: <Activity /> },
  { path: 'budget', element: <Budget /> },
  { path: 'transaction-detail', element: <TransactionDetail /> },
  { path: 'family', element: <Family /> },
  { path: 'family-create', element: <FamilyCreate /> },
  { path: 'family-join', element: <FamilyJoin /> },
  // Settings
  { path: 'about', element: <About /> },
  { path: 'app-updates', element: <AppUpdates /> },
  { path: 'appearance', element: <Appearance /> },
  { path: 'currency', element: <Currency /> },
  { path: 'date-time', element: <DateTime /> },
  { path: 'devices', element: <Devices /> },
  { path: 'edit-profile', element: <EditProfile /> },
  { path: 'help', element: <Help /> },
  { path: 'notification-settings', element: <NotificationSettings /> },
  { path: 'notifications', element: <Notifications /> },
  { path: 'passkeys', element: <Passkeys /> },
  { path: 'privacy', element: <Privacy /> },
  { path: 'schedule', element: <Schedule /> },
  { path: 'security', element: <Security /> },
  { path: 'verify', element: <Verify /> },
];

export function createRoutes(): RouteObject[] {
  return [
    { path: '/', element: <Welcome /> },
    { path: '/login', element: <Login /> },
    { path: '/register', element: <Register /> },
    { path: '/forgot-password', element: <ForgotPassword /> },
    // The page a family invite link opens. Public: the person may not have an account yet.
    { path: '/join', element: <JoinPage /> },
    { path: '/join/:token', element: <JoinPage /> },
    // Development only: look at the dashboard without signing in. Not part of the production build.
    ...(import.meta.env.DEV ? [{ path: '/__preview', element: <Outlet />, children: [{ path: 'app', element: <DashboardLayout />, children: dashboardScreens }] }] : []),
    { element: <RequireAuth />, children: [{ path: '/app', element: <DashboardLayout />, children: dashboardScreens }] },
    { path: '*', element: <NotFound /> },
  ];
}

/** The screens, drawn by react-router-dom's own <Routes> machinery inside the <BrowserRouter> in App.tsx. */
export function AppRoutes() {
  const routes = useMemo(createRoutes, []);
  return useRoutes(routes);
}
