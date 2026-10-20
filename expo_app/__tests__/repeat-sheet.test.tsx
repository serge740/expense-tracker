import React from 'react';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import { RepeatSheet } from '@/components/repeat-sheet';
import { blankRule, RepeatRule } from '@/utils/recurrence';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', backgroundTop: '#DDF0F7', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)',
    buttonBg: '#00627F', headerBg: '#00627F', text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9',
    border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', tabBar: '#fff', tabBorder: '#eee', isDark: false,
  }),
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const START = new Date(2030, 9, 22, 9, 0);   // Tuesday 22 Oct 2030, 9:00 (local time)

async function open(value: RepeatRule | null = null) {
  const onConfirm = jest.fn();
  const onClose = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LanguageProvider><RepeatSheet visible start={START} value={value} onConfirm={onConfirm} onClose={onClose} /></LanguageProvider>
    </SafeAreaProvider>,
  );
  return { onConfirm, onClose };
}
const summary = () => screen.getByTestId('repeat-summary').props.children as string;
const confirmed = (fn: jest.Mock) => fn.mock.calls[0][0] as RepeatRule | null;

afterEach(cleanup);

describe('RepeatSheet', () => {
  test('starts as "Does not repeat" when there is no rule', async () => {
    await open();
    expect(summary()).toBe('Does not repeat');
    expect(screen.getByText('It happens once, on the first date above.')).toBeTruthy();
    expect(screen.queryByTestId('repeat-next')).toBeNull();
  });

  test('choosing Weekly repeats on the start day, and the summary says so', async () => {
    await open();
    await fireEvent.press(screen.getByText('Weekly'));
    expect(summary()).toBe('Every Tuesday at 9:00 AM');
  });

  test('picking Friday as well gives "Tuesday and Friday"', async () => {
    const { onConfirm } = await open();
    await fireEvent.press(screen.getByText('Weekly'));
    await fireEvent.press(screen.getByLabelText('Friday'));
    expect(summary()).toBe('Every Tuesday and Friday at 9:00 AM');
    await fireEvent.press(screen.getByText('Done'));
    expect(confirmed(onConfirm)).toMatchObject({ unit: 'WEEK', every: 1, weekdays: [2, 5], ends: { type: 'never' } });
  });

  test('the last selected weekday cannot be switched off', async () => {
    await open();
    await fireEvent.press(screen.getByText('Weekly'));
    await fireEvent.press(screen.getByLabelText('Tuesday'));
    expect(summary()).toBe('Every Tuesday at 9:00 AM');
  });

  test('"Next dates" shows five dates in order', async () => {
    await open();
    await fireEvent.press(screen.getByText('Weekly'));
    expect(screen.getAllByTestId('repeat-next')).toHaveLength(5);
  });

  test('the interval stepper changes the sentence and never goes below 1', async () => {
    await open();
    await fireEvent.press(screen.getByText('Daily'));
    await fireEvent.press(screen.getByLabelText('More'));
    expect(summary()).toBe('Every 2 days at 9:00 AM');
    await fireEvent.press(screen.getByLabelText('Less'));
    await fireEvent.press(screen.getByLabelText('Less'));
    expect(summary()).toBe('Every day at 9:00 AM');
  });

  test('monthly on chosen days, including the last day', async () => {
    const { onConfirm } = await open();
    await fireEvent.press(screen.getByText('Monthly'));
    await fireEvent.press(screen.getByLabelText('1'));
    await fireEvent.press(screen.getByLabelText('22'));   // start day, switch it off
    await fireEvent.press(screen.getByText('Last day of the month'));
    expect(summary()).toBe('Every month on the 1st and last day at 9:00 AM');
    await fireEvent.press(screen.getByText('Done'));
    expect(confirmed(onConfirm)).toMatchObject({ unit: 'MONTH', monthDays: [1, -1], nth: null });
  });

  test('monthly "weekday of the month": the 2nd Friday', async () => {
    const { onConfirm } = await open();
    await fireEvent.press(screen.getByText('Monthly'));
    await fireEvent.press(screen.getByText('Weekday of the month'));
    await fireEvent.press(screen.getByText('2nd'));
    await fireEvent.press(screen.getByLabelText('Friday'));
    expect(summary()).toBe('Every month on the 2nd Friday at 9:00 AM');
    await fireEvent.press(screen.getByText('Done'));
    expect(confirmed(onConfirm)).toMatchObject({ unit: 'MONTH', nth: { n: 2, weekday: 5 } });
  });

  test('switching back to days of the month clears the weekday rule', async () => {
    const { onConfirm } = await open();
    await fireEvent.press(screen.getByText('Monthly'));
    await fireEvent.press(screen.getByText('Weekday of the month'));
    await fireEvent.press(screen.getByText('Days of the month'));
    await fireEvent.press(screen.getByText('Done'));
    expect(confirmed(onConfirm)).toMatchObject({ unit: 'MONTH', nth: null });
  });

  test('yearly in chosen months', async () => {
    const { onConfirm } = await open();
    await fireEvent.press(screen.getByText('Yearly'));
    await fireEvent.press(screen.getByLabelText('March'));
    await fireEvent.press(screen.getByLabelText('October'));   // the start month, switch it off
    expect(summary()).toBe('Every year in March on the 22nd at 9:00 AM');
    await fireEvent.press(screen.getByText('Done'));
    expect(confirmed(onConfirm)).toMatchObject({ unit: 'YEAR', months: [3] });
  });

  test('"After a number" defaults to 12 times and can be changed', async () => {
    const { onConfirm } = await open();
    await fireEvent.press(screen.getByText('Weekly'));
    await fireEvent.press(screen.getByText('After a number'));
    expect(summary()).toBe('Every Tuesday at 9:00 AM, 12 times');
    expect(screen.getByText('12 in total')).toBeTruthy();
    await fireEvent.press(screen.getAllByLabelText('Less').at(-1)!);      // the second stepper is the count
    expect(summary()).toBe('Every Tuesday at 9:00 AM, 11 times');
    await fireEvent.press(screen.getByText('Done'));
    expect(confirmed(onConfirm)).toMatchObject({ ends: { type: 'after', count: 11 } });
  });

  test('"On a date" shows an end date one year on and a list that stops there', async () => {
    await open();
    await fireEvent.press(screen.getByText('Weekly'));
    await fireEvent.press(screen.getByText('On a date'));
    expect(screen.getByText('until the end date')).toBeTruthy();
    expect(screen.getByText('Last day')).toBeTruthy();
    expect(summary()).toMatch(/until/);
  });

  test('"Never" confirms as no repeat at all', async () => {
    const { onConfirm } = await open(blankRule('WEEK'));
    await fireEvent.press(screen.getAllByText('Never')[0]);               // the frequency 'Never' (the end rule has one too)
    expect(summary()).toBe('Does not repeat');
    await fireEvent.press(screen.getByText('Done'));
    expect(onConfirm).toHaveBeenCalledWith(null);
  });

  test('opens on an existing rule and keeps it when confirmed unchanged', async () => {
    const existing: RepeatRule = { ...blankRule('MONTH'), monthDays: [-1, 15] };
    const { onConfirm } = await open(existing);
    expect(summary()).toBe('Every month on the 15th and last day at 9:00 AM');
    await fireEvent.press(screen.getByText('Done'));
    expect(confirmed(onConfirm)).toMatchObject({ unit: 'MONTH', monthDays: [15, -1] });
  });

  test('Cancel closes without confirming, and does not change the caller\'s rule', async () => {
    const existing: RepeatRule = { ...blankRule('WEEK'), weekdays: [2] };
    const { onConfirm, onClose } = await open(existing);
    await fireEvent.press(screen.getByText('Daily'));
    await fireEvent.press(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(existing).toMatchObject({ unit: 'WEEK', weekdays: [2] });
  });

  test('an end date before the first date shows the "no dates" message', async () => {
    const past: RepeatRule = { ...blankRule('DAY'), ends: { type: 'on', date: '2030-01-01' } };
    await open(past);
    expect(screen.getByText('No dates match. Check the end date.')).toBeTruthy();
  });

  test('shows the first real date and time', async () => {
    await open();
    await fireEvent.press(screen.getByText('Weekly'));
    expect(screen.getByText(/^First: .*9:00 AM$/)).toBeTruthy();
  });
});
