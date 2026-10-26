import { storage } from '@/lib/storage';

/** The phone's AsyncStorage API on top of the browser's localStorage. */
const AsyncStorage = {
  getItem: async (key: string) => storage.get(key),
  setItem: async (key: string, value: string) => { storage.set(key, value); },
  removeItem: async (key: string) => { storage.remove(key); },
};
export default AsyncStorage;
