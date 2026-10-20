import React, { useState } from 'react';
import { TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text } from '@/components/text';
import { loginClient } from '@/services/client-auth.service';
import { loginWithPasskey, passkeysSupported } from '@/services/passkey.service';
import { signInWithGoogle, signInWithApple, appleSignInSupported, useFacebookSignIn } from '@/services/social-auth';
import {
  AUTH, AuthScreen, Field, PhoneField, PrimaryButton, ModeTabs, OrDivider, SocialRow, FooterLink, errorMessage, Social,
} from '@/components/auth/ui';
import { COUNTRIES, DEFAULT_COUNTRY_ISO } from '@/components/auth/countries';

export default function LoginScreen() {
  const [mode, setMode]         = useState<'email' | 'phone'>('email');
  const [email, setEmail]       = useState('');
  const [country, setCountry]   = useState(COUNTRIES.find(c => c.iso === DEFAULT_COUNTRY_ISO)!);
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState<'form' | Social | 'passkey' | null>(null);
  const signInWithFacebook = useFacebookSignIn();

  const identifier = () =>
    mode === 'email'
      ? email.trim().toLowerCase()
      : `${country.dial}${phone.replace(/\D/g, '').replace(/^0+/, '')}`;

  const handleLogin = async () => {
    if (!(mode === 'email' ? email.trim() : phone.trim()) || !password) {
      Alert.alert('Missing details', `Please enter your ${mode === 'email' ? 'email' : 'phone number'} and password.`);
      return;
    }
    setLoading('form');
    try {
      await loginClient(identifier(), password);
      router.replace('/(dashboard)');
    } catch (e) {
      Alert.alert('Login failed', errorMessage(e));
    } finally {
      setLoading(null);
    }
  };

  const handlePasskey = async () => {
    setLoading('passkey');
    try {
      await loginWithPasskey();
      router.replace('/(dashboard)');
    } catch (e) {
      Alert.alert('Passkey sign-in failed', errorMessage(e));
    } finally {
      setLoading(null);
    }
  };

  const handleSocial = async (kind: Social) => {
    setLoading(kind);
    try {
      const ok = kind === 'apple'    ? await signInWithApple()
               : kind === 'facebook' ? await signInWithFacebook()
               : await signInWithGoogle();
      if (ok) router.replace('/(dashboard)');
    } catch (e) {
      const name = kind === 'apple' ? 'Apple' : kind === 'facebook' ? 'Facebook' : 'Google';
      Alert.alert(`${name} sign-in failed`, errorMessage(e));
    } finally {
      setLoading(null);
    }
  };

  return (
    <AuthScreen title="Welcome Back!" subtitle="Sign in to continue">
      <ModeTabs mode={mode} onChange={setMode} />

      {mode === 'email'
        ? <Field label="Email" placeholder="Enter your email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        : <PhoneField country={country} onCountry={setCountry} value={phone} onChangeText={setPhone} />}
      <Field label="Password" placeholder="Enter your password" value={password} onChangeText={setPassword} secure autoCapitalize="none" />

      <TouchableOpacity style={s.forgot} onPress={() => router.push('/(auth)/forgot-password')} hitSlop={6}>
        <Text style={s.forgotText}>Forgot password?</Text>
      </TouchableOpacity>

      <PrimaryButton label="Login" onPress={handleLogin} loading={loading === 'form'} />

      {passkeysSupported && (
        <TouchableOpacity style={s.passkey} onPress={handlePasskey} disabled={!!loading} activeOpacity={0.7}>
          {loading === 'passkey'
            ? <Text style={s.passkeyText}>Signing in…</Text>
            : (
              <>
                <MaterialIcons name="fingerprint" size={16} color={AUTH.primary} />
                <Text style={s.passkeyText}>Sign in with a passkey</Text>
              </>
            )}
        </TouchableOpacity>
      )}

      <OrDivider />
      <SocialRow
        items={appleSignInSupported ? ['google', 'facebook', 'apple'] : ['google', 'facebook']}
        onPress={handleSocial}
        busy={loading === 'form' || loading === 'passkey' ? null : loading}
      />

      <FooterLink prompt="Don't have an account?" link="Sign Up" onPress={() => router.push('/(auth)/register')} />
    </AuthScreen>
  );
}

const s = StyleSheet.create({
  forgot:     { alignSelf: 'flex-end', marginTop: -2, marginBottom: 14 },
  forgotText: { fontSize: 12, fontWeight: '500', color: AUTH.primary },
  passkey:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 },
  passkeyText: { fontSize: 13, fontWeight: '600', color: AUTH.primary },
});
