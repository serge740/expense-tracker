import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  getMe, sendVerificationCode, confirmVerificationCode, ClientProfile,
} from '@/services/client-auth.service';
import { SettingsScreen, Badge, Hint, IconName } from '@/components/settings/ui';
import { useI18n } from '@/context/language-context';

const OTP_LEN = 6;
const RESEND_SECONDS = 30;
const errMsg = (e: any) => e?.response?.data?.message || e?.message || 'Please try again.';
const isPlaceholderPhone = (p?: string) => !p || /^(google|apple|facebook)_/.test(p);

export default function VerifyScreen() {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [profile, setProfile] = useState<ClientProfile | null>(null);

  useEffect(() => {
    getMe().then(setProfile).catch(() => { /* offline */ });
  }, []);

  if (!profile) {
    return (
      <SettingsScreen title={t('verify.title')}>
        <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
      </SettingsScreen>
    );
  }

  const emailDone = !!profile.emailVerifiedAt;
  const phoneDone = !!profile.phoneVerifiedAt;
  const done = Number(emailDone) + Number(phoneDone);

  return (
    <SettingsScreen title={t('verify.title')} subtitle={t('verify.subtitle')}>
      <View style={[s.summary, { backgroundColor: theme.buttonBg }]}>
        <MaterialIcons name={done === 2 ? 'verified' : 'shield'} size={26} color="#FFFFFF" />
        <View style={{ flex: 1 }}>
          <Text style={s.summaryTitle}>{done === 2 ? t('verify.fully') : t('verify.count', { done })}</Text>
          <Text style={s.summarySub}>
            {done === 2 ? t('verify.protected') : t('verify.why')}
          </Text>
        </View>
      </View>

      <VerifyCard
        channel="email"
        icon="email"
        title={t('verify.email')}
        target={profile.email}
        verifiedAt={profile.emailVerifiedAt}
        onVerified={setProfile}
      />

      {isPlaceholderPhone(profile.phone) ? (
        <TouchableOpacity
          style={[s.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => router.push('/(dashboard)/(settings)/edit-profile')}
          activeOpacity={0.8}
        >
          <View style={s.cardHead}>
            <View style={[s.icon, { backgroundColor: theme.primaryBg }]}>
              <MaterialIcons name="phone-iphone" size={17} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.cardTitle, { color: theme.text }]}>{t('verify.phone')}</Text>
              <Text style={[s.cardSub, { color: theme.textSecondary }]}>{t('verify.addPhoneToVerify')}</Text>
            </View>
            <Badge label={t('badge.add')} tone="info" />
          </View>
        </TouchableOpacity>
      ) : (
        <VerifyCard
          channel="phone"
          icon="phone-iphone"
          title={t('verify.phone')}
          target={profile.phone}
          verifiedAt={profile.phoneVerifiedAt}
          onVerified={setProfile}
        />
      )}

      <Hint>{t('verify.hint')}</Hint>
    </SettingsScreen>
  );
}

