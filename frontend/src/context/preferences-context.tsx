import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { storage } from '@/lib/storage';
import type { NotificationSound } from '@/lib/sounds';

export type MeetingApp = 'meet' | 'zoom' | 'teams' | 'in-person';

export interface Preferences {
  // Date & time
  timeFormat: '12h' | '24h';
  weekStart: 'monday' | 'sunday';
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

  // Meetings & schedule
  meetingDuration: number; // minutes
  meetingReminder: number; // minutes before; 0 = off
  meetingApp: MeetingApp;
  workStart: number; // minutes from midnight
  workEnd: number;
  workDays: number[]; // 0 = Sunday … 6 = Saturday
  focusTime: boolean; // block notifications during focus blocks
  autoDecline: boolean; // decline meetings outside working hours

  // Notification categories (channels live on the server)
  notifyTransactions: boolean;
  notifyBudgets: boolean;
  notifyBills: boolean;
  notifyMeetings: boolean;
  notifyWeeklySummary: boolean;
  notifySecurity: boolean;
  quietHours: boolean;
  quietStart: number;
  quietEnd: number;
  notificationSound: NotificationSound;
  notificationVibrate: boolean;
  hideBalances: boolean;
  // Home: count loans in the month's income / expense, and the feed chip last used.
  includeLoans: boolean;
  homeView: 'all' | 'income' | 'expense' | 'debt' | 'credit' | 'scheduled';
  // The stretch of time Home opens on (the pill on Home can change it for the visit).
  homePeriod: 'month' | 'year' | 'all';
}

export const DEFAULT_PREFERENCES: Preferences = {
  timeFormat: '24h',
  weekStart: 'monday',
  dateFormat: 'DD/MM/YYYY',

  meetingDuration: 30,
  meetingReminder: 10,
  meetingApp: 'meet',
  workStart: 9 * 60,
  workEnd: 17 * 60,
  workDays: [1, 2, 3, 4, 5],
  focusTime: false,
  autoDecline: false,

  notifyTransactions: true,
  notifyBudgets: true,
  notifyBills: true,
  notifyMeetings: true,
  notifyWeeklySummary: true,
  notifySecurity: true,
  quietHours: false,
  quietStart: 22 * 60,
  quietEnd: 7 * 60,
  notificationSound: 'chime',
  notificationVibrate: true,
  hideBalances: false,
  includeLoans: true,
  homeView: 'all',
  homePeriod: 'month',
};

export const STORAGE_KEY = 'app_preferences_v1'; // same key as the phone app

type Ctx = {
  prefs: Preferences;
  setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  formatTime: (minutes: number) => string;
};

const PreferencesContext = createContext<Ctx>({ prefs: DEFAULT_PREFERENCES, setPref: () => {}, formatTime: () => '' });

/** Minutes after midnight as a clock, in 12h or 24h form. Pure, for tests. */
export function formatClock(minutes: number, timeFormat: Preferences['timeFormat']): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = String(minutes % 60).padStart(2, '0');
  if (timeFormat === '24h') return `${String(h).padStart(2, '0')}:${m}`;
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

function load(): Preferences {
  try {
    const raw = storage.get(STORAGE_KEY);
    return raw ? { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) } : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(load);

  const setPref = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      storage.set(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const formatTime = useCallback((minutes: number) => formatClock(minutes, prefs.timeFormat), [prefs.timeFormat]);

  return <PreferencesContext.Provider value={{ prefs, setPref, formatTime }}>{children}</PreferencesContext.Provider>;
}

export const usePreferences = () => useContext(PreferencesContext);
