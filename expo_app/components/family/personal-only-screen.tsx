import React, { type ComponentType } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useScope } from '@/context/scope-context';
import { PersonalOnlyNotice } from '@/components/family/scope-banner';

/**
 * Loans and debts, and scheduled transactions, belong to a person, not a family. Wrapping such a screen means that
 * while the person stands in a family it is not even built (so it asks the server for nothing) and a short notice with a
 * "Switch to Personal" button is shown instead. In Personal it is the very same screen as before.
 */
export function withPersonalOnly<P extends object>(Screen: ComponentType<P>): ComponentType<P> {
  function PersonalOnlyGate(props: P) {
    const { isFamily } = useScope();
    const theme = useAppTheme();
    if (!isFamily) return <Screen {...props} />;
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
        <PersonalOnlyNotice />
      </SafeAreaView>
    );
  }
  PersonalOnlyGate.displayName = `PersonalOnly(${Screen.displayName || Screen.name || 'Screen'})`;
  return PersonalOnlyGate;
}
