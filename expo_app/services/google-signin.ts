import { TurboModuleRegistry } from 'react-native';

type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');

// Expo Go doesn't ship the RNGoogleSignin native module, and importing the
// library there throws at load time. Only require it when the module exists.
export const isGoogleSigninAvailable = TurboModuleRegistry.get('RNGoogleSignin') != null;

const lib: GoogleSigninModule | null = isGoogleSigninAvailable
  ? require('@react-native-google-signin/google-signin')
  : null;

const unavailable = async (): Promise<never> => {
  throw new Error('Google Sign-In is not available in Expo Go. Use a development build.');
};

const GoogleSigninStub = {
  configure: () => {},
  hasPlayServices: unavailable,
  signIn: unavailable,
  signOut: async () => null,
  getCurrentUser: () => null,
} as unknown as GoogleSigninModule['GoogleSignin'];

const GoogleSigninButtonStub = Object.assign(() => null, {
  Size: { Icon: 2, Standard: 0, Wide: 1 },
  Color: { Dark: 'dark', Light: 'light' },
}) as unknown as GoogleSigninModule['GoogleSigninButton'];

export const GoogleSignin = lib?.GoogleSignin ?? GoogleSigninStub;
export const GoogleSigninButton = lib?.GoogleSigninButton ?? GoogleSigninButtonStub;
export const statusCodes = lib?.statusCodes ?? ({} as GoogleSigninModule['statusCodes']);
