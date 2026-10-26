// Ported from expo_app/app/(dashboard)/(settings)/edit-profile.tsx
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, Image, TextInput, TextInputProps, Alert, KeyboardAvoidingView, Platform, StyleProp, ViewStyle } from '@/rn';
import { MaterialIcons } from '@/rn';
import * as ImagePicker from '@/lib/shims/expo-image-picker';
import { router } from '@/router/router';
import { useSettingsBack } from '@/hooks/use-settings-back';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { getMe, updateProfile, uploadProfileImage, ClientProfile } from '@/services/client-auth.service';
import { SettingsScreen, Section, Row, Badge, IconName } from '@/components/settings/ui';
import ENV from '@/env';
import { useI18n } from '@/context/language-context';

const isPlaceholderPhone = (p?: string) => !p || /^(google|apple|facebook)_/.test(p);

export default function EditProfileScreen() {
  const goBack = useSettingsBack();
  const theme = useAppTheme();
  const { t, formatDate } = useI18n();
  const [profile, setProfile]     = useState<ClientProfile | null>(null);
  const [saving, setSaving]       = useState(false);
  const [uploading, setUploading] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [phone,     setPhone]     = useState('');
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);

  useEffect(() => {
    getMe().then(p => {
      setProfile(p);
      setFirstName(p.firstName);
      setLastName(p.lastName ?? '');
      setPhone(isPlaceholderPhone(p.phone) ? '' : p.phone);
    }).catch(() => { /* token refresh handles re-auth */ });
  }, []);

  const avatarUri = localAvatar
    ?? (profile?.profileImage
      ? (profile.profileImage.startsWith('http') ? profile.profileImage : `${ENV.UPLOADS_URL}/${profile.profileImage}`)
      : null);
  const initials = profile ? `${profile.firstName[0] ?? ''}${profile.lastName?.[0] ?? ''}`.toUpperCase() : '';

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('edit.required'), t('edit.photoPermission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    setLocalAvatar(uri);
    setUploading(true);
    try {
      await uploadProfileImage(uri);
    } catch (e: any) {
      Alert.alert(t('edit.uploadFailed'), e?.response?.data?.message || t('edit.uploadFailed'));
      setLocalAvatar(null);
    } finally {
      setUploading(false);
    }
  };

  const phoneChanged = !!profile && phone.trim() !== (isPlaceholderPhone(profile.phone) ? '' : profile.phone);

  const handleSave = async () => {
    if (!firstName.trim()) return Alert.alert(t('edit.required'), t('edit.firstRequired'));
    const cleanPhone = phone.replace(/[\s()-]/g, '');
    if (cleanPhone && !/^\+\d{7,15}$/.test(cleanPhone)) {
      return Alert.alert(t('edit.invalidPhone'), t('edit.invalidPhoneMsg'));
    }
    setSaving(true);
    try {
      await updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        ...(cleanPhone ? { phone: cleanPhone } : {}),
      });
      goBack();
    } catch (e: any) {
      Alert.alert(t('edit.saveFailed'), e?.response?.data?.message || t('edit.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const saveButton = (
    <TouchableOpacity onPress={handleSave} disabled={saving || !profile} hitSlop={8}
                      style={[s.headerSave, { backgroundColor: theme.primaryBg }]}>
      {saving ? <ActivityIndicator color={theme.primary} size="small" /> : <Text style={[s.headerSaveText, { color: theme.primary }]}>{t('common.save')}</Text>}
    </TouchableOpacity>
  );

  if (!profile) {
    return (
      <SettingsScreen title={t('edit.title')}>
        <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
      </SettingsScreen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SettingsScreen title={t('edit.title')} subtitle={t('edit.subtitle')} right={saveButton}>
        {/* Avatar */}
        <View style={s.avatarSection}>
          <TouchableOpacity onPress={handlePickImage} activeOpacity={0.8} style={[s.avatar, { backgroundColor: theme.primaryBg }]}>
            {uploading ? (
              <ActivityIndicator color={theme.primary} />
            ) : avatarUri ? (
              <Image source={{ uri: avatarUri }} style={s.avatarImg} />
            ) : (
              <Text style={[s.initials, { color: theme.primary }]}>{initials}</Text>
            )}
            <View style={[s.camera, { backgroundColor: theme.primary, borderColor: theme.background }]}>
              <MaterialIcons name="photo-camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={[s.changePhoto, { color: theme.textMuted }]}>{t('edit.changePhoto')}</Text>
        </View>

        <Section title={t('section.personal')}>
          <View style={s.fields}>
            <View style={s.nameRow}>
              <Input label={t('edit.firstName')} icon="person" value={firstName} onChangeText={setFirstName}
                     placeholder={t('edit.firstName')} autoCapitalize="words" style={{ flex: 1 }} />
              <Input label={t('edit.lastName')} icon="person-outline" value={lastName} onChangeText={setLastName}
                     placeholder={t('edit.optional')} autoCapitalize="words" style={{ flex: 1 }} />
            </View>
            <Input
              label={t('edit.phone')}
              icon="phone"
              value={phone}
              onChangeText={setPhone}
              placeholder="+250 788 123 456"
              keyboardType="phone-pad"
              trailing={
                profile.phoneVerifiedAt && !phoneChanged
                  ? <Badge label={t('badge.verified')} tone="ok" />
                  : phone.trim() ? <Badge label={t(phoneChanged ? 'badge.willNeedVerify' : 'badge.notVerified')} tone="warn" /> : null
              }
            />
          </View>
        </Section>

        <Section title={t('section.account')}>
          <Row icon="email" title={t('edit.email')} sub={profile.email}
               badge={profile.emailVerifiedAt ? { label: t('badge.verified'), tone: 'ok' } : { label: t('badge.verify'), tone: 'warn' }}
               onPress={profile.emailVerifiedAt ? undefined : () => router.push('/(dashboard)/(settings)/verify')} />
          <Row icon="calendar-today" title={t('edit.memberSince')}
               value={formatDate(profile.createdAt, { month: 'short', year: 'numeric' })} />
        </Section>

        <TouchableOpacity style={[s.saveBtn, { backgroundColor: theme.buttonBg }]} onPress={handleSave} activeOpacity={0.85} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveText}>{t('edit.saveChanges')}</Text>}
        </TouchableOpacity>
      </SettingsScreen>
    </KeyboardAvoidingView>
  );
}

