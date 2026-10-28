/**
 * The building blocks the Expo screens use (View, Text, TouchableOpacity, ScrollView, TextInput, …),
 * written for the browser. They accept the same props and the same style objects, so a screen can be
 * ported by changing its imports. Everything here is plain React + DOM.
 */
import React, {
  forwardRef, useCallback, useEffect, useLayoutEffect, useImperativeHandle, useRef, useState,
  type CSSProperties, type ReactNode,
} from 'react';
import { flatten, toCss, type RNStyle } from './style';
import { useSafeAreaInsets, useThemeColorMeta } from './platform';

// ── View ─────────────────────────────────────────────────────────────────────────────────────────────
export type AccessibilityActionEvent = { nativeEvent: { actionName: string } };

/** React Native's accessibility props as ARIA attributes. */
export function aria(p: Pick<ViewProps, 'accessibilityLabel' | 'accessibilityRole' | 'accessibilityState' | 'accessibilityValue' | 'accessibilityLiveRegion' | 'accessibilityHint'>) {
  const s = p.accessibilityState;
  const v = p.accessibilityValue;
  return {
    'aria-label': p.accessibilityLabel,
    'aria-description': p.accessibilityHint,
    'aria-selected': s?.selected,
    'aria-disabled': s?.disabled,
    'aria-checked': s?.checked,
    'aria-expanded': s?.expanded,
    'aria-busy': s?.busy,
    'aria-valuetext': v?.text,
    'aria-valuenow': v?.now,
    'aria-valuemin': v?.min,
    'aria-valuemax': v?.max,
    'aria-live': p.accessibilityLiveRegion === 'none' ? 'off' : p.accessibilityLiveRegion,
  } as const;
}

const VIEW_BASE: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'stretch', alignContent: 'flex-start',
  flexShrink: 0, position: 'relative', boxSizing: 'border-box', minWidth: 0, minHeight: 0, margin: 0, padding: 0,
};

