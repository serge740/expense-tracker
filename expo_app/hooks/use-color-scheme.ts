import { useColorScheme as useRNColorScheme } from 'react-native';

// RN can report 'unspecified'; normalize to the two schemes the app supports.
export function useColorScheme(): 'light' | 'dark' {
  return useRNColorScheme() === 'dark' ? 'dark' : 'light';
}
