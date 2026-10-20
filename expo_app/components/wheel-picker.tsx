import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityActionEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, TouchableOpacity, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/components/text';
import { useAppTheme } from '@/hooks/use-app-theme';

export const WHEEL_ITEM = 44;
const VISIBLE = 5;

/** A light selection tick; never throws (haptics are optional hardware). */
export function tick() {
  try { Haptics.selectionAsync().catch(() => {}); } catch { /* no haptics */ }
}

interface Props {
  items: string[];
  index: number;
  onChange: (index: number) => void;
  width: number;
  /** Screen-reader name, e.g. "Hour". */
  label: string;
}

/** One row. Only redraws when its own text, selection or colour changes. */
const WheelItem = React.memo(function WheelItem({ text, index, on, color, onPick }: {
  text: string; index: number; on: boolean; color: string; onPick: (i: number) => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.6} style={s.item} onPress={() => onPick(index)}>
      <Text style={[s.text, { color }, on && s.textOn]}>{text}</Text>
    </TouchableOpacity>
  );
});

/**
 * A snapping vertical wheel. The centre row is the selection.
 * `index` is the source of truth: when it changes from outside (quick picks, taps) the wheel scrolls there.
 */
export function WheelPicker({ items, index, onChange, width, label }: Props) {
  const theme = useAppTheme();
  const ref = useRef<ScrollView>(null);
  const height = WHEEL_ITEM * VISIBLE;
  const pad = (height - WHEEL_ITEM) / 2;

  const [active, setActive] = useState(index);
  const settled = useRef(index);          // last index reported to the parent
  const live = useRef(index);             // index currently under the centre line
  const quiet = useRef(false);            // true while we scroll programmatically (no ticks)
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quietTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clampIdx = useCallback((i: number) => Math.max(0, Math.min(items.length - 1, i)), [items.length]);

  const goTo = useCallback((i: number, animated: boolean) => {
    quiet.current = true;
    if (quietTimer.current) clearTimeout(quietTimer.current);
    quietTimer.current = setTimeout(() => { quiet.current = false; }, 450);
    ref.current?.scrollTo({ y: i * WHEEL_ITEM, animated });
  }, []);

  // Start in the right place.
  useEffect(() => {
    const id = requestAnimationFrame(() => goTo(index, false));
    return () => {
      cancelAnimationFrame(id);
      if (endTimer.current) clearTimeout(endTimer.current);
      if (quietTimer.current) clearTimeout(quietTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow changes made elsewhere.
  useEffect(() => {
    if (index !== settled.current) {
      settled.current = index;
      live.current = index;
      setActive(index);
      goTo(index, true);
    }
  }, [index, goTo]);

  const commit = useCallback((y: number) => {
    const i = clampIdx(Math.round(y / WHEEL_ITEM));
    live.current = i;
    setActive(i);
    if (i !== settled.current) { settled.current = i; onChange(i); }
    if (Math.abs(y - i * WHEEL_ITEM) > 1) goTo(i, true);
  }, [clampIdx, goTo, onChange]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = clampIdx(Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM));
    if (i !== live.current) {
      live.current = i;
      setActive(i);
      if (!quiet.current) tick();
    }
  };

  const pickItem = useCallback((i: number) => {
    settled.current = i; live.current = i; setActive(i);
    goTo(i, true);
    onChange(i);
  }, [goTo, onChange]);

  const step = (delta: number) => {
    const i = clampIdx(settled.current + delta);
    settled.current = i; live.current = i; setActive(i);
    goTo(i, true);
    onChange(i);
  };

  return (
    <View
      style={{ width, height }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: items[index] }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e: AccessibilityActionEvent) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
    >
      <View style={[s.band, { top: pad, backgroundColor: theme.primaryBg }]} pointerEvents="none" />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={onScroll}
        onScrollBeginDrag={() => { quiet.current = false; }}
        onScrollEndDrag={e => {
          const y = e.nativeEvent.contentOffset.y;
          if (endTimer.current) clearTimeout(endTimer.current);
          endTimer.current = setTimeout(() => commit(y), 160); // cancelled if momentum starts
        }}
        onMomentumScrollBegin={() => { if (endTimer.current) clearTimeout(endTimer.current); }}
        onMomentumScrollEnd={e => commit(e.nativeEvent.contentOffset.y)}
        contentContainerStyle={{ paddingVertical: pad }}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {items.map((text, i) => (
          <WheelItem key={i} text={text} index={i} on={i === active} onPick={pickItem} color={i === active ? theme.text : theme.textMuted} />
        ))}
      </ScrollView>
      <LinearGradient pointerEvents="none" colors={[theme.surface, `${theme.surface}00`]} style={[s.fade, { top: 0 }]} />
      <LinearGradient pointerEvents="none" colors={[`${theme.surface}00`, theme.surface]} style={[s.fade, { bottom: 0 }]} />
    </View>
  );
}

const s = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0, height: WHEEL_ITEM, borderRadius: 12 },
  item: { height: WHEEL_ITEM, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 19, fontWeight: '600' },
  textOn: { fontWeight: '700', transform: [{ scale: 1.08 }] },
  fade: { position: 'absolute', left: 0, right: 0, height: WHEEL_ITEM * 1.6 },
});
