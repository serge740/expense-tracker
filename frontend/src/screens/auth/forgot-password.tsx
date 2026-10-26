// Ported from expo_app/app/(auth)/forgot-password.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Alert } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router } from '@/router/router';
import { Text } from '@/components/text';
import { requestPasswordReset, verifyResetOtp, resetPassword } from '@/services/client-auth.service';
import { AUTH, AuthScreen, Field, PhoneField, PrimaryButton, ModeTabs, goBack, errorMessage } from '@/components/auth/ui';
import { COUNTRIES, DEFAULT_COUNTRY_ISO } from '@/components/auth/countries';

type Step = 'request' | 'otp' | 'reset' | 'done';
const OTP_LEN = 6;
const RESEND_SECONDS = 30;

const COPY: Record<Step, { title: string; subtitle: string }> = {
  request: { title: 'Forgot Password', subtitle: 'Enter your registered email or phone number and we\'ll send you a reset code.' },
  otp:     { title: 'Enter Verification Code', subtitle: '' },
  reset:   { title: 'Create New Password', subtitle: 'Your new password must be at least 6 characters.' },
  done:    { title: 'Password Updated', subtitle: 'You can now sign in with your new password.' },
};

export default function ForgotPasswordScreen() {
  const [step, setStep]         = useState<Step>('request');
  const [mode, setMode]         = useState<'email' | 'phone'>('email');
  const [email, setEmail]       = useState('');
  const [country, setCountry]   = useState(COUNTRIES.find(c => c.iso === DEFAULT_COUNTRY_ISO)!);
  const [phone, setPhone]       = useState('');
  const [sentTo, setSentTo]     = useState('');
  const [otp, setOtp]           = useState('');
  const [resetToken, setToken]  = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);
  const [countdown, setCountdown] = useState(0);
  const otpRef = useRef<TextInput>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const identifier = () =>
    mode === 'email'
      ? email.trim().toLowerCase()
      : `${country.dial}${phone.replace(/\D/g, '').replace(/^0+/, '')}`;

  const run = async (fn: () => Promise<void>) => {
    setLoading(true);
    try { await fn(); } catch (e) { Alert.alert('Something went wrong', errorMessage(e)); } finally { setLoading(false); }
  };

  const sendCode = () => {
    if (!(mode === 'email' ? email.trim() : phone.trim())) {
      Alert.alert('Required', `Please enter your ${mode === 'email' ? 'email' : 'phone number'}.`);
      return;
    }
    return run(async () => {
      const res = await requestPasswordReset(identifier());
      setSentTo(res.sentTo);
      setOtp('');
      setCountdown(RESEND_SECONDS);
      setStep('otp');
      setTimeout(() => otpRef.current?.focus(), 300);
    });
  };

  const confirmCode = () => {
    if (otp.length !== OTP_LEN) return Alert.alert('Incomplete code', `Enter all ${OTP_LEN} digits.`);
    return run(async () => {
      const { resetToken } = await verifyResetOtp(identifier(), otp);
      setToken(resetToken);
      setStep('reset');
    });
  };

  const savePassword = () => {
    if (password.length < 6) return Alert.alert('Weak password', 'Password must be at least 6 characters.');
    if (password !== confirm) return Alert.alert('Passwords differ', 'Password and confirmation do not match.');
    return run(async () => {
      await resetPassword(resetToken, password);
      setStep('done');
    });
  };

  const back = () => {
    if (step === 'otp') setStep('request');
    else if (step === 'reset') setStep('otp');
    else goBack();
  };

  const subtitle = step === 'otp'
    ? `We sent a ${OTP_LEN}-digit code to ${sentTo}. It expires in 10 minutes.`
    : COPY[step].subtitle;

  return (
    <AuthScreen title={COPY[step].title} subtitle={subtitle} back={step === 'done' ? undefined : back}>
      {step === 'request' && (
        <>
          <ModeTabs mode={mode} onChange={setMode} />
          {mode === 'email'
            ? <Field label="Email" placeholder="Enter your email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            : <PhoneField country={country} onCountry={setCountry} value={phone} onChangeText={setPhone} />}
          <PrimaryButton label="Send Code" onPress={sendCode} loading={loading} />
        </>
      )}

      {step === 'otp' && (
        <>
          <TouchableOpacity activeOpacity={1} onPress={() => otpRef.current?.focus()} style={s.otpRow}>
            {Array.from({ length: OTP_LEN }).map((_, i) => {
              const active = i === Math.min(otp.length, OTP_LEN - 1);
              return (
                <View key={i} style={[s.otpBox, active && s.otpBoxActive]}>
                  <Text style={s.otpDigit}>{otp[i] ?? ''}</Text>
                </View>
              );
            })}
          </TouchableOpacity>
          <TextInput
            ref={otpRef}
            value={otp}
            onChangeText={v => setOtp(v.replace(/\D/g, '').slice(0, OTP_LEN))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={OTP_LEN}
            style={s.hiddenInput}
          />

          <TouchableOpacity disabled={countdown > 0 || loading} onPress={sendCode} style={s.resend}>
            <Text style={[s.resendText, countdown > 0 && { color: AUTH.muted }]}>
              {countdown > 0 ? `Resend code in 00:${String(countdown).padStart(2, '0')}` : 'Resend code'}
            </Text>
          </TouchableOpacity>

          <PrimaryButton label="Confirm" onPress={confirmCode} loading={loading} />
        </>
      )}

      {step === 'reset' && (
        <>
          <Field label="New password" placeholder="Enter new password" value={password} onChangeText={setPassword} secure autoCapitalize="none" />
          <Field label="Confirm password" placeholder="Confirm new password" value={confirm} onChangeText={setConfirm} secure autoCapitalize="none" />
          <PrimaryButton label="Save Password" onPress={savePassword} loading={loading} />
        </>
      )}

      {step === 'done' && (
        <>
          <View style={s.doneIcon}>
            <MaterialIcons name="check" size={34} color="#FFFFFF" />
          </View>
          <PrimaryButton label="Back to Login" onPress={() => router.replace('/(auth)/login')} />
        </>
      )}
    </AuthScreen>
  );
}

const s = StyleSheet.create({
  otpRow:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  otpBox: {
    width: 44, height: 50, borderRadius: 14, borderWidth: 1, borderColor: AUTH.inputBorder,
    backgroundColor: AUTH.inputBg, alignItems: 'center', justifyContent: 'center',
  },
  otpBoxActive: { borderColor: AUTH.primary, borderWidth: 1.5 },
  otpDigit:     { fontSize: 18, fontWeight: '600', color: AUTH.text },
  hiddenInput:  { position: 'absolute', opacity: 0, height: 1, width: 1 },

  resend:     { alignSelf: 'center', marginBottom: 18 },
  resendText: { fontSize: 12, fontWeight: '500', color: AUTH.primary },

  doneIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: AUTH.primary,
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginVertical: 18,
  },
});
