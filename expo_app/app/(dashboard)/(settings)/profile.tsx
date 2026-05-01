import React, { useEffect, useState, useCallback } from 'react';
import {
  View, StyleSheet, StatusBar, ScrollView, ActivityIndicator,
  TouchableOpacity, Image, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { getMe, updateProfile, uploadProfileImage, ClientProfile } from '@/services/client-auth.service';
import ENV from '@/env';

export default function EditProfileScreen() {
  const theme = useAppTheme();
  const [profile, setProfile]     = useState<ClientProfile | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving,  setSaving]      = useState(false);
  const [uploading, setUploading] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [phone,     setPhone]     = useState('');
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await getMe();
      setProfile(p);
      setFirstName(p.firstName);
      setLastName(p.lastName ?? '');
      setPhone(p.phone);
    } catch { /* token refresh handles re-auth */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const avatarUri = localAvatar
    ? localAvatar
    : profile?.profileImage
      ? (profile.profileImage.startsWith('http')
          ? profile.profileImage
          : `${ENV.UPLOADS_URL}/${profile.profileImage}`)
      : null;

  const initials = profile
    ? `${profile.firstName[0]}${profile.lastName?.[0] ?? ''}`.toUpperCase()
    : '?';

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      Alert.alert('Upload Failed', e?.response?.data?.message || 'Could not upload image.');
      setLocalAvatar(null);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!firstName.trim()) {
      Alert.alert('Required', 'First name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() || undefined, phone: phone.trim() });
      Alert.alert('Saved', 'Your profile has been updated.');
      router.back();
    } catch (e: any) {
      Alert.alert('Save Failed', e?.response?.data?.message || 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[p.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />

      <View style={[p.topBar, { borderBottomColor: theme.border }]}>
        <TouchableOpacity style={p.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[p.topTitle, { color: theme.text }]}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} activeOpacity={0.7} style={p.saveBtn}>
          {saving
            ? <ActivityIndicator color={theme.primary} size="small" />
            : <Text style={[p.saveText, { color: theme.primary }]}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={p.loadingWrap}>
          <ActivityIndicator color={theme.primary} size="large" />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={p.scroll} showsVerticalScrollIndicator={false}>

            {/* Avatar */}
            <View style={p.avatarSection}>
              <TouchableOpacity onPress={handlePickImage} activeOpacity={0.8} style={[p.avatarWrap, { backgroundColor: theme.primaryBg }]}>
                {uploading ? (
                  <ActivityIndicator color={theme.primary} size="large" />
                ) : avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={p.avatarImg} />
                ) : (
                  <Text style={[p.avatarInitials, { color: theme.primary }]}>{initials}</Text>
                )}
                <View style={[p.cameraBadge, { backgroundColor: theme.primary }]}>
                  <MaterialIcons name="photo-camera" size={14} color="#fff" />
                </View>
              </TouchableOpacity>
              <Text style={[p.changePhotoText, { color: theme.textMuted }]}>Tap to change photo</Text>
            </View>

            {/* Fields */}
            <View style={[p.card, { backgroundColor: theme.surface }]}>
              <Text style={[p.cardTitle, { color: theme.textMuted }]}>PERSONAL INFO</Text>

              <Text style={[p.fieldLabel, { color: theme.textMuted }]}>First Name</Text>
              <View style={[p.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                <MaterialIcons name="person" size={18} color={theme.textMuted} style={{ marginRight: 10 }} />
                <TextInput
                  style={[p.input, { color: theme.text }]}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First name"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="words"
                />
              </View>

              <Text style={[p.fieldLabel, { color: theme.textMuted }]}>Last Name</Text>
              <View style={[p.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                <MaterialIcons name="person-outline" size={18} color={theme.textMuted} style={{ marginRight: 10 }} />
                <TextInput
                  style={[p.input, { color: theme.text }]}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last name (optional)"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="words"
                />
              </View>

              <Text style={[p.fieldLabel, { color: theme.textMuted }]}>Phone</Text>
              <View style={[p.inputRow, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                <MaterialIcons name="phone" size={18} color={theme.textMuted} style={{ marginRight: 10 }} />
                <TextInput
                  style={[p.input, { color: theme.text }]}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Phone number"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            {/* Read-only info */}
            <View style={[p.card, { backgroundColor: theme.surface }]}>
              <Text style={[p.cardTitle, { color: theme.textMuted }]}>ACCOUNT</Text>

              <View style={p.readRow}>
                <MaterialIcons name="email" size={18} color={theme.textMuted} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[p.readLabel, { color: theme.textMuted }]}>Email</Text>
                  <Text style={[p.readValue, { color: theme.text }]}>{profile?.email ?? '—'}</Text>
                </View>
                {profile?.isVerified && (
                  <MaterialIcons name="verified" size={18} color="#34d399" />
                )}
              </View>

              <View style={[p.divider, { backgroundColor: theme.border }]} />

              <View style={p.readRow}>
                <MaterialIcons name="calendar-today" size={18} color={theme.textMuted} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[p.readLabel, { color: theme.textMuted }]}>Member since</Text>
                  <Text style={[p.readValue, { color: theme.text }]}>
                    {profile ? new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[p.saveFullBtn, { backgroundColor: theme.buttonBg }]}
              onPress={handleSave}
              activeOpacity={0.85}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={p.saveFullText}>Save Changes</Text>
              }
            </TouchableOpacity>

          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const p = StyleSheet.create({
  safe:        { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  backBtn:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 17, fontWeight: '700' },
  saveBtn:  { width: 60, alignItems: 'flex-end', justifyContent: 'center', height: 44 },
  saveText: { fontSize: 16, fontWeight: '700' },

  scroll: { paddingBottom: 40 },

  avatarSection: { alignItems: 'center', paddingVertical: 28 },
  avatarWrap: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10, overflow: 'visible',
  },
  avatarImg:      { width: 96, height: 96, borderRadius: 48 },
  avatarInitials: { fontSize: 34, fontWeight: '800' },
  cameraBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  changePhotoText: { fontSize: 13 },

  card:      { marginHorizontal: 16, marginBottom: 16, borderRadius: 18, padding: 16 },
  cardTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 },

  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginLeft: 2 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, height: 50, marginBottom: 14,
  },
  input: { flex: 1, fontSize: 15, fontFamily: 'Poppins_400Regular' },

  readRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  readLabel:{ fontSize: 12, marginBottom: 2 },
  readValue:{ fontSize: 15, fontWeight: '500' },
  divider:  { height: 1, marginVertical: 4 },

  saveFullBtn: {
    marginHorizontal: 16, marginTop: 8, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', elevation: 4,
  },
  saveFullText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
