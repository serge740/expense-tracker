import React from 'react';
import { Text } from 'react-native';
import { AppState } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NotificationProvider, useNotifications } from '@/context/notification-context';

const received: { cb: () => void }[] = [];
jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: (cb: () => void) => { received.push({ cb }); return { remove: jest.fn() }; },
}));
let live: (e: string, p: any) => void = () => {};
jest.mock('@/services/realtime', () => ({ connectRealtime: (cb: any) => { live = cb; return () => {}; } }));
jest.mock('@/utils/reminders', () => ({ requestReminderRefresh: jest.fn() }));
jest.mock('@/services/notification.service', () => ({ getNotifications: jest.fn(), markAllRead: jest.fn() }));

type Fn = jest.Mock<(...a: any[]) => Promise<any>>;
const svc = require('@/services/notification.service') as { getNotifications: Fn; markAllRead: Fn };

function Probe() {
  const { unread, clearUnread } = useNotifications();
  return (<><Text testID="n">{String(unread)}</Text><Text onPress={clearUnread}>clear</Text></>);
}
const mount = () => render(<NotificationProvider><Probe /></NotificationProvider>);

beforeEach(() => { jest.clearAllMocks(); received.length = 0; svc.getNotifications.mockResolvedValue({ unreadCount: 3 }); svc.markAllRead.mockResolvedValue(undefined); });
afterEach(cleanup);

describe('NotificationProvider', () => {
  test('loads the unread count when it starts', async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId('n').props.children).toBe('3'));
  });

  test('refreshes when a push arrives while the app is open', async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId('n').props.children).toBe('3'));
    svc.getNotifications.mockResolvedValue({ unreadCount: 4 });
    await act(async () => { received[0].cb(); });
    await waitFor(() => expect(screen.getByTestId('n').props.children).toBe('4'));
  });

  test('refreshes when the app comes back to the foreground', async () => {
    let onChange: (s: string) => void = () => {};
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: any) => { onChange = cb; return { remove: jest.fn() }; }) as any);
    await mount();
    await waitFor(() => expect(screen.getByTestId('n').props.children).toBe('3'));
    svc.getNotifications.mockResolvedValue({ unreadCount: 7 });
    await act(async () => { onChange('active'); });
    await waitFor(() => expect(screen.getByTestId('n').props.children).toBe('7'));
  });

  test('keeps the last count when the server cannot be reached', async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId('n').props.children).toBe('3'));
    svc.getNotifications.mockRejectedValue(new Error('offline'));
    await act(async () => { received[0].cb(); });
    expect(screen.getByTestId('n').props.children).toBe('3');
  });

  test('refreshes the moment the server reports a new notification over the live connection', async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId('n').props.children).toBe('3'));
    svc.getNotifications.mockResolvedValue({ unreadCount: 5 });
    await act(async () => { live('new-notification', { id: 'n1', type: 'transaction' }); });
    await waitFor(() => expect(screen.getByTestId('n').props.children).toBe('5'));
  });

  test('a reminder over the live connection also asks the popup to refresh', async () => {
    const { requestReminderRefresh } = require('@/utils/reminders') as { requestReminderRefresh: jest.Mock };
    await mount();
    await act(async () => { live('new-notification', { type: 'reminder' }); });
    expect(requestReminderRefresh).toHaveBeenCalledWith({ reset: false });
  });

  test('ignores other events', async () => {
    await mount();
    await waitFor(() => expect(svc.getNotifications).toHaveBeenCalledTimes(1));
    await act(async () => { live('something-else', {}); });
    expect(svc.getNotifications).toHaveBeenCalledTimes(1);
  });

  test('clearing sets it to zero at once and tells the server', async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId('n').props.children).toBe('3'));
    await fireEvent.press(screen.getByText('clear'));
    expect(screen.getByTestId('n').props.children).toBe('0');
    expect(svc.markAllRead).toHaveBeenCalledTimes(1);
  });
});