export interface ViewProps {
  style?: RNStyle;
  children?: ReactNode;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  onLayout?: (e: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => void;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityRole?: string;
  accessible?: boolean;
  accessibilityState?: { selected?: boolean; disabled?: boolean; checked?: boolean | 'mixed'; expanded?: boolean; busy?: boolean };
  accessibilityValue?: { text?: string; now?: number; min?: number; max?: number };
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
  accessibilityHint?: string;
  accessibilityActions?: ReadonlyArray<{ name: string; label?: string }>;
  onAccessibilityAction?: (e: AccessibilityActionEvent) => void;
  importantForAccessibility?: string;
  accessibilityElementsHidden?: boolean;
  onStartShouldSetResponder?: unknown;
  onMoveShouldSetResponder?: unknown;
  hitSlop?: unknown;
  collapsable?: boolean;
  id?: string;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onTouchStart?: React.TouchEventHandler<HTMLDivElement>;
  onTouchMove?: React.TouchEventHandler<HTMLDivElement>;
  onTouchEnd?: React.TouchEventHandler<HTMLDivElement>;
}

function useLayoutReporter(onLayout: ViewProps['onLayout']) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cb = useRef(onLayout);
  cb.current = onLayout;
  useEffect(() => {
    const el = ref.current;
    if (!el || !onLayout) return;
    const report = () => cb.current?.({ nativeEvent: { layout: { x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } } });
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [!!onLayout]); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

export const View = forwardRef<HTMLDivElement, ViewProps>(function View(
  { style, children, pointerEvents, onLayout, testID, accessibilityLabel, accessibilityRole, accessibilityState, accessibilityValue, accessibilityLiveRegion, accessibilityHint, id, onClick, onTouchStart, onTouchMove, onTouchEnd }, forwarded,
) {
  const inner = useLayoutReporter(onLayout);
  const setRef = useCallback((el: HTMLDivElement | null) => {
    inner.current = el;
    if (typeof forwarded === 'function') forwarded(el); else if (forwarded) forwarded.current = el;
  }, [forwarded, inner]);
  const css: CSSProperties = { ...VIEW_BASE, ...toCss(style) };
  if (pointerEvents === 'none' || pointerEvents === 'box-none') css.pointerEvents = 'none';
  return (
    <div
      ref={setRef} id={id} style={css} data-testid={testID} role={accessibilityRole}
      {...aria({ accessibilityLabel, accessibilityState, accessibilityValue, accessibilityLiveRegion, accessibilityHint })}
      data-pe={pointerEvents === 'box-none' ? 'box-none' : undefined}
      onClick={onClick} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
    >
      {children}
    </div>
  );
});

// ── Text ─────────────────────────────────────────────────────────────────────────────────────────────
const InsideText = React.createContext(false);

export interface TextProps {
  style?: RNStyle;
  children?: ReactNode;
  numberOfLines?: number;
  onPress?: (e?: unknown) => void;
  testID?: string;
  selectable?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: string;
  adjustsFontSizeToFit?: boolean;
  ellipsizeMode?: string;
  allowFontScaling?: boolean;
}

/** adjustsFontSizeToFit: shrink (via --fit) until a one-line text no longer overflows its box, down to half size. */
function useFitToLine(ref: React.RefObject<HTMLSpanElement | null>, on: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    const fit = () => {
      el.style.removeProperty('--fit');
      let k = 1;
      // scrollWidth is a rounded number, so a text a fraction of a pixel too wide would pass; measure the text itself.
      const range = document.createRange();
      range.selectNodeContents(el);
      const over = () => range.getBoundingClientRect().width > el.getBoundingClientRect().width + 0.01;
      while (over() && k > 0.5) { k = Math.round((k - 0.03) * 100) / 100; el.style.setProperty('--fit', String(k)); }
    };
    fit();
    let gone = false;
    // The web font arrives after the first paint and makes the text wider, so measure again then.
    void document.fonts?.ready.then(() => { if (!gone) fit(); });
    document.fonts?.addEventListener('loadingdone', fit);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    if (el.parentElement) ro?.observe(el.parentElement);
    return () => { gone = true; ro?.disconnect(); document.fonts?.removeEventListener('loadingdone', fit); };
  });
}

export function Text({ style, children, numberOfLines, adjustsFontSizeToFit, onPress, testID, selectable, accessibilityLabel, accessibilityRole }: TextProps) {
  const nested = React.useContext(InsideText);
  const css: CSSProperties = {
    margin: 0, padding: 0, boxSizing: 'border-box', whiteSpace: 'pre-wrap', wordWrap: 'break-word', overflowWrap: 'break-word',
    textAlign: 'inherit', ...(nested ? {} : { fontFamily: 'Poppins, "Twemoji Country Flags", system-ui, sans-serif', fontSize: 'calc(14px * var(--fs, 1) * var(--fit, 1))' }),
    ...toCss(style),
  };
  if (numberOfLines === 1) { css.whiteSpace = 'nowrap'; css.overflow = 'hidden'; css.textOverflow = 'ellipsis'; css.display = css.display ?? 'block'; }
  else if (numberOfLines && numberOfLines > 1) {
    Object.assign(css, { display: '-webkit-box', WebkitLineClamp: numberOfLines, WebkitBoxOrient: 'vertical', overflow: 'hidden' });
  }
  if (selectable === false) css.userSelect = 'none';
  if (onPress) css.cursor = 'pointer';
  const ref = useRef<HTMLSpanElement>(null);
  useFitToLine(ref, !!adjustsFontSizeToFit && numberOfLines === 1 && !nested);
  return (
    <span
      ref={ref} style={css} data-testid={testID} aria-label={accessibilityLabel} role={onPress ? 'button' : accessibilityRole}
      onClick={onPress ? e => onPress(e) : undefined}
    >
      <InsideText.Provider value>{children}</InsideText.Provider>
    </span>
  );
}

// ── Touchables ───────────────────────────────────────────────────────────────────────────────────────
export interface PressableProps extends ViewProps {
  onPress?: (e?: unknown) => void;
  onLongPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  activeOpacity?: number;
  delayLongPress?: number;
  style?: RNStyle | ((s: { pressed: boolean }) => RNStyle);
}

