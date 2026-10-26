import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar, KeyboardAvoidingView, ScrollView,
  ActivityIndicator, Modal, FlatList, SafeAreaView, MaterialIcons, Clipboard, type TextInputProps,
} from '@/rn';
import { router } from '@/router/router';
import { BrandLogo } from '@/components/brand-logo';
import { COUNTRIES, flagOf, type Country } from '@/lib/countries';
import { preloadGoogle } from '@/services/social-auth';

// Auth screens always use the light palette, like onboarding.
export const AUTH = {
  bg: '#FFFFFF',
  primary: '#00627F',
  text: '#0E2A33',
  textSoft: '#5A7682',
  muted: '#9AB0B9',
  inputBg: '#F5F9FB',
  inputBorder: '#E3ECF0',
  line: '#E8EEF1',
};

// ── Screen shell ──────────────────────────────────────────────────────────
export function AuthScreen({ title, subtitle, back, children }: { title: string; subtitle?: string; back?: () => void; children: ReactNode }) {
  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={AUTH.bg} />
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        {back && (
          <View style={s.header}>
            <TouchableOpacity style={s.back} onPress={back} activeOpacity={0.7} accessibilityLabel="Back">
              <MaterialIcons name="arrow-back" size={18} color={AUTH.text} />
            </TouchableOpacity>
          </View>
        )}
        <KeyboardAvoidingView style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={s.brand}>
              <BrandLogo size={56} color={AUTH.primary} />
              <Text style={s.title}>{title}</Text>
              {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
            </View>
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ── Inputs ────────────────────────────────────────────────────────────────
type FieldProps = TextInputProps & {
  label: string;
  secure?: boolean;
  /** Controlled visibility for secure fields (optional). */
  visible?: boolean;
  onToggleVisible?: () => void;
  children?: ReactNode;
};

export function Field({ label, secure, visible, onToggleVisible, children, ...props }: FieldProps) {
  const [shownLocal, setShownLocal] = useState(false);
  const [copied, setCopied] = useState(false);
  const shown = visible ?? shownLocal;
  const toggle = onToggleVisible ?? (() => setShownLocal(v => !v));

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    if (!props.value) return;
    await Clipboard.setStringAsync(props.value);
    setCopied(true);
  };

  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      {children}
      <View style={s.inputBox}>
        <TextInput style={s.input} placeholderTextColor={AUTH.muted} secureTextEntry={secure && !shown} autoCorrect={false} accessibilityLabel={label} {...props} />
        {secure && shown && !!props.value && (
          <TouchableOpacity onPress={copy} style={s.iconBtn} accessibilityLabel="Copy password">
            <MaterialIcons name={copied ? 'check' : 'content-copy'} size={17} color={copied ? AUTH.primary : AUTH.muted} />
          </TouchableOpacity>
        )}
        {secure && (
          <TouchableOpacity onPress={toggle} style={s.iconBtn} accessibilityLabel={shown ? 'Hide password' : 'Show password'}>
            <MaterialIcons name={shown ? 'visibility-off' : 'visibility'} size={18} color={AUTH.muted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ── Password helpers ──────────────────────────────────────────────────────
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length < 6) score = Math.min(score, 1);
  const table = [
    { label: 'Too short', color: '#E5484D' },
    { label: 'Weak', color: '#E5484D' },
    { label: 'Fair', color: '#F5A524' },
    { label: 'Good', color: '#3BA4C7' },
    { label: 'Strong', color: '#22A06B' },
  ];
  return { score: score as 0 | 1 | 2 | 3 | 4, ...table[score] };
}

export function StrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const { score, label, color } = passwordStrength(password);
  return (
    <View style={s.meter}>
      {[1, 2, 3, 4].map(i => (
        <View key={i} style={[s.meterBar, { backgroundColor: i <= score ? color : AUTH.line }]} />
      ))}
      <Text style={[s.meterLabel, { color }]}>{label}</Text>
    </View>
  );
}

export function PhoneField({ country, onCountry, value, onChangeText }: { country: Country; onCountry: (c: Country) => void; value: string; onChangeText: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? COUNTRIES.filter(c => c.name.toLowerCase().includes(q) || c.dial.includes(q)) : COUNTRIES;
  }, [query]);

  return (
    <View style={s.field}>
      <Text style={s.label}>Phone number</Text>
      <View style={s.inputBox}>
        <TouchableOpacity style={s.codeBtn} onPress={() => setOpen(true)} activeOpacity={0.7} accessibilityLabel="Choose country code">
          <Text style={s.flag}>{flagOf(country.iso)}</Text>
          <Text style={s.code}>{country.dial}</Text>
          <MaterialIcons name="arrow-drop-down" size={18} color={AUTH.muted} />
        </TouchableOpacity>
        <TextInput
          style={s.input} placeholder="788 123 456" placeholderTextColor={AUTH.muted} keyboardType="phone-pad"
          value={value} onChangeText={v => onChangeText(v.replace(/[^\d\s]/g, ''))} accessibilityLabel="Phone number"
        />
      </View>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={s.sheetBackdrop}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>Select country</Text>
              <TouchableOpacity onPress={() => setOpen(false)} accessibilityLabel="Close">
                <MaterialIcons name="close" size={20} color={AUTH.text} />
              </TouchableOpacity>
            </View>
            <View style={[s.inputBox, { marginBottom: 8 }]}>
              <MaterialIcons name="search" size={18} color={AUTH.muted} />
              <TextInput style={[s.input, { marginLeft: 6 }]} placeholder="Search country or code" placeholderTextColor={AUTH.muted} value={query} onChangeText={setQuery} autoCorrect={false} />
            </View>
            <FlatList
              data={list}
              keyExtractor={c => c.iso}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.countryRow} onPress={() => { onCountry(item); setOpen(false); setQuery(''); }} activeOpacity={0.6}>
                  <Text style={s.flag}>{flagOf(item.iso)}</Text>
                  <Text style={s.countryName}>{item.name}</Text>
                  <Text style={s.countryDial}>{item.dial}</Text>
                  {item.iso === country.iso && <MaterialIcons name="check" size={16} color={AUTH.primary} style={{ marginLeft: 8 }} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Buttons ───────────────────────────────────────────────────────────────
export function PrimaryButton({ label, onPress, loading }: { label: string; onPress: () => void; loading?: boolean }) {
  return (
    <TouchableOpacity style={s.primary} onPress={onPress} disabled={loading} activeOpacity={0.85}>
      {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryText}>{label}</Text>}
    </TouchableOpacity>
  );
}

export function ModeTabs({ mode, onChange }: { mode: 'email' | 'phone'; onChange: (m: 'email' | 'phone') => void }) {
  return (
    <View style={s.tabs}>
      {(['email', 'phone'] as const).map(m => (
        <TouchableOpacity key={m} style={[s.tab, mode === m && s.tabActive]} onPress={() => onChange(m)} activeOpacity={0.8}>
          <Text style={[s.tabText, mode === m && s.tabTextActive]}>{m === 'email' ? 'Email' : 'Phone'}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function OrDivider() {
  return (
    <View style={s.or}>
      <View style={s.orLine} />
      <Text style={s.orText}>OR</Text>
      <View style={s.orLine} />
    </View>
  );
}

export type Social = 'google' | 'facebook' | 'apple';

/** Official multicolor Google "G". */
export function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

/** The full-width "Continue with Google" button. */
export function SocialRow({ items, onPress, busy }: { items: Social[]; onPress: (s: Social) => void; busy?: Social | null }) {
  useEffect(() => { void preloadGoogle().catch(() => {}); }, []);
  return (
    <View style={s.socialRow}>
      {items.map(it => (
        <TouchableOpacity key={it} style={s.social} onPress={() => onPress(it)} disabled={!!busy} activeOpacity={0.7} accessibilityLabel="Continue with Google">
          {busy === it ? <ActivityIndicator size="small" color={AUTH.primary} /> : <GoogleIcon size={20} />}
          <Text style={s.socialText}>Continue with Google</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function FooterLink({ prompt, link, onPress }: { prompt: string; link: string; onPress: () => void }) {
  return (
    <View style={s.footer}>
      <Text style={s.footerText}>{prompt} </Text>
      <TouchableOpacity onPress={onPress}>
        <Text style={s.footerLink}>{link}</Text>
      </TouchableOpacity>
    </View>
  );
}

export const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(auth)/login'));

export function errorMessage(e: unknown, fallback = 'Please try again.'): string {
  const err = e as { response?: { data?: { message?: string | string[] } }; message?: string };
  const msg = err?.response?.data?.message ?? err?.message;
  return Array.isArray(msg) ? msg.join('\n') : msg || fallback;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: AUTH.bg },
  header: { paddingHorizontal: 16, paddingTop: 8 },
  back: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: AUTH.line, alignItems: 'center', justifyContent: 'center', backgroundColor: AUTH.bg },
  scroll: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24, flexGrow: 1 },

  brand: { alignItems: 'center', marginBottom: 22 },
  title: { fontSize: 20, fontWeight: '700', color: AUTH.text, marginTop: 12 },
  subtitle: { fontSize: 12, color: AUTH.textSoft, marginTop: 2, textAlign: 'center' },

  field: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '500', color: AUTH.text, marginBottom: 5 },
  inputBox: { flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 22, borderWidth: 1, borderColor: AUTH.inputBorder, backgroundColor: AUTH.inputBg, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 13, color: AUTH.text, fontFamily: 'Poppins_400Regular', paddingVertical: 0 },

  iconBtn: { marginLeft: 10 },

  meter: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -4, marginBottom: 12, paddingHorizontal: 4 },
  meterBar: { flex: 1, height: 4, borderRadius: 2 },
  meterLabel: { fontSize: 11, fontWeight: '600', marginLeft: 6, minWidth: 54, textAlign: 'right' },

  codeBtn: { flexDirection: 'row', alignItems: 'center', paddingRight: 8, marginRight: 8, borderRightWidth: 1, borderRightColor: AUTH.inputBorder },
  flag: { fontSize: 16, marginRight: 4 },
  code: { fontSize: 13, color: AUTH.text, fontWeight: '500' },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(14,42,51,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: AUTH.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, maxHeight: '75%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: AUTH.text },
  countryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: AUTH.line },
  countryName: { flex: 1, fontSize: 13, color: AUTH.text, marginLeft: 6 },
  countryDial: { fontSize: 13, color: AUTH.textSoft },

  primary: {
    height: 46, borderRadius: 23, backgroundColor: AUTH.primary, alignItems: 'center', justifyContent: 'center', marginTop: 6,
    shadowColor: AUTH.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 5,
  },
  primaryText: { fontSize: 14, fontWeight: '600', color: '#fff' },

  tabs: { flexDirection: 'row', backgroundColor: AUTH.inputBg, borderRadius: 22, padding: 3, marginBottom: 14 },
  tab: { flex: 1, height: 34, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: AUTH.primary },
  tabText: { fontSize: 12, fontWeight: '600', color: AUTH.textSoft },
  tabTextActive: { color: '#FFFFFF' },

  or: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 18 },
  orLine: { flex: 1, height: 1, backgroundColor: AUTH.line },
  orText: { fontSize: 11, color: AUTH.muted },

  socialRow: { gap: 12 },
  social: { height: 48, borderRadius: 24, borderWidth: 1, borderColor: AUTH.line, backgroundColor: AUTH.bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  socialText: { fontSize: 14, fontWeight: '600', color: AUTH.text },

  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 'auto', paddingTop: 22 },
  footerText: { fontSize: 12, color: AUTH.textSoft },
  footerLink: { fontSize: 12, fontWeight: '700', color: AUTH.primary },
});
