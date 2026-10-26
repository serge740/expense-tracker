// One import for everything a ported screen used to take from 'react-native'.
export { StyleSheet, flatten, toCss, withOpacity } from './style';
export type { RNStyle } from './style';
export {
  View, Text, TouchableOpacity, TouchableWithoutFeedback, Pressable, ScrollView, FlatList, RefreshControl,
  TextInput, Switch, ActivityIndicator, Image, SafeAreaView, StatusBar,
} from './components';
export type { FlatListHandle } from './components';
export type { ViewProps, TextProps, ScrollViewHandle, ScrollEvent, TextInputProps, PressableProps, AccessibilityActionEvent } from './components';
export { Modal, Alert, AlertHost } from './overlay';
export {
  Platform, Dimensions, useWindowDimensions, useSafeAreaInsets, Haptics, Linking, Share, Clipboard, AppState, BackHandler,
} from './platform';
export { MaterialIcons } from './icons';
export { Animated, Easing } from './animated';
export { KeyboardAvoidingView, FadeInView } from './layout';

// Types and small helpers screens import from 'react-native' besides components.
import type { RNStyle } from './style';
import type { ScrollEvent } from './components';
export type StyleProp<_T = unknown> = RNStyle;
export type ViewStyle = Record<string, any>;
export type TextStyle = Record<string, any>;
export type ImageStyle = Record<string, any>;
export type LayoutChangeEvent = { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } };
export type NativeSyntheticEvent<T> = { nativeEvent: T };
export type NativeScrollEvent = ScrollEvent['nativeEvent'];
export { useColorScheme, LayoutAnimation, Keyboard } from './misc';
