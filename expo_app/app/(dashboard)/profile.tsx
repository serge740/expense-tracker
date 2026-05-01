import React, { useEffect, useState } from 'react';
import {
  View, TouchableOpacity, StyleSheet, StatusBar,
  ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/components/text';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { logout, getMe, ClientProfile } from '@/services/client-auth.service';
import ENV from '@/env';

// ── Glass card wrapper ──────────────────────────────────────────────────────
function GlassCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <BlurView intensity={28} tint="dark" style={[styles.glassCard, style]}>
      <View style={styles.glassHighlight} />
      <View style={{ padding: 20 }}>{children}</View>
    </BlurView>
  );
}

// ── Auth method row ─────────────────────────────────────────────────────────
function AuthRow({
  icon, label, enabled,
}: { icon: string; label: string; enabled: boolean }) {
  return (
    <View style={styles.authRow}>
      <View style={[styles.authIconBox, { backgroundColor: enabled ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.06)' }]}>
        <MaterialIcons name={icon as any} size={18} color={enabled ? '#a78bfa' : '#6b7280'} />
      </View>
      <Text style={[styles.authLabel, { color: enabled ? '#e2e8f0' : '#6b7280' }]}>{label}</Text>
      <View style={[styles.pill, { backgroundColor: enabled ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.06)' }]}>
        <Text style={[styles.pillText, { color: enabled ? '#c4b5fd' : '#4b5563' }]}>
          {enabled ? 'Enabled' : 'Off'}
        </Text>
      </View>
    </View>
  );
}

// ── Info row ────────────────────────────────────────────────────────────────
function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <MaterialIcons name={icon as any} size={16} color="#8b5cf6" style={{ marginRight: 10 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: '936996911068-a2e2v1jjq9c7hmotp339l1spqe75g102.apps.googleusercontent.com',
      offlineAccess: true,
    });
    getMe()
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSignOut = async () => {
    try {
      const isGoogleSignedIn = await GoogleSignin.isSignedIn();
      if (isGoogleSignedIn) await GoogleSignin.signOut();
    } catch { /* Google session already expired */ }
    await logout();
    router.replace('/(auth)');
  };

  const initials = profile
    ? `${profile.firstName[0]}${profile.lastName?.[0] ?? ''}`.toUpperCase()
    : '?';

  const memberSince = profile
    ? new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  const fullName = profile
    ? `${profile.firstName}${profile.lastName ? ' ' + profile.lastName : ''}`
    : '—';

  const avatarUri = profile?.profileImage
    ? (profile.profileImage.startsWith('http') ? profile.profileImage : `${ENV.UPLOADS_URL}/${profile.profileImage}`)
    : null;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* ── Deep gradient background ── */}
      <LinearGradient
        colors={['#0f0c29', '#1a1040', '#2d1b69']}
        style={StyleSheet.absoluteFill}
      />

      {/* ── Decorative liquid blobs ── */}
      <View style={[styles.blob, styles.blob1]} />
      <View style={[styles.blob, styles.blob2]} />
      <View style={[styles.blob, styles.blob3]} />

      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >

          {/* ── Header ── */}
          <View style={styles.topRow}>
            <Text style={styles.screenTitle}>Profile</Text>
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => router.push('/(dashboard)/(settings)')}
            >
              <MaterialIcons name="settings" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>

          {/* ── Loading ── */}
          {loading && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color="#a78bfa" size="large" />
            </View>
          )}

          {/* ── Profile card ── */}
          {!loading && (
            <>
              <GlassCard style={{ marginBottom: 16 }}>
                <View style={styles.avatarRow}>
                  {/* Avatar ring */}
                  <LinearGradient
                    colors={['#8b5cf6', '#6366f1', '#3b82f6']}
                    style={styles.avatarRing}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <View style={styles.avatarInner}>
                      {avatarUri ? (
                        <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
                      ) : (
                        <Text style={styles.avatarInitials}>{initials}</Text>
                      )}
                    </View>
                  </LinearGradient>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.profileName}>{fullName}</Text>
                    <Text style={styles.profileEmail}>{profile?.email ?? '—'}</Text>
                    <Text style={styles.profilePhone}>{profile?.phone ?? '—'}</Text>

                    <View style={styles.badgeRow}>
                      {profile?.isVerified && (
                        <View style={styles.badge}>
                          <MaterialIcons name="verified" size={11} color="#34d399" />
                          <Text style={[styles.badgeText, { color: '#34d399' }]}>Verified</Text>
                        </View>
                      )}
                      {profile?.isActive && (
                        <View style={[styles.badge, { backgroundColor: 'rgba(99,102,241,0.2)', borderColor: 'rgba(99,102,241,0.3)' }]}>
                          <Text style={[styles.badgeText, { color: '#818cf8' }]}>Active</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </GlassCard>

              {/* ── Sign-in methods card ── */}
              <GlassCard style={{ marginBottom: 16 }}>
                <Text style={styles.cardTitle}>Sign-in Methods</Text>
                <AuthRow icon="fingerprint"  label="Fingerprint"      enabled={!!profile?.isBiometric} />
                <View style={styles.rowDivider} />
                <AuthRow icon="face"         label="Face Recognition" enabled={!!profile?.isFaceRecognition} />
                <View style={styles.rowDivider} />
                <AuthRow icon="language"     label="Google"           enabled={!!profile?.googleId} />
              </GlassCard>

              {/* ── Account info card ── */}
              <GlassCard style={{ marginBottom: 16 }}>
                <Text style={styles.cardTitle}>Account Details</Text>
                <InfoRow icon="email"        label="Email"        value={profile?.email ?? '—'} />
                <View style={styles.rowDivider} />
                <InfoRow icon="phone"        label="Phone"        value={profile?.phone ?? '—'} />
                <View style={styles.rowDivider} />
                <InfoRow icon="calendar-today" label="Member since" value={memberSince} />
              </GlassCard>

              {/* ── Sign out ── */}
              <BlurView intensity={24} tint="dark" style={styles.signOutGlass}>
                <View style={styles.glassHighlight} />
                <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.75}>
                  <LinearGradient
                    colors={['rgba(239,68,68,0.18)', 'rgba(220,38,38,0.08)']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                  <MaterialIcons name="logout" size={20} color="#f87171" />
                  <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
              </BlurView>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 8 },

  // ── Background blobs ───────────────────────────────────────────────────────
  blob: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.45,
  },
  blob1: {
    width: 280,
    height: 280,
    top: -60,
    right: -80,
    backgroundColor: '#6d28d9',
    opacity: 0.3,
  },
  blob2: {
    width: 200,
    height: 200,
    top: 220,
    left: -70,
    backgroundColor: '#2563eb',
    opacity: 0.2,
  },
  blob3: {
    width: 240,
    height: 240,
    bottom: 80,
    right: -60,
    backgroundColor: '#7c3aed',
    opacity: 0.2,
  },

  // ── Glass card ─────────────────────────────────────────────────────────────
  glassCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  glassHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },

  // ── Header ────────────────────────────────────────────────────────────────
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    marginBottom: 8,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },

  // ── Avatar ────────────────────────────────────────────────────────────────
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#1e1040',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 68, height: 68, borderRadius: 34 },
  avatarInitials: {
    fontSize: 26,
    fontWeight: '800',
    color: '#c4b5fd',
    letterSpacing: 1,
  },

  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 2,
  },
  profilePhone: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 10,
  },
  badgeRow: { flexDirection: 'row', gap: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(52,211,153,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.25)',
  },
  badgeText: { fontSize: 11, fontWeight: '700' },

  // ── Card title ────────────────────────────────────────────────────────────
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 16,
  },

  // ── Auth rows ─────────────────────────────────────────────────────────────
  authRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  authIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  pillText: { fontSize: 12, fontWeight: '600' },

  // ── Info rows ─────────────────────────────────────────────────────────────
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoLabel: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 1 },
  infoValue: { fontSize: 15, color: '#e2e8f0', fontWeight: '500' },

  rowDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginVertical: 12,
  },

  // ── Sign out ──────────────────────────────────────────────────────────────
  signOutGlass: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
    overflow: 'hidden',
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f87171',
  },
});
