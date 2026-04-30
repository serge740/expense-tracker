import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';

export default function ProfileScreen() {
  const theme = useAppTheme();
  const [name, setName]   = useState('Alex Johnson');
  const [email, setEmail] = useState('alex.johnson@email.com');
  const [phone, setPhone] = useState('+1 555 000 1234');

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity style={[styles.backButton, { backgroundColor: theme.surface }]} activeOpacity={0.7} onPress={() => router.back()}>
              <MaterialIcons name="arrow-back" size={22} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Edit Profile</Text>
            <View style={{ width: 44 }} />
          </View>

          {/* Avatar */}
          <View style={styles.avatarSection}>
            <View style={[styles.avatarContainer, { backgroundColor: theme.primary }]}>
              <MaterialIcons name="person" size={52} color="#FFFFFF" />
            </View>
            <TouchableOpacity style={[styles.editAvatarButton, { backgroundColor: theme.primary, borderColor: theme.background }]} activeOpacity={0.8}>
              <MaterialIcons name="camera-alt" size={16} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={[styles.avatarName, { color: theme.text }]}>{name || 'Your Name'}</Text>
            <Text style={[styles.avatarEmail, { color: theme.textSecondary }]}>{email || 'your@email.com'}</Text>
          </View>

          {[
            { label: 'Full Name',     value: name,  setter: setName,  icon: 'person' as const, keyboard: 'default' as const,       capitalize: 'words' as const },
            { label: 'Email Address', value: email, setter: setEmail, icon: 'email' as const,  keyboard: 'email-address' as const, capitalize: 'none' as const  },
            { label: 'Phone Number',  value: phone, setter: setPhone, icon: 'phone' as const,  keyboard: 'phone-pad' as const,     capitalize: 'none' as const  },
          ].map(f => (
            <View key={f.label} style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>{f.label}</Text>
              <View style={[styles.inputContainer, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
                <MaterialIcons name={f.icon} size={20} color={theme.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={f.value}
                  onChangeText={f.setter}
                  placeholder={f.label}
                  placeholderTextColor={theme.textMuted}
                  keyboardType={f.keyboard}
                  autoCapitalize={f.capitalize}
                  autoCorrect={false}
                />
              </View>
            </View>
          ))}

          <TouchableOpacity style={[styles.saveButton, { backgroundColor: theme.primary }]} activeOpacity={0.8} onPress={() => router.back()}>
            <Text style={styles.saveButtonText}>Save Changes</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, marginBottom: 8 },
  backButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  avatarSection: { alignItems: 'center', marginTop: 24, marginBottom: 36 },
  avatarContainer: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#2D336B', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45, shadowRadius: 16, elevation: 8,
  },
  editAvatarButton: {
    position: 'absolute', top: 68, right: '32%',
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  avatarName: { fontSize: 20, fontWeight: '700', marginTop: 16 },
  avatarEmail: { fontSize: 14, marginTop: 4 },
  inputGroup: { marginBottom: 18 },
  inputLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, height: 54,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15 },
  saveButton: {
    borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 8,
    shadowColor: '#2D336B', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  saveButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
});