function Touchable({ onPress, onLongPress, onPressIn, onPressOut, disabled, activeOpacity = 0.2, delayLongPress = 500, style, children, testID, accessibilityLabel, accessibilityRole, accessibilityState, accessibilityValue, accessibilityHint, pointerEvents, id }: PressableProps & { fade?: boolean }) {
  const [pressed, setPressed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const resolved = typeof style === 'function' ? style({ pressed }) : style;
  const css: CSSProperties = { ...VIEW_BASE, ...toCss(resolved), cursor: disabled ? 'default' : 'pointer', userSelect: 'none', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation', outline: 'none' };
  if (pressed && !disabled && typeof style !== 'function') css.opacity = activeOpacity;
  css.transition = css.transition ?? 'opacity 120ms ease';
  if (pointerEvents === 'none') css.pointerEvents = 'none';

  const down = () => {
    if (disabled) return;
    setPressed(true); onPressIn?.();
    longFired.current = false;
    if (onLongPress) timer.current = setTimeout(() => { longFired.current = true; onLongPress(); }, delayLongPress);
  };
  const up = () => { setPressed(false); onPressOut?.(); if (timer.current) clearTimeout(timer.current); };

  return (
    <div
      id={id} role={accessibilityRole ?? 'button'} tabIndex={disabled ? -1 : 0} data-testid={testID} style={css}
      {...aria({ accessibilityLabel, accessibilityState: { ...accessibilityState, disabled: disabled || accessibilityState?.disabled || undefined }, accessibilityValue, accessibilityHint })}
      onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
      onClick={e => { if (disabled || longFired.current) return; onPress?.(e); }}
      onKeyDown={e => { if (!disabled && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onPress?.(e); } }}
    >
      {children}
    </div>
  );
}
export const TouchableOpacity = (p: PressableProps) => <Touchable {...p} />;
export const TouchableWithoutFeedback = (p: PressableProps) => <Touchable {...p} activeOpacity={1} />;
export const Pressable = (p: PressableProps) => <Touchable {...p} activeOpacity={1} />;

// ── ScrollView / FlatList ───────────────────────────────────────────────────────────────────────────
export interface ScrollEvent {
  nativeEvent: {
    contentOffset: { x: number; y: number };
    contentSize: { width: number; height: number };
    layoutMeasurement: { width: number; height: number };
  };
}
export interface ScrollViewHandle {
  scrollTo: (o: { x?: number; y?: number; animated?: boolean }) => void;
  scrollToEnd: (o?: { animated?: boolean }) => void;
}
export interface ScrollViewProps {
  style?: RNStyle;
  contentContainerStyle?: RNStyle;
  horizontal?: boolean;
  pagingEnabled?: boolean;
  scrollEnabled?: boolean;
  showsVerticalScrollIndicator?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  onScroll?: (e: ScrollEvent) => void;
  scrollEventThrottle?: number;
  onContentSizeChange?: (w: number, h: number) => void;
  snapToInterval?: number;
  stickyHeaderIndices?: number[];
  decelerationRate?: string | number;
  onMomentumScrollEnd?: (e: ScrollEvent) => void;
  onScrollEndDrag?: (e: ScrollEvent) => void;
  onScrollBeginDrag?: (e: ScrollEvent) => void;
  onMomentumScrollBegin?: (e: ScrollEvent) => void;
  importantForAccessibility?: string;
  accessibilityElementsHidden?: boolean;
  keyboardShouldPersistTaps?: string;
  keyboardDismissMode?: string;
  bounces?: boolean;
  nestedScrollEnabled?: boolean;
  refreshControl?: ReactNode;
  children?: ReactNode;
  testID?: string;
  onLayout?: ViewProps['onLayout'];
}

export const ScrollView = forwardRef<ScrollViewHandle, ScrollViewProps>(function ScrollView(
  { style, contentContainerStyle, horizontal, pagingEnabled, scrollEnabled = true, showsVerticalScrollIndicator = true, showsHorizontalScrollIndicator = true, onScroll, onContentSizeChange, snapToInterval, stickyHeaderIndices, onMomentumScrollEnd, onScrollEndDrag, onScrollBeginDrag, children, testID, onLayout },
  ref,
) {
  const el = useRef<HTMLDivElement>(null);
  const layoutRef = useLayoutReporter(onLayout);
  useImperativeHandle(ref, () => ({
    scrollTo: ({ x, y, animated = true }) => el.current?.scrollTo({ left: x, top: y, behavior: animated ? 'smooth' : 'auto' }),
    scrollToEnd: ({ animated = true } = {}) => el.current?.scrollTo({ left: horizontal ? el.current.scrollWidth : undefined, top: horizontal ? undefined : el.current.scrollHeight, behavior: animated ? 'smooth' : 'auto' }),
  }));
  const hideBar = horizontal ? !showsHorizontalScrollIndicator : !showsVerticalScrollIndicator;
  const css: CSSProperties = {
    ...VIEW_BASE, flexGrow: 1, flexShrink: 1, flexBasis: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain',
    flexDirection: horizontal ? 'row' : 'column',
    overflowX: horizontal && scrollEnabled ? 'auto' : 'hidden', overflowY: !horizontal && scrollEnabled ? 'auto' : 'hidden',
    ...(pagingEnabled ? { scrollSnapType: horizontal ? 'x mandatory' : 'y mandatory' } : {}),
    ...toCss(style),
  };
  const inner: CSSProperties = {
    ...VIEW_BASE, flexDirection: horizontal ? 'row' : 'column', flexShrink: 0,
    ...(horizontal ? { minHeight: '100%' } : { minWidth: '100%' }),
    ...toCss(contentContainerStyle),
  };
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragging = useRef(false);
  const snapshot = (): ScrollEvent => {
    const d = el.current!;
    return { nativeEvent: { contentOffset: { x: d.scrollLeft, y: d.scrollTop }, contentSize: { width: d.scrollWidth, height: d.scrollHeight }, layoutMeasurement: { width: d.clientWidth, height: d.clientHeight } } };
  };
  const needsHandler = !!(onScroll || snapToInterval || onMomentumScrollEnd);
  const handle = needsHandler ? () => {
    onScroll?.(snapshot());
    if (settle.current) clearTimeout(settle.current);
    // Scrolling has stopped when no scroll event arrives for a moment (and no finger is down).
    settle.current = setTimeout(() => {
      if (dragging.current) return;
      const d = el.current;
      if (!d) return;
      if (snapToInterval) {
        const pos = horizontal ? d.scrollLeft : d.scrollTop;
        const target = Math.round(pos / snapToInterval) * snapToInterval;
        if (Math.abs(target - pos) > 0.5) { d.scrollTo({ left: horizontal ? target : undefined, top: horizontal ? undefined : target, behavior: 'smooth' }); return; }
      }
      onMomentumScrollEnd?.(snapshot());
    }, 110);
  } : undefined;
  useEffect(() => {
    const d = el.current;
    if (!d || !onContentSizeChange) return;
    const ro = new ResizeObserver(() => onContentSizeChange(d.scrollWidth, d.scrollHeight));
    ro.observe(d.firstElementChild as Element);
    return () => ro.disconnect();
  }, [onContentSizeChange]);
  return (
    <div
      ref={node => { el.current = node; layoutRef.current = node; }} style={css} onScroll={handle} data-testid={testID}
      onPointerDown={onScrollBeginDrag || onScrollEndDrag || snapToInterval ? () => { dragging.current = true; onScrollBeginDrag?.(snapshot()); } : undefined}
      onPointerUp={onScrollBeginDrag || onScrollEndDrag || snapToInterval ? () => { dragging.current = false; onScrollEndDrag?.(snapshot()); handle?.(); } : undefined}
      onPointerCancel={snapToInterval ? () => { dragging.current = false; handle?.(); } : undefined}
      className={hideBar ? 'rn-hide-scrollbar' : undefined}
    >
      <div style={inner}>
        {stickyHeaderIndices?.length
          ? React.Children.toArray(children).map((child, i) => (stickyHeaderIndices.includes(i)
              ? <div key={i} style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', flexDirection: 'column' }}>{child}</div>
              : child))
          : children}
      </div>
    </div>
  );
});

export interface FlatListProps<T> extends Omit<ScrollViewProps, 'children'> {
  data: readonly T[] | null | undefined;
  renderItem: (info: { item: T; index: number }) => ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  ListHeaderComponent?: React.ComponentType | ReactNode;
  ListFooterComponent?: React.ComponentType | ReactNode;
  ListEmptyComponent?: React.ComponentType | ReactNode;
  ItemSeparatorComponent?: React.ComponentType;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
}
const asNode = (c: React.ComponentType | ReactNode | undefined) =>
  typeof c === 'function' ? React.createElement(c as React.ComponentType) : c ?? null;

export interface FlatListHandle extends ScrollViewHandle {
  scrollToIndex: (o: { index: number; animated?: boolean; viewPosition?: number }) => void;
  scrollToOffset: (o: { offset: number; animated?: boolean }) => void;
}

function FlatListInner<T>(
  { data, renderItem, keyExtractor, ListHeaderComponent, ListFooterComponent, ListEmptyComponent, ItemSeparatorComponent, onEndReached, onEndReachedThreshold = 0.5, onScroll, ...rest }: FlatListProps<T>,
  ref: React.ForwardedRef<FlatListHandle>,
) {
  const fired = useRef(false);
  const scroller = useRef<ScrollViewHandle>(null);
  const content = useRef<HTMLDivElement>(null);
  const items = data ?? [];
  useEffect(() => { fired.current = false; }, [items.length]);
  useImperativeHandle(ref, () => ({
    scrollTo: o => scroller.current?.scrollTo(o),
    scrollToEnd: o => scroller.current?.scrollToEnd(o),
    scrollToOffset: ({ offset, animated }) => scroller.current?.scrollTo(rest.horizontal ? { x: offset, animated } : { y: offset, animated }),
    scrollToIndex: ({ index, animated = true, viewPosition = 0 }) => {
      const host = content.current;
      if (!host) return;
      const header = ListHeaderComponent ? 1 : 0;
      const sep = ItemSeparatorComponent ? 2 : 1; // an item and its separator are siblings
      const node = host.children[header + index * sep + (ItemSeparatorComponent && index > 0 ? 1 : 0)] as HTMLElement | undefined;
      node?.scrollIntoView({ behavior: animated ? 'smooth' : 'auto', block: rest.horizontal ? 'nearest' : viewPosition === 0.5 ? 'center' : 'start', inline: rest.horizontal ? (viewPosition === 0.5 ? 'center' : 'start') : 'nearest' });
    },
  }));
  const handle = (e: ScrollEvent) => {
    onScroll?.(e);
    if (!onEndReached) return;
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const horizontal = rest.horizontal;
    const remaining = horizontal ? contentSize.width - contentOffset.x - layoutMeasurement.width : contentSize.height - contentOffset.y - layoutMeasurement.height;
    const viewport = horizontal ? layoutMeasurement.width : layoutMeasurement.height;
    if (remaining <= viewport * onEndReachedThreshold && !fired.current) { fired.current = true; onEndReached(); }
  };
  return (
    <ScrollView {...rest} ref={scroller} onScroll={handle}>
      <div ref={content} style={{ display: 'contents' }}>
        {asNode(ListHeaderComponent)}
        {items.length === 0 ? asNode(ListEmptyComponent) : items.map((item, index) => (
          <React.Fragment key={keyExtractor ? keyExtractor(item, index) : index}>
            {index > 0 && ItemSeparatorComponent ? <ItemSeparatorComponent /> : null}
            {renderItem({ item, index })}
          </React.Fragment>
        ))}
        {asNode(ListFooterComponent)}
      </div>
    </ScrollView>
  );
}
export const FlatList = forwardRef(FlatListInner) as <T>(p: FlatListProps<T> & { ref?: React.Ref<FlatListHandle> }) => React.ReactElement;
export type FlatList = FlatListHandle;

/** Placeholder: pull-to-refresh is added when the screens that use it are ported. */
export const RefreshControl = (_: { refreshing?: boolean; onRefresh?: () => void; tintColor?: string; colors?: string[] }) => null;

// ── TextInput ────────────────────────────────────────────────────────────────────────────────────────
export interface TextInputProps {
  value?: string;
  defaultValue?: string;
  onChangeText?: (t: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
  placeholder?: string;
  placeholderTextColor?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'number-pad' | 'email-address' | 'phone-pad' | 'url';
  multiline?: boolean;
  numberOfLines?: number;
  maxLength?: number;
  editable?: boolean;
  autoFocus?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  autoComplete?: string;
  returnKeyType?: string;
  selectTextOnFocus?: boolean;
  selectionColor?: string;
  textContentType?: string;
  cursorColor?: string;
  keyboardAppearance?: string;
  blurOnSubmit?: boolean;
  enterKeyHint?: string;
  style?: RNStyle;
  testID?: string;
  accessibilityLabel?: string;
}

const INPUT_MODE: Record<string, string> = { numeric: 'numeric', 'number-pad': 'numeric', 'decimal-pad': 'decimal', 'phone-pad': 'tel', 'email-address': 'email', url: 'url' };

export const TextInput = forwardRef<HTMLInputElement | HTMLTextAreaElement, TextInputProps>(function TextInput(
  { value, defaultValue, onChangeText, onFocus, onBlur, onSubmitEditing, placeholder, placeholderTextColor, secureTextEntry, keyboardType = 'default', multiline, numberOfLines, maxLength, editable = true, autoFocus, autoCapitalize, autoCorrect, autoComplete, selectTextOnFocus, selectionColor, cursorColor, style, testID, accessibilityLabel },
  ref,
) {
  const css: CSSProperties = {
    ...VIEW_BASE, flexShrink: 1, background: 'transparent', border: '0 solid transparent', outline: 'none', borderRadius: 0,
    fontFamily: 'Poppins, "Twemoji Country Flags", system-ui, sans-serif', fontSize: 14, color: '#000', resize: 'none', appearance: 'none', WebkitAppearance: 'none',
    ...toCss(style),
    ['--rn-placeholder' as string]: placeholderTextColor ?? '#9aa0a6',
    ...(selectionColor || cursorColor ? { caretColor: cursorColor ?? selectionColor } : {}),
  };
  const common = {
    ref: ref as never, style: css, className: 'rn-input', placeholder, maxLength, readOnly: !editable, autoFocus,
    autoCapitalize: autoCapitalize === 'none' ? 'off' : autoCapitalize, autoCorrect: autoCorrect === false ? 'off' : undefined, autoComplete,
    'data-testid': testID, 'aria-label': accessibilityLabel ?? placeholder,
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (selectTextOnFocus) e.currentTarget.select(); onFocus?.(); },
    onBlur: () => onBlur?.(),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChangeText?.(e.target.value),
    ...(value !== undefined ? { value } : { defaultValue }),
  };
  if (multiline) return <textarea {...common} rows={numberOfLines ?? 3} />;
  return (
    <input
      {...common}
      type={secureTextEntry ? 'password' : keyboardType === 'email-address' ? 'email' : 'text'}
      inputMode={INPUT_MODE[keyboardType] as never}
      onKeyDown={e => { if (e.key === 'Enter') onSubmitEditing?.(); }}
    />
  );
});

// ── Switch ───────────────────────────────────────────────────────────────────────────────────────────
export function Switch({ value, onValueChange, trackColor, thumbColor = '#fff', disabled, testID, accessibilityLabel, ios_backgroundColor }: {
  value: boolean; onValueChange?: (v: boolean) => void; trackColor?: { false?: string; true?: string }; thumbColor?: string; disabled?: boolean; testID?: string; accessibilityLabel?: string; ios_backgroundColor?: string;
}) {
  return (
    <div
      role="switch" aria-checked={value} aria-disabled={disabled} aria-label={accessibilityLabel} tabIndex={disabled ? -1 : 0} data-testid={testID}
      onClick={() => !disabled && onValueChange?.(!value)}
      onKeyDown={e => { if (!disabled && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); onValueChange?.(!value); } }}
      style={{ width: 51, height: 31, borderRadius: 16, padding: 2, boxSizing: 'border-box', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, flexShrink: 0,
        background: value ? trackColor?.true ?? '#34C759' : trackColor?.false ?? ios_backgroundColor ?? '#E5E5EA', transition: 'background 160ms ease', outline: 'none' }}
    >
      <div style={{ width: 27, height: 27, borderRadius: 14, background: thumbColor, boxShadow: '0 2px 4px rgba(0,0,0,0.25)', transform: `translateX(${value ? 20 : 0}px)`, transition: 'transform 160ms ease' }} />
    </div>
  );
}

// ── ActivityIndicator ────────────────────────────────────────────────────────────────────────────────
export function ActivityIndicator({ size = 'small', color = '#999', style }: { size?: 'small' | 'large' | number; color?: string; style?: RNStyle }) {
  const d = typeof size === 'number' ? size : size === 'large' ? 36 : 20;
  return (
    <div role="progressbar" style={{ ...VIEW_BASE, width: d, height: d, ...toCss(style) }}>
      <div className="rn-spinner" style={{ width: d, height: d, borderWidth: Math.max(2, d / 10), borderColor: `${color}33`, borderTopColor: color }} />
    </div>
  );
}

// ── Image ────────────────────────────────────────────────────────────────────────────────────────────
export function Image({ source, style, resizeMode, accessibilityLabel, testID, onLoad, onError }: {
  source: { uri: string } | string; style?: RNStyle; resizeMode?: 'cover' | 'contain' | 'stretch' | 'center'; accessibilityLabel?: string; testID?: string; onLoad?: () => void; onError?: () => void;
}) {
  const s = flatten(style);
  const fit = resizeMode ?? s.resizeMode ?? 'cover';
  return (
    <img
      src={typeof source === 'string' ? source : source.uri} alt={accessibilityLabel ?? ''} data-testid={testID} draggable={false}
      onLoad={onLoad} onError={onError}
      style={{ ...toCss(style), objectFit: fit === 'stretch' ? 'fill' : fit === 'center' ? 'none' : fit, display: 'block', flexShrink: 0 }}
    />
  );
}

// ── Safe area, status bar ───────────────────────────────────────────────────────────────────────────
export function SafeAreaView({ style, children, edges }: { style?: RNStyle; children?: ReactNode; edges?: ('top' | 'bottom' | 'left' | 'right')[] }) {
  const i = useSafeAreaInsets();
  const use = (e: 'top' | 'bottom' | 'left' | 'right') => !edges || edges.includes(e);
  return (
    <View style={[{ flex: 1 }, style, {
      paddingTop: (flatten(style).paddingTop ?? 0) + (use('top') ? i.top : 0),
      paddingBottom: (flatten(style).paddingBottom ?? 0) + (use('bottom') ? i.bottom : 0),
      paddingLeft: (flatten(style).paddingLeft ?? 0) + (use('left') ? i.left : 0),
      paddingRight: (flatten(style).paddingRight ?? 0) + (use('right') ? i.right : 0),
    }]}>
      {children}
    </View>
  );
}

export function StatusBar({ backgroundColor }: { barStyle?: string; backgroundColor?: string; translucent?: boolean; style?: string }) {
  useThemeColorMeta(backgroundColor);
  return null;
}

// A component and its instance type share a name, as on the phone: useRef<ScrollView>(null), useRef<TextInput>(null).
export type ScrollView = ScrollViewHandle;
export type TextInput = HTMLInputElement | HTMLTextAreaElement;
export type View = HTMLDivElement;
