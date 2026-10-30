import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import itSupportAuthService, { type ITAdmin } from '../services/itSupportAuthService';

interface ITAdminAuthValue {
  itAdmin: ITAdmin | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<ITAdmin>;
  logout: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
}

const ITAdminAuthContext = createContext<ITAdminAuthValue | null>(null);

export function ITAdminAuthProvider({ children }: { children: ReactNode }) {
  const [itAdmin, setITAdmin] = useState<ITAdmin | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuthStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const profile = await itSupportAuthService.getProfile();
      setITAdmin(profile);
      setIsAuthenticated(true);
    } catch {
      setITAdmin(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const login = async (email: string, password: string) => {
    const result = await itSupportAuthService.login(email, password);
    setITAdmin(result.itAdmin);
    setIsAuthenticated(true);
    return result.itAdmin;
  };

  const logout = async () => {
    try {
      await itSupportAuthService.logout();
    } finally {
      setITAdmin(null);
      setIsAuthenticated(false);
    }
  };

  return (
    <ITAdminAuthContext.Provider value={{ itAdmin, isAuthenticated, isLoading, login, logout, checkAuthStatus }}>
      {children}
    </ITAdminAuthContext.Provider>
  );
}

export function useITAdminAuth() {
  const ctx = useContext(ITAdminAuthContext);
  if (!ctx) throw new Error('useITAdminAuth must be used within an ITAdminAuthProvider');
  return ctx;
}
