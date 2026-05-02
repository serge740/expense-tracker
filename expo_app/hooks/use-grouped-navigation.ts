import { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { usePathname, useSegments, router } from 'expo-router';

/**
 * Intercepts the Android hardware back button while inside a route group.
 * Any non-index screen in the group navigates back to the group's index
 * instead of the previous screen in the stack.
 *
 * @param groupSegment - The folder name of the group, e.g. '(settings)'
 * @param indexRoute   - Full route path to the group index, e.g. '/(dashboard)/(settings)'
 * @param onBackToIndex - Optional callback fired just before navigating to index
 */
export function useGroupedNavigation(
  groupSegment: string,
  indexRoute: string,
  onBackToIndex?: () => void,
) {
  const pathname = usePathname();
  const segments = useSegments() as string[];

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      const groupIdx = segments.indexOf(groupSegment);
      if (groupIdx === -1) return false;

      const afterGroup = segments.slice(groupIdx + 1);
      const isOnIndex =
        afterGroup.length === 0 ||
        (afterGroup.length === 1 && afterGroup[0] === 'index');

      if (!isOnIndex) {
        onBackToIndex?.();
        router.navigate(indexRoute as any);
        return true; // consume the back press
      }

      return false; // let default back handle it (leaves the group)
    });

    return () => handler.remove();
  }, [pathname, segments, groupSegment, indexRoute, onBackToIndex]);
}
