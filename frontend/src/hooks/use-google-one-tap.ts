import { useEffect } from 'react';
import { router } from '@/router/router';
import { startGoogleOneTap } from '@/services/social-auth';

/**
 * Shows Google's "Continue as <name>" card on the sign-in and register screens when the browser has a Google account
 * signed in. Choosing it signs the person in and opens the app; ignoring or closing it leaves the screen as it was
 * (Google itself waits longer before showing it again each time it is closed).
 */
export function useGoogleOneTap() {
  useEffect(() => startGoogleOneTap(() => router.replace('/(dashboard)')), []);
}
