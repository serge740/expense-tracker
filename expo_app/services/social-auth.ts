import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Facebook from 'expo-auth-session/providers/facebook';
import * as WebBrowser from 'expo-web-browser';
import ENV from '@/env';
import { GoogleSignin, statusCodes } from '@/services/google-signin';
import { googleAuthClient, appleAuthClient, facebookAuthClient } from '@/services/client-auth.service';

WebBrowser.maybeCompleteAuthSession();

let googleConfigured = false;

function configureGoogle() {
  if (googleConfigured) return;
  GoogleSignin.configure({
    webClientId: '936996911068-a2e2v1jjq9c7hmotp339l1spqe75g102.apps.googleusercontent.com',
    offlineAccess: true,
  });
  googleConfigured = true;
}

/** Returns false if the user cancelled. Throws on real errors. */
export async function signInWithGoogle(phone?: string): Promise<boolean> {
  configureGoogle();
  try {
    await GoogleSignin.hasPlayServices();
    try { await GoogleSignin.signOut(); } catch {}
    const response = await GoogleSignin.signIn();
    const idToken = response.data?.idToken;
    if (!idToken) return false;
    await googleAuthClient(idToken, phone);
    return true;
  } catch (error: any) {
    if (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS) return false;
    throw error;
  }
}

// Sign in with Apple is iOS-only.
export const appleSignInSupported = Platform.OS === 'ios';

/** Returns false if the user cancelled. Throws on real errors. */
export async function signInWithApple(): Promise<boolean> {
  if (!(await AppleAuthentication.isAvailableAsync())) {
    throw new Error('Sign in with Apple is not available on this device.');
  }
  try {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!cred.identityToken) throw new Error('Apple did not return an identity token.');
    await appleAuthClient(cred.identityToken, cred.fullName?.givenName ?? undefined, cred.fullName?.familyName ?? undefined);
    return true;
  } catch (error: any) {
    if (error.code === 'ERR_REQUEST_CANCELED') return false;
    throw error;
  }
}

/** Hook: returns a sign-in function. Resolves false if the user cancelled. */
export function useFacebookSignIn(): () => Promise<boolean> {
  const appId = ENV.FACEBOOK_APP_ID;
  const [request, , promptAsync] = Facebook.useAuthRequest({ clientId: appId || 'not-configured' });

  return async () => {
    if (!appId) throw new Error('Facebook login is not set up yet. Add your Facebook App ID in env.ts.');
    if (!request) throw new Error('Facebook login is still loading. Please try again.');
    const result = await promptAsync();
    if (result.type !== 'success') return false;
    const token = result.authentication?.accessToken ?? result.params?.access_token;
    if (!token) throw new Error('Facebook did not return an access token.');
    await facebookAuthClient(token);
    return true;
  };
}
