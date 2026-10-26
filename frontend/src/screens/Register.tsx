import { useState } from 'react';
import { Alert } from '@/rn';
import { router } from '@/router/router';
import { registerClient } from '@/services/client-auth.service';
import { COUNTRIES, DEFAULT_COUNTRY_ISO } from '@/lib/countries';
import { signInWith } from '@/services/social-auth';
import {
  AuthScreen, Field, PhoneField, PrimaryButton, OrDivider, SocialRow, FooterLink, goBack, errorMessage, StrengthMeter, type Social,
} from '@/components/auth/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState(COUNTRIES.find(c => c.iso === DEFAULT_COUNTRY_ISO)!);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState<'form' | Social | null>(null);
  const [pwVisible, setPwVisible] = useState(false);

  const fullPhone = () => `${country.dial}${phone.replace(/\D/g, '').replace(/^0+/, '')}`;

  const handleRegister = async () => {
    const name = fullName.trim().replace(/\s+/g, ' ');
    if (!name || !email.trim() || !phone.trim() || !password) {
      Alert.alert('Missing details', 'Please fill in all fields.');
      return;
    }
    if (!EMAIL_RE.test(email.trim())) return Alert.alert('Invalid email', 'Please enter a valid email address.');
    if (phone.replace(/\D/g, '').length < 6) return Alert.alert('Invalid phone', 'Please enter a valid phone number.');
    if (password.length < 6) return Alert.alert('Weak password', 'Password must be at least 6 characters.');
    if (password !== confirm) return Alert.alert('Passwords differ', 'Password and confirmation do not match.');

    const [firstName, ...rest] = name.split(' ');
    setLoading('form');
    try {
      await registerClient({ firstName, lastName: rest.join(' ') || undefined, email: email.trim().toLowerCase(), phone: fullPhone(), password });
      router.replace('/(dashboard)');
    } catch (e) {
      Alert.alert('Registration failed', errorMessage(e));
    } finally {
      setLoading(null);
    }
  };

  const handleSocial = async (kind: Social) => {
    setLoading(kind);
    try {
      if (await signInWith(kind, phone.trim() ? fullPhone() : undefined)) router.replace('/(dashboard)');
    } catch (e) {
      const name = kind === 'apple' ? 'Apple' : kind === 'facebook' ? 'Facebook' : 'Google';
      Alert.alert(`${name} sign-up failed`, errorMessage(e));
    } finally {
      setLoading(null);
    }
  };

  return (
    <AuthScreen title="Create Account" subtitle="Sign up and take control of your money" back={goBack}>
      <Field label="Full name" placeholder="Enter your full name" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
      <Field label="Email" placeholder="Enter your email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <PhoneField country={country} onCountry={setCountry} value={phone} onChangeText={setPhone} />
      <Field
        label="Password" placeholder="Create a password" value={password} onChangeText={setPassword} secure
        visible={pwVisible} onToggleVisible={() => setPwVisible(v => !v)} autoCapitalize="none" textContentType="newPassword"
      />
      <StrengthMeter password={password} />
      <Field
        label="Confirm password" placeholder="Confirm your password" value={confirm} onChangeText={setConfirm} secure
        visible={pwVisible} onToggleVisible={() => setPwVisible(v => !v)} autoCapitalize="none" textContentType="newPassword"
      />

      <PrimaryButton label="Create Account" onPress={handleRegister} loading={loading === 'form'} />

      <OrDivider />
      <SocialRow items={['google', 'facebook', 'apple']} onPress={handleSocial} busy={loading === 'form' ? null : loading} />

      <FooterLink prompt="Already have an account?" link="Login" onPress={() => router.replace('/(auth)/login')} />
    </AuthScreen>
  );
}
