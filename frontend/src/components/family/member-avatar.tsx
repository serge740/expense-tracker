// Ported from expo_app/components/family/member-avatar.tsx
import React from 'react';
import { StyleSheet, View } from '@/rn';
import { Text } from '@/components/text';
import { colorFor, initialsOf } from '@/utils/family-format';

/** A coloured circle with a person's initials. The same person always has the same colour. */
export function MemberAvatar({ id, name, size = 38 }: { id: string; name: string; size?: number }) {
  return (
    <View accessibilityLabel={name} style={[s.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(id) }]}>
      <Text style={[s.text, { fontSize: Math.round(size * 0.36) }]}>{initialsOf(name)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#FFFFFF', fontWeight: '800' },
});
