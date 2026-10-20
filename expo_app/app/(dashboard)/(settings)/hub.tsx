import { useCallback } from 'react';
import { router, useFocusEffect } from 'expo-router';

// Anchor route for the settings stack. It never shows anything: when it comes into focus
// (back from the last settings page) it sends the user to the Profile tab.
export default function SettingsHub() {
  useFocusEffect(useCallback(() => { router.navigate('/(dashboard)/profile'); }, []));
  return null;
}
