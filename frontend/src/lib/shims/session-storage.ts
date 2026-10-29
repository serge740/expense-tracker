/**
 * AsyncStorage's API on top of the browser's sessionStorage: kept only for this tab, gone when it closes. Used for an invite
 * link's secret, which should not stay on the device after the browser is closed. Never throws (storage can be blocked).
 */
const SessionStorage = {
  getItem: async (key: string): Promise<string | null> => { try { return window.sessionStorage.getItem(key); } catch { return null; } },
  setItem: async (key: string, value: string): Promise<void> => { try { window.sessionStorage.setItem(key, value); } catch { /* blocked */ } },
  removeItem: async (key: string): Promise<void> => { try { window.sessionStorage.removeItem(key); } catch { /* blocked */ } },
};
export default SessionStorage;