// ── Compact themed input ──────────────────────────────────────────────────
function Input({
  label, icon, trailing, style, ...props
}: Omit<TextInputProps, 'style'> & { label: string; icon: IconName; trailing?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useAppTheme();
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      <Text style={[s.label, { color: theme.textSecondary }]}>{label}</Text>
      <View style={[s.inputBox, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
        <MaterialIcons name={icon} size={15} color={theme.textMuted} style={{ marginRight: 8 }} />
        <TextInput style={[s.input, { color: theme.text }]} placeholderTextColor={theme.textMuted} autoCorrect={false} {...props} />
        {trailing}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  headerSave:     { paddingHorizontal: 14, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  headerSaveText: { fontSize: 12, fontWeight: '700' },

  avatarSection: { alignItems: 'center', paddingVertical: 10, marginBottom: 8 },
  avatar:        { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarImg:     { width: 72, height: 72, borderRadius: 36 },
  initials:      { fontSize: 24, fontWeight: '700' },
  camera:        { position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  changePhoto:   { fontSize: 11, marginTop: 6 },

  fields:  { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 2 },
  nameRow: { flexDirection: 'row', gap: 10 },
  label:   { fontSize: 11, fontWeight: '500', marginBottom: 4, marginLeft: 2 },
  inputBox:{ flexDirection: 'row', alignItems: 'center', height: 42, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  input:   { flex: 1, fontSize: 13, fontFamily: 'Poppins_400Regular', paddingVertical: 0 },

  saveBtn:  { height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  saveText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
});
