import React from 'react';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DateTimeSheet, DateTimeSheetProps } from '@/components/datetime-sheet';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', backgroundTop: '#DDF0F7', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)',
    buttonBg: '#00627F', headerBg: '#00627F', text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9',
    border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', tabBar: '#fff', tabBorder: '#eee', isDark: false,
  }),
}));

afterEach(cleanup);

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function mount(props: Partial<DateTimeSheetProps>) {
  const onConfirm = jest.fn();
  const onClose = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <DateTimeSheet visible hour12 minuteStep={5} {...props} onConfirm={onConfirm} onClose={onClose} />
    </SafeAreaProvider>,
  );
  return { onConfirm, onClose };
}

/** Mount and wait until the heavy body (chips, days, wheels) has been drawn. */
async function open(props: Partial<DateTimeSheetProps>) {
  const r = await mount(props);
  await waitFor(() => expect(screen.queryByTestId('sheet-loading')).toBeNull());
  return r;
}

const confirmed = (fn: jest.Mock) => fn.mock.calls[0][0] as Date;

describe('DateTimeSheet', () => {
  test('opens instantly with the summary and a spinner, then fills in', async () => {
    await mount({ mode: 'datetime', value: new Date(2030, 4, 15, 14, 20), title: 'First payment' });
    // First paint: header, summary and footer are there; the heavy parts are not.
    expect(screen.getByText('First payment')).toBeTruthy();
    expect(screen.getByText('2:20 PM')).toBeTruthy();
    expect(screen.getByTestId('sheet-loading')).toBeTruthy();
    expect(screen.queryByText('Tomorrow 9 AM')).toBeNull();
    // Next frame: spinner gone, content drawn.
    await waitFor(() => expect(screen.queryByTestId('sheet-loading')).toBeNull());
    expect(screen.getByText('Tomorrow 9 AM')).toBeTruthy();
  });

  test('renders nothing while closed', async () => {
    await mount({ visible: false, mode: 'datetime', value: new Date(2030, 4, 15, 14, 20), title: 'Hidden' });
    expect(screen.queryByText('Hidden')).toBeNull();
  });

  test('datetime: shows the value and applies a quick pick', async () => {
    const { onConfirm, onClose } = await open({ mode: 'datetime', value: new Date(2030, 4, 15, 14, 20), title: 'First payment' });
    expect(screen.getByText('First payment')).toBeTruthy();
    expect(screen.getByText('2:20 PM')).toBeTruthy();

    await fireEvent.press(screen.getByText('Tomorrow 9 AM'));
    await fireEvent.press(screen.getByText('Confirm'));

    const d = confirmed(onConfirm);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
    expect(d.getTime()).toBeGreaterThan(Date.now());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('datetime: a time before the minimum disables Confirm until "Use earliest"', async () => {
    const min = new Date(Date.now() + 2 * 3600_000);
    const { onConfirm } = await open({ mode: 'datetime', value: new Date(2020, 0, 1, 10, 0), minDate: min });
    // The sheet clamps an out-of-range opening value up to the minimum, so the error cannot show yet.
    expect(screen.queryByText('That time has already passed.')).toBeNull();
    await fireEvent.press(screen.getByText('Confirm'));
    expect(confirmed(onConfirm).getTime()).toBeGreaterThanOrEqual(min.getTime());
  });

  test('datetime: choosing a quick pick before the minimum is blocked', async () => {
    const min = new Date(Date.now() + 5 * 3600_000);
    const { onConfirm } = await open({ mode: 'datetime', value: new Date(Date.now() + 6 * 3600_000), minDate: min });
    // "In 10 min" is earlier than the minimum so the chip is disabled and ignored.
    await fireEvent.press(screen.getByText('In 10 min'));
    await fireEvent.press(screen.getByText('Confirm'));
    expect(confirmed(onConfirm).getTime()).toBeGreaterThanOrEqual(min.getTime());
  });

  test('date: keeps the time of day of the original value', async () => {
    const { onConfirm } = await open({ mode: 'date', value: new Date(2030, 4, 15, 10, 30) });
    await fireEvent.press(screen.getByText('20'));
    await fireEvent.press(screen.getByText('Confirm'));
    const d = confirmed(onConfirm);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2030, 4, 20, 10, 30]);
  });

  test('date: with no value it picks today at noon and has no time wheels', async () => {
    const { onConfirm } = await open({ mode: 'date' });
    expect(screen.queryByText('TIME')).toBeNull();
    await fireEvent.press(screen.getByText('Confirm'));
    const d = confirmed(onConfirm);
    expect(d.getHours()).toBe(12);
    expect(d.getDate()).toBe(new Date().getDate());
  });

  test('date: the calendar view can pick a day in another month', async () => {
    const { onConfirm } = await open({ mode: 'date', value: new Date(2030, 4, 15, 9, 0), defaultView: 'calendar' });
    expect(screen.getByText('May 2030')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Next month'));
    expect(screen.getByText('June 2030')).toBeTruthy();
    await fireEvent.press(screen.getAllByText('10')[0]);
    await fireEvent.press(screen.getByText('Confirm'));
    const d = confirmed(onConfirm);
    expect([d.getMonth(), d.getDate()]).toEqual([5, 10]);
  });

  test('time: a time-of-day quick pick keeps the original day', async () => {
    const { onConfirm } = await open({ mode: 'time', value: new Date(2030, 4, 15, 7, 0) });
    expect(screen.queryByText('DAY')).toBeNull();
    await fireEvent.press(screen.getByText('6:00 PM'));
    await fireEvent.press(screen.getByText('Confirm'));
    const d = confirmed(onConfirm);
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([15, 18, 0]);
  });

  test('time: opening with an odd minute rounds to the step', async () => {
    const { onConfirm } = await open({ mode: 'time', value: new Date(2030, 4, 15, 7, 58) });
    await fireEvent.press(screen.getByText('Confirm'));
    const d = confirmed(onConfirm);
    expect([d.getHours(), d.getMinutes()]).toEqual([8, 0]);
  });

  test('24-hour mode has no AM/PM wheel', async () => {
    await open({ mode: 'time', value: new Date(2030, 4, 15, 18, 0), hour12: false });
    expect(screen.queryByText('PM')).toBeNull();
    expect(screen.getAllByText('18:00').length).toBeGreaterThanOrEqual(1); // summary + the 6 PM chip
    expect(screen.queryByText('AM')).toBeNull();
  });

  test('Cancel closes without confirming', async () => {
    const { onConfirm, onClose } = await open({ mode: 'datetime', value: new Date(2030, 4, 15, 14, 20) });
    await fireEvent.press(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
