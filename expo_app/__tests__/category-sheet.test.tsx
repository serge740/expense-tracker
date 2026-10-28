import React from 'react';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LanguageProvider } from '@/context/language-context';
import { CategorySheet } from '@/components/category-sheet';
import type { MySubCategory } from '@/utils/category-search';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    background: '#EEF7FA', backgroundTop: '#DDF0F7', surface: '#FFFFFF', primary: '#00627F', primaryBg: 'rgba(0,98,127,0.08)',
    buttonBg: '#00627F', headerBg: '#00627F', text: '#0E2A33', textSecondary: '#5A7682', textMuted: '#9AB0B9',
    border: 'rgba(0,98,127,0.12)', income: '#22C55E', expense: '#EF4444', inputBg: '#F3F8FA', tabBar: '#fff', tabBorder: '#eee', isDark: false,
  }),
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const mine = (o: Partial<MySubCategory>): MySubCategory => ({
  id: 'm1', kind: 'EXPENSE', category: 'transport', name: 'Boda to market', usageCount: 3, lastUsedAt: '2030-01-01T00:00:00.000Z', ...o,
});

async function open(props: Partial<React.ComponentProps<typeof CategorySheet>> = {}) {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const onForget = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LanguageProvider>
        <CategorySheet visible kind="EXPENSE" category="food" subCategory={null} mine={[]} onSelect={onSelect} onClose={onClose} onForget={onForget} {...props} />
      </LanguageProvider>
    </SafeAreaProvider>,
  );
  return { onSelect, onClose, onForget };
}

afterEach(cleanup);

describe('CategorySheet: when the list of their own items is not usable', () => {
  test.each([['text from a web page', '<!doctype html><html></html>'], ['an error object', { statusCode: 404 }], ['nothing', null], ['nothing yet', undefined]])(
    'still opens and works with %s where the list should be', async (_name, bad) => {
      await open({ mine: bad as never });
      expect(screen.getByLabelText('Food')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Food'));
      expect(screen.getByLabelText('Groceries')).toBeTruthy();
    });
});

describe('CategorySheet: step 1, the categories', () => {
  test('shows all ten on one screen, with the renamed ones', async () => {
    await open();
    for (const name of ['Food', 'Transport', 'Bills', 'Shopping', 'Personal', 'Entertainment', 'Giving', 'Business', 'Finance', 'Other']) {
      expect(screen.getByLabelText(name)).toBeTruthy();
    }
    expect(screen.queryByLabelText('Groceries')).toBeNull();
    expect(screen.queryByLabelText('Family')).toBeNull();
  });

  test('income shows its own list', async () => {
    await open({ kind: 'INCOME', category: 'salary' });
    expect(screen.getByLabelText('Salary')).toBeTruthy();
    expect(screen.getByLabelText('Freelance')).toBeTruthy();
    expect(screen.queryByLabelText('Transport')).toBeNull();
  });

  test('tapping a category goes to step 2 with that category\'s group tabs', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText('Food'));
    expect(screen.getByText('Step 2 of 2 · What was it?')).toBeTruthy();
    expect(screen.getByText('Eating out')).toBeTruthy();   // a tab
    expect(screen.getByText('Groceries')).toBeTruthy();     // first tab's items
  });

  test('the search box finds a brand across all categories and picks it in one tap', async () => {
    const { onSelect } = await open();
    await fireEvent.changeText(screen.getByLabelText('Search anything: pizza, Netflix, school fees…'), 'netflix');
    await fireEvent.press(screen.getByText('Netflix'));
    expect(onSelect).toHaveBeenCalledWith('entertainment', 'Netflix');
  });

  test('"your frequent" shows the categories this person uses most', async () => {
    await open({ mine: [mine({ category: 'transport', usageCount: 9 })] });
    expect(screen.getByText('YOUR FREQUENT')).toBeTruthy();
  });
});

describe('CategorySheet: step 2, what was it', () => {
  test('tapping a suggestion picks it', async () => {
    const { onSelect } = await open();
    await fireEvent.press(screen.getByLabelText('Food'));
    await fireEvent.press(screen.getByLabelText('Groceries'));
    expect(onSelect).toHaveBeenCalledWith('food', 'Groceries');
  });

  test('another tab shows another group\'s items', async () => {
    const { onSelect } = await open();
    await fireEvent.press(screen.getByLabelText('Food'));
    await fireEvent.press(screen.getByText('Eating out'));
    await fireEvent.press(screen.getByLabelText('Pizza'));
    expect(onSelect).toHaveBeenCalledWith('food', 'Pizza');
  });

  test('typing something new offers to add it, and adding picks the cleaned name', async () => {
    const { onSelect } = await open({ category: 'transport', startOnSub: true });
    await fireEvent.changeText(screen.getByLabelText('Type your own subcategory'), '  Boda   to market ');
    expect(screen.getByText('Add “Boda to market”')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add “Boda to market”'));
    expect(onSelect).toHaveBeenCalledWith('transport', 'Boda to market');
  });

  test('typing a brand finds the item, and typing a built-in name says "Use" and keeps its spelling', async () => {
    const { onSelect } = await open({ category: 'transport', startOnSub: true });
    const box = screen.getByLabelText('Type your own subcategory');
    await fireEvent.changeText(box, 'bolt');
    expect(screen.getByLabelText('Ride app')).toBeTruthy();
    await fireEvent.changeText(box, 'ride APP');
    await fireEvent.press(screen.getByText('Use'));
    expect(onSelect).toHaveBeenCalledWith('transport', 'Ride app');
  });

  test('their own items are shown first, and Edit lets them remove one', async () => {
    const row = mine({});
    const { onForget } = await open({ category: 'transport', startOnSub: true, mine: [row] });
    expect(screen.getByText('YOURS')).toBeTruthy();
    expect(screen.getByLabelText('Boda to market')).toBeTruthy();
    await fireEvent.press(screen.getByText('Edit'));
    await fireEvent.press(screen.getByLabelText('Remove Boda to market from your list'));
    expect(onForget).toHaveBeenCalledWith(row);
  });

  test('another person\'s rows for the other kind do not show', async () => {
    await open({ category: 'gifts', startOnSub: true, mine: [mine({ category: 'gifts', kind: 'INCOME', name: 'Salary top-up' })] });
    expect(screen.queryByText('Salary top-up')).toBeNull();
  });

  test('"Continue without a subcategory" picks the category alone', async () => {
    const { onSelect } = await open({ category: 'shopping', startOnSub: true });
    await fireEvent.press(screen.getByText('Continue without a subcategory'));
    expect(onSelect).toHaveBeenCalledWith('shopping', null);
  });

  test('"Other" has no suggestions and invites them to type', async () => {
    await open({ category: 'other', startOnSub: true });
    expect(screen.getByText(/No suggestions for this one/)).toBeTruthy();
  });

  test('the back arrow returns to the categories', async () => {
    await open({ category: 'food', startOnSub: true });
    await fireEvent.press(screen.getByLabelText('Back to categories'));
    expect(screen.getByText('Choose category')).toBeTruthy();
  });
});
