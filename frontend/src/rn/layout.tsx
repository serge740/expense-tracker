import type { ReactNode } from 'react';
import { View } from './components';
import type { RNStyle } from './style';

/** The browser keeps the focused field visible on its own, so this only needs to be a plain container. */
export function KeyboardAvoidingView({ style, children, pointerEvents }: { style?: RNStyle; children?: ReactNode; behavior?: string; keyboardVerticalOffset?: number; pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only' }) {
  return <View style={style} pointerEvents={pointerEvents}>{children}</View>;
}

/**
 * Fades in and slides in once when it appears. Same props as the Expo app's FadeInView;
 * the movement is a CSS animation instead of Reanimated.
 */
export function FadeInView({
  children, delay = 0, duration = 420, slideFrom = 'bottom', distance = 22, style,
}: {
  children?: ReactNode; delay?: number; duration?: number; slideFrom?: 'bottom' | 'top' | 'left' | 'right' | 'none'; distance?: number; style?: RNStyle;
}) {
  const x = slideFrom === 'left' ? -distance : slideFrom === 'right' ? distance : 0;
  const y = slideFrom === 'bottom' ? distance : slideFrom === 'top' ? -distance : 0;
  return (
    <View
      style={[style, { animation: `rn-enter ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both`, ['--enter-x' as string]: `${x}px`, ['--enter-y' as string]: `${y}px` }]}
    >
      {children}
    </View>
  );
}
