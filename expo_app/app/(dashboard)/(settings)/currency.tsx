import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, StatusBar, FlatList, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/text';
import { CURRENCIES, Currency, useCurrency } from '@/context/currency-context';
import { FadeInView } from '@/components/fade-in-view';

export default function CurrencyScreen() {
  const theme = useAppTheme();
  const { currency, setCurrency } = useCurrency();
  const [search, setSearch] = useState('');

  const filtered = CURRENCIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelect = (c: Currency) => {
    setCurrency(c);
    setTimeout(() => router.back(), 200);
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.background} />

      <FadeInView delay={0} slideFrom="top" distance={12}>
        <View style={[s.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity style={[s.backBtn, { backgroundColor: theme.surface }]} onPress={() => router.back()} activeOpacity={0.7}>
            <MaterialIcons name="arrow-back" size={20} color={theme.text} />
          </TouchableOpacity>
          <Text style={[s.title, { color: theme.text }]}>Currency</Text>
          <View style={{ width: 40 }} />
        </View>
      </FadeInView>

      <FadeInView delay={60} slideFrom="bottom" distance={14}>
        <View style={[s.searchWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <MaterialIcons name="search" size={20} color={theme.textMuted} />
          <TextInput
            style={[s.searchInput, { color: theme.text }]}
            placeholder="Search currency…"
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}>
              <MaterialIcons name="close" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </FadeInView>

      <FlatList
        data={filtered}
        keyExtractor={item => item.code}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={[s.sep, { backgroundColor: theme.border }]} />}
        ListHeaderComponent={
          <Text style={[s.sectionLabel, { color: theme.textMuted }]}>
            {search ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}` : 'ALL CURRENCIES'}
          </Text>
        }
        renderItem={({ item }) => {
          const selected = item.code === currency.code;
          return (
            <TouchableOpacity
              style={[s.row, { backgroundColor: theme.surface, ...(selected && { backgroundColor: theme.primaryBg }) }]}
              activeOpacity={0.7}
              onPress={() => handleSelect(item)}
            >
              <Text style={s.flag}>{item.flag}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.name, { color: theme.text }]}>{item.name}</Text>
                <Text style={[s.code, { color: theme.textMuted }]}>{item.code}</Text>
              </View>
              <Text style={[s.symbol, { color: selected ? theme.primary : theme.textSecondary }]}>
                {item.symbol}
              </Text>
              {selected && (
                <MaterialIcons name="check-circle" size={20} color={theme.primary} style={{ marginLeft: 8 }} />
              )}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  backBtn:     { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: 18, fontWeight: '700' },
  searchWrap:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginTop: 16, marginBottom: 4, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, height: 48 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Poppins_400Regular' },
  list:        { paddingHorizontal: 20, paddingBottom: 32 },
  sectionLabel:{ fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 20, marginBottom: 10 },
  row:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, gap: 14 },
  flag:        { fontSize: 26, width: 36, textAlign: 'center' },
  name:        { fontSize: 15, fontWeight: '600', marginBottom: 1 },
  code:        { fontSize: 12 },
  symbol:      { fontSize: 16, fontWeight: '700' },
  sep:         { height: 1, marginHorizontal: 16 },
});
