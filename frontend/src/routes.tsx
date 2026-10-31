import { useMemo } from 'react';
import { Navigate, Outlet, useRoutes } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { getToken } from '@/services/client-auth.service';
import { lazyScreen, preloadWhenIdle } from '@/lib/lazy';
import Welcome from '@/screens/Welcome';
import Login from '@/screens/Login';
const Register = lazyScreen(() => import('@/screens/Register'));
const ForgotPassword = lazyScreen(() => import('@/screens/auth/forgot-password'));
const DashboardLayout = lazyScreen(() => import('@/screens/DashboardLayout'));
import NotFound from '@/screens/NotFound';

const Home = lazyScreen(() => import('@/screens/dashboard/home'));
const Wallets = lazyScreen(() => import('@/screens/dashboard/wallets'));
const Debts = lazyScreen(() => import('@/screens/dashboard/debts'));
const Profile = lazyScreen(() => import('@/screens/dashboard/profile'));
const Add = lazyScreen(() => import('@/screens/dashboard/add'));
const Scan = lazyScreen(() => import('@/screens/dashboard/scan'));
const History = lazyScreen(() => import('@/screens/dashboard/history'));
const Expense = lazyScreen(() => import('@/screens/dashboard/expense'));
const WalletDetail = lazyScreen(() => import('@/screens/dashboard/wallet-detail'));
const Transfer = lazyScreen(() => import('@/screens/dashboard/transfer'));
const Reports = lazyScreen(() => import('@/screens/dashboard/reports'));
const DebtLedger = lazyScreen(() => import('@/screens/dashboard/debt-ledger'));
const Scheduled = lazyScreen(() => import('@/screens/dashboard/scheduled'));
const HistoryDuplicates = lazyScreen(() => import('@/screens/dashboard/history-duplicates'));
const Trash = lazyScreen(() => import('@/screens/dashboard/trash'));
const Activity = lazyScreen(() => import('@/screens/dashboard/activity'));
const FamilyGoals = lazyScreen(() => import('@/screens/dashboard/family-goals'));
const FamilyAllowances = lazyScreen(() => import('@/screens/dashboard/family-allowances'));
const FamilyTransfers = lazyScreen(() => import('@/screens/dashboard/family-transfers'));
const FamilyApprovals = lazyScreen(() => import('@/screens/dashboard/family-approvals'));
const Budget = lazyScreen(() => import('@/screens/dashboard/budget'));
const TransactionDetail = lazyScreen(() => import('@/screens/dashboard/transaction-detail'));
const Family = lazyScreen(() => import('@/screens/dashboard/family'));
const FamilyCreate = lazyScreen(() => import('@/screens/dashboard/family-create'));
const FamilyJoin = lazyScreen(() => import('@/screens/dashboard/family-join'));
const JoinPage = lazyScreen(() => import('@/screens/JoinPage'));

const About = lazyScreen(() => import('@/screens/settings/about'));
const AppUpdates = lazyScreen(() => import('@/screens/settings/app-updates'));
const Appearance = lazyScreen(() => import('@/screens/settings/appearance'));
const Currency = lazyScreen(() => import('@/screens/settings/currency'));
const DateTime = lazyScreen(() => import('@/screens/settings/date-time'));
const Devices = lazyScreen(() => import('@/screens/settings/devices'));
const EditProfile = lazyScreen(() => import('@/screens/settings/edit-profile'));
const Help = lazyScreen(() => import('@/screens/settings/help'));
const NotificationSettings = lazyScreen(() => import('@/screens/settings/notification-settings'));
const Notifications = lazyScreen(() => import('@/screens/settings/notifications'));
const Passkeys = lazyScreen(() => import('@/screens/settings/passkeys'));
const Privacy = lazyScreen(() => import('@/screens/settings/privacy'));
const Schedule = lazyScreen(() => import('@/screens/settings/schedule'));
const Security = lazyScreen(() => import('@/screens/settings/security'));
const Verify = lazyScreen(() => import('@/screens/settings/verify'));

/** The screens the tab bar and Home lead to first: fetched in the background so opening them feels instant. */
export const preloadMainScreens = () => preloadWhenIdle([Home, Wallets, History, Add, Debts, Profile, TransactionDetail]);

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
  { path: 'history-duplicates', element: <HistoryDuplicates /> },
  { path: 'activity', element: <Activity /> },
  { path: 'budget', element: <Budget /> },
  { path: 'transaction-detail', element: <TransactionDetail /> },
  { path: 'family', element: <Family /> },
  { path: 'family-create', element: <FamilyCreate /> },
  { path: 'family-goals', element: <FamilyGoals /> },
  { path: 'family-allowances', element: <FamilyAllowances /> },
  { path: 'family-approvals', element: <FamilyApprovals /> },
  { path: 'family-transfers', element: <FamilyTransfers /> },
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
