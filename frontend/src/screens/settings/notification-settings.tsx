// Ported from expo_app/app/(dashboard)/(settings)/notification-settings.tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, TouchableOpacity, StyleSheet, View } from '@/rn';
import { MaterialIcons } from '@/rn';
import { router, useFocusEffect } from '@/router/router';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { usePreferences } from '@/context/preferences-context';
import {
  getNotificationPreferences, updateNotificationPreferences, sendTestPush, NotificationPreference,
} from '@/services/notification.service';
import { PushPanel, DeviceList, InstallPanel } from '@/components/push/push-panel';
import { SettingsScreen, Section, SectionTitle, Row, OptionBlock, Stepper, Hint, Chips } from '@/components/settings/ui';
import {
  NOTIFICATION_SOUNDS, NotificationSound, ensureNotificationPermission, scheduleLocalNotification,
} from '@/services/local-notifications';
import { useI18n } from '@/context/language-context';
import { clockToMinutes, minutesToClock } from '@/utils/reminders';

const STEP = 30;
const wrap = (m: number) => (m + 24 * 60) % (24 * 60);

export default function NotificationSettingsScreen() {
  const theme = useAppTheme();
  const { prefs, setPref, formatTime } = usePreferences();
  const { t } = useI18n();
  const [channels, setChannels] = useState<NotificationPreference | null>(null);
  useEffect(() => {
    getNotificationPreferences().then(setChannels).catch(() => { /* offline: keep empty state */ });
  }, []);

  const savePref = async (patch: Partial<NotificationPreference>) => {
    if (!channels) return;
    const prev = channels;
    setChannels({ ...channels, ...patch });
    try {
      await updateNotificationPreferences(patch);
    } catch {
      setChannels(prev);
      Alert.alert(t('common.error'), t('notif.updateFailed'));
    }
  };
  const toggleChannel = (key: keyof NotificationPreference, value: boolean) => savePref({ [key]: value });

  // Quiet hours live on the server (so they work while the app is closed): stored as "HH:MM".
  const quietStartMin = clockToMinutes(channels?.quietStart ?? '22:00');
  const quietEndMin = clockToMinutes(channels?.quietEnd ?? '07:00');
  const setQuiet = (key: 'quietStart' | 'quietEnd', minutes: number) => savePref({ [key]: minutesToClock(minutes) });

  const soundName = (id: NotificationSound) =>
    id === 'default' ? t('sound.system') : id === 'silent' ? t('sound.silent') : NOTIFICATION_SOUNDS.find(x => x.id === id)?.label ?? id;
  const soundLabel = soundName(prefs.notificationSound);

  // Local test notification: delivered by the OS, so it shows even if the app is closed.
  const testLocal = async (seconds: number) => {
    if (!(await ensureNotificationPermission())) {
      Alert.alert(t('notif.offTitle'), t('notif.offMsg'));
      return;
    }
    try {
      await scheduleLocalNotification({
        title: '🐇 Rabbit Tracker',
        body: seconds > 3
          ? t('notif.testBodyLater', { n: seconds, name: soundLabel })
          : t('notif.testBody', { name: soundLabel }),
        seconds,
        sound: prefs.notificationSound,
        vibrate: prefs.notificationVibrate,
      });
      if (seconds > 3) {
        Alert.alert(t('notif.scheduledTitle'), t('notif.scheduledMsg', { n: seconds }));
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('common.error'));
    }
  };

  const testPush = async () => {
    try {
      await sendTestPush('Test notification', 'Push notifications from Rabbit Tracker are working.');
      Alert.alert(t('notif.sentTitle'), t('notif.sentMsg'));
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.response?.data?.message || t('common.error'));
    }
  };

  const channelDisabled = !channels;

  return (
    <SettingsScreen
      title={t('row.notifications')}
      subtitle={t('notif.subtitle')}
      right={
        <TouchableOpacity
          style={[s.inbox, { backgroundColor: theme.primaryBg }]}
          onPress={() => router.push('/(dashboard)/(settings)/notifications')}
          activeOpacity={0.8}
        >
          <MaterialIcons name="inbox" size={15} color={theme.primary} />
          <Text style={[s.inboxText, { color: theme.primary }]}>{t('notif.inbox')}</Text>
        </TouchableOpacity>
      }
    >
      <SectionTitle title={t('push.section')} />
      <PushPanel />
      <DeviceList />
      <SectionTitle title={t('pwa.section')} />
      <InstallPanel />


      <Section title={t('section.channels')}>
        <Row icon="notifications-active" title={t('notif.push')} sub={t('notif.pushSub')}
             toggle={{ value: !!channels?.pushEnabled, onChange: v => toggleChannel('pushEnabled', v), disabled: channelDisabled }} />
        <Row icon="email" title={t('notif.email')} sub={t('notif.emailSub')}
             toggle={{ value: !!channels?.emailEnabled, onChange: v => toggleChannel('emailEnabled', v), disabled: channelDisabled }} />
        <Row icon="inbox" title={t('notif.inApp')} sub={t('notif.inAppSub')}
             toggle={{ value: !!channels?.inAppEnabled, onChange: v => toggleChannel('inAppEnabled', v), disabled: channelDisabled }} />
      </Section>

      <Section title={t('rem.section')}>
        <Row icon="notifications-active" title={t('rem.push')} sub={t('rem.pushSub')}
             toggle={{ value: !!channels?.remindersPush, onChange: v => toggleChannel('remindersPush', v), disabled: channelDisabled }} />
        <Row icon="email" title={t('rem.email')} sub={t('rem.emailSub')}
             toggle={{ value: !!channels?.remindersEmail, onChange: v => toggleChannel('remindersEmail', v), disabled: channelDisabled }} />
        <OptionBlock icon="timer" title={t('rem.limit')} sub={t('rem.limitSub')}>
          <Stepper label={String(channels?.dailyPushCap ?? 8)}
                   onMinus={() => channels && savePref({ dailyPushCap: Math.max(1, channels.dailyPushCap - 1) })}
                   onPlus={() => channels && savePref({ dailyPushCap: Math.min(50, channels.dailyPushCap + 1) })} />
        </OptionBlock>
        <Row icon="public" title={t('rem.tz')} sub={t('rem.tzSub', { zone: channels?.timezone ?? '…' })}
             badge={{ label: t('rem.tzAuto'), tone: 'ok' }} />
      </Section>
      <Hint>{t('rem.tzHint')}</Hint>

      <Section title={t('section.sound')}>
        <OptionBlock icon="music-note" title={t('notif.sound')} sub={t('notif.current', { name: soundLabel })}>
          <Chips<NotificationSound>
            value={prefs.notificationSound}
            onChange={v => setPref('notificationSound', v)}
            options={NOTIFICATION_SOUNDS.map(x => ({ label: soundName(x.id), value: x.id }))}
          />
        </OptionBlock>
        <Row icon="vibration" title={t('notif.vibrate')} sub={t('notif.vibrateSub')}
             toggle={{ value: prefs.notificationVibrate, onChange: v => setPref('notificationVibrate', v) }} />
        <Row icon="play-circle-outline" title={t('notif.preview')} sub={t('notif.previewSub')} onPress={() => testLocal(1)} />
      </Section>

      <Section title={t('section.money')}>
        <Row icon="swap-horiz" title={t('notif.tx')} sub={t('notif.txSub')}
             toggle={{ value: prefs.notifyTransactions, onChange: v => setPref('notifyTransactions', v) }} />
        <Row icon="pie-chart" title={t('notif.budget')} sub={t('notif.budgetSub')}
             toggle={{ value: prefs.notifyBudgets, onChange: v => setPref('notifyBudgets', v) }} />
        <Row icon="receipt-long" title={t('notif.bills')} sub={t('notif.billsSub')}
             toggle={{ value: prefs.notifyBills, onChange: v => setPref('notifyBills', v) }} />
      </Section>

      <Section title={t('section.schedule')}>
        <Row icon="event" title={t('notif.meetings')}
             sub={prefs.meetingReminder ? t('notif.meetingsOn', { n: prefs.meetingReminder }) : t('notif.meetingsOff')}
             toggle={{ value: prefs.notifyMeetings, onChange: v => setPref('notifyMeetings', v) }} />
        <Row icon="insights" title={t('notif.weekly')} sub={t('notif.weeklySub')}
             toggle={{ value: prefs.notifyWeeklySummary, onChange: v => setPref('notifyWeeklySummary', v) }} />
      </Section>

      <Section title={t('section.account')}>
        <Row icon="security" title={t('notif.security')} sub={t('notif.securitySub')}
             toggle={{ value: prefs.notifySecurity, onChange: v => setPref('notifySecurity', v) }} />
      </Section>

      <Section title={t('section.quiet')}>
        <Row icon="bedtime" title={t('notif.quiet')} sub={t('rem.quietSub')}
             toggle={{ value: !!channels?.quietEnabled, onChange: v => toggleChannel('quietEnabled', v), disabled: channelDisabled }} />
        {channels?.quietEnabled && (
          <OptionBlock icon="nights-stay" title={t('notif.schedule')} sub={`${formatTime(quietStartMin)} – ${formatTime(quietEndMin)}`}>
            <View style={s.stepRow}>
              <View style={{ flex: 1 }}>
                <Text style={[s.caption, { color: theme.textMuted }]}>{t('notif.from')}</Text>
                <Stepper label={formatTime(quietStartMin)}
                         onMinus={() => setQuiet('quietStart', wrap(quietStartMin - STEP))}
                         onPlus={() => setQuiet('quietStart', wrap(quietStartMin + STEP))} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.caption, { color: theme.textMuted }]}>{t('notif.to')}</Text>
                <Stepper label={formatTime(quietEndMin)}
                         onMinus={() => setQuiet('quietEnd', wrap(quietEndMin - STEP))}
                         onPlus={() => setQuiet('quietEnd', wrap(quietEndMin + STEP))} />
              </View>
            </View>
          </OptionBlock>
        )}
      </Section>
      <Hint>{t('rem.quietHint')}</Hint>

      <Section title={t('section.test')}>
        <Row icon="timer" title={t('notif.testClosed')} sub={t('notif.testClosedSub')}
             onPress={() => testLocal(10)} />
        <Row icon="cloud-upload" title={t('notif.testPush')} sub={t('notif.testPushSub')}
             onPress={testPush} />
      </Section>
      <Hint>{t('notif.hint')}</Hint>
    </SettingsScreen>
  );
}

const s = StyleSheet.create({
  inbox:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  inboxText: { fontSize: 11, fontWeight: '700' },
  stepRow:   { flexDirection: 'row', gap: 10 },
  caption:   { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginBottom: 5, marginLeft: 2 },
});