// ── One channel (email or phone) ──────────────────────────────────────────
function VerifyCard({
  channel, icon, title, target, verifiedAt, onVerified,
}: {
  channel: 'email' | 'phone';
  icon: IconName;
  title: string;
  target: string;
  verifiedAt?: string | null;
  onVerified: (p: ClientProfile) => void;
}) {
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const [sentTo, setSentTo]       = useState<string | null>(null);
  const [devNote, setDevNote]     = useState<string | null>(null);
  const [otp, setOtp]             = useState('');
  const [busy, setBusy]           = useState(false);
  const [countdown, setCountdown] = useState(0);
  const otpRef = useRef<TextInput>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const send = async () => {
    setBusy(true);
    try {
      const res = await sendVerificationCode(channel);
      setSentTo(res.sentTo);
      setDevNote(res.devNote ?? null);
      setOtp('');
      setCountdown(RESEND_SECONDS);
      setTimeout(() => otpRef.current?.focus(), 300);
    } catch (e) {
      Alert.alert(t('verify.sendFailed'), errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (otp.length !== OTP_LEN) return Alert.alert(t('verify.incomplete'), t('verify.incompleteMsg'));
    setBusy(true);
    try {
      onVerified(await confirmVerificationCode(channel, otp));
      setSentTo(null);
    } catch (e) {
      Alert.alert(t('verify.failed'), errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const verified = !!verifiedAt;

  return (
    <View style={[s.card, { backgroundColor: theme.surface, borderColor: verified ? theme.border : theme.border }]}>
      <View style={s.cardHead}>
        <View style={[s.icon, { backgroundColor: theme.primaryBg }]}>
          <MaterialIcons name={icon} size={17} color={theme.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.cardTitle, { color: theme.text }]}>{title}</Text>
          <Text style={[s.cardSub, { color: theme.textSecondary }]} numberOfLines={1}>{target}</Text>
        </View>
        <Badge
          label={t(verified ? 'badge.verified' : sentTo ? 'badge.codeSent' : 'badge.notVerified')}
          tone={verified ? 'ok' : sentTo ? 'info' : 'warn'}
        />
      </View>

      {verified ? (
        <Text style={[s.note, { color: theme.textSecondary }]}>
          {t('verify.verifiedOn', { date: formatDate(verifiedAt!, { day: 'numeric', month: 'short', year: 'numeric' }) })}
        </Text>
      ) : sentTo ? (
        <>
          <Text style={[s.note, { color: theme.textSecondary }]}>
            {t('verify.enterCode', { to: sentTo })}
          </Text>
          {devNote && <Text style={[s.dev, { color: theme.textMuted }]}>{devNote}</Text>}
          <TouchableOpacity activeOpacity={1} onPress={() => otpRef.current?.focus()} style={s.otpRow}>
            {Array.from({ length: OTP_LEN }).map((_, i) => {
              const active = i === Math.min(otp.length, OTP_LEN - 1);
              return (
                <View key={i} style={[s.otpBox, { backgroundColor: theme.inputBg, borderColor: active ? theme.primary : theme.border }]}>
                  <Text style={[s.otpDigit, { color: theme.text }]}>{otp[i] ?? ''}</Text>
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
            autoComplete={channel === 'phone' ? 'sms-otp' : 'one-time-code'}
            maxLength={OTP_LEN}
            style={s.hidden}
          />
          <View style={s.actions}>
            <TouchableOpacity disabled={countdown > 0 || busy} onPress={send} hitSlop={6}>
              <Text style={[s.resend, { color: countdown > 0 ? theme.textMuted : theme.primary }]}>
                {countdown > 0 ? t('verify.resendIn', { time: `00:${String(countdown).padStart(2, '0')}` }) : t('verify.resend')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, { backgroundColor: theme.buttonBg }]} onPress={confirm} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>{t('verify.verify')}</Text>}
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <TouchableOpacity style={[s.btn, s.btnWide, { backgroundColor: theme.buttonBg }]} onPress={send} disabled={busy} activeOpacity={0.85}>
          {busy
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.btnText}>{t(channel === 'email' ? 'verify.sendEmail' : 'verify.sendSms')}</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  summary:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, marginBottom: 14 },
  summaryTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  summarySub:   { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 1 },

  card:      { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardHead:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon:      { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 13, fontWeight: '600' },
  cardSub:   { fontSize: 11, marginTop: 1 },
  note:      { fontSize: 11, marginTop: 10 },
  dev:       { fontSize: 10, marginTop: 4, fontStyle: 'italic' },

  otpRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  otpBox:   { width: 42, height: 46, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  otpDigit: { fontSize: 17, fontWeight: '600' },
  hidden:   { position: 'absolute', opacity: 0, width: 1, height: 1 },

  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  resend:  { fontSize: 12, fontWeight: '500' },
  btn:     { height: 38, borderRadius: 19, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  btnWide: { marginTop: 12 },
  btnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
});
