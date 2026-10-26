import { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, StyleSheet, MaterialIcons, FadeInView,
  useWindowDimensions, type RNStyle, type ScrollViewHandle,
} from '@/rn';
import { router } from '@/router/router';

const BRAND = '#00627F';
const INK = '#14172E';
const MUTED = '#8A8FA8';
const SOFT = '#F4F5FA';
const LINE = '#ECEEF4';
const GREEN = '#22A06B';
const RED = '#E5484D';

const ART_H = 340;

const SLIDES = [
  { id: 1, title: 'Manage your\nfinances easily', desc: 'Track expenses, scan receipts, and understand your spending — all in one place.' },
  { id: 2, title: 'Smart budget\ntracking', desc: 'Set monthly budgets per category and get notified before you overspend.' },
  { id: 3, title: 'Achieve your\nsavings goals', desc: 'Visualize spending trends and make better financial decisions every day.' },
];

// ── Illustration building blocks ──────────────────────────────────────────

function DashedPath({ d, w }: { d: string; w: number }) {
  return (
    <svg width={w} height={ART_H} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} aria-hidden="true">
      <path d={d} stroke="#D6D9E6" strokeWidth={1.4} strokeDasharray="5 6" fill="none" />
    </svg>
  );
}

function Dots({ style }: { style: RNStyle }) {
  return (
    <View style={[s.dotGrid, style]}>
      {Array.from({ length: 6 }).map((_, i) => <View key={i} style={s.dotGridItem} />)}
    </View>
  );
}

function IconTile({ name, size = 40, bg = SOFT, color = BRAND }: { name: string; size?: number; bg?: string; color?: string }) {
  return (
    <View style={[s.iconTile, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: bg }]}>
      <MaterialIcons name={name} size={size * 0.5} color={color} />
    </View>
  );
}

function Bubble({ name, style }: { name: string; style: RNStyle }) {
  return (
    <View style={[s.bubble, style]}>
      <MaterialIcons name={name} size={20} color={BRAND} />
    </View>
  );
}

// Slide 1 — overview card + recent transactions
function ArtTransactions({ w }: { w: number }) {
  const rows = [
    { icon: 'shopping-cart', name: 'Groceries', sub: 'Today, 9:40 AM', amt: '-$84.20', income: false },
    { icon: 'directions-car', name: 'Transport', sub: 'Today, 8:15 AM', amt: '-$12.50', income: false },
    { icon: 'local-cafe', name: 'Coffee', sub: 'Yesterday', amt: '-$4.80', income: false },
    { icon: 'work', name: 'Salary', sub: '1 Dec 2024', amt: '+$2,500', income: true },
  ];
  return (
    <View style={[s.art, { width: w }]}>
      <DashedPath w={w} d="M 20 40 C 120 -10, 260 10, 330 70 S 380 230, 300 300 S 120 330, 40 280" />
      <Dots style={{ top: 70, right: 46 }} />
      <Dots style={{ bottom: 20, left: 40 }} />
      <Bubble name="receipt-long" style={{ top: 22, right: 70 }} />
      <Bubble name="savings" style={{ bottom: 60, left: 18 }} />

      <View style={[s.card, { position: 'absolute', top: 40, left: 22, width: 190 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconTile name="account-balance-wallet" size={48} />
          <View style={s.chip}><Text style={s.chipText}>Dec</Text></View>
        </View>
        <Text style={[s.cardTitle, { marginTop: 12 }]}>Monthly Overview</Text>
        <Text style={s.cardSub}>December 2024</Text>
        <View style={s.divider} />
        <Text style={s.cardSub}>Spent: <Text style={s.cardStrong}>$1,240</Text></Text>
      </View>

      <View style={[s.card, { position: 'absolute', top: 110, right: 18, width: 200, paddingVertical: 10 }]}>
        {rows.map((r, i) => (
          <View key={r.name} style={[s.row, i > 0 && { borderTopWidth: 1, borderTopColor: LINE }]}>
            <IconTile name={r.icon} size={30} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.rowTitle}>{r.name}</Text>
              <Text style={s.rowSub}>{r.sub}</Text>
            </View>
            <Text style={[s.rowAmt, { color: r.income ? GREEN : INK }]}>{r.amt}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Slide 2 — category cards + budget progress
function ArtBudget({ w }: { w: number }) {
  return (
    <View style={[s.art, { width: w }]}>
      <DashedPath w={w} d="M 0 200 C 80 120, 160 260, 240 180 S 360 120, 390 170" />
      <Dots style={{ top: 30, left: 40 }} />
      <Dots style={{ bottom: 40, right: 30 }} />

      <View style={s.tilesRow}>
        <View style={[s.tile, { transform: [{ rotate: '-8deg' }, { translateY: 12 }] }]}>
          <IconTile name="restaurant" size={52} />
          <Text style={s.tileLabel}>Food</Text>
          <Text style={s.tileSub}>$320 / $400</Text>
        </View>
        <View style={[s.tile, s.tileActive]}>
          <IconTile name="shopping-bag" size={60} bg={BRAND} color="#fff" />
          <Text style={s.tileLabel}>Shopping</Text>
          <Text style={s.tileSub}>$288 / $400</Text>
        </View>
        <View style={[s.tile, { transform: [{ rotate: '8deg' }, { translateY: 12 }] }]}>
          <IconTile name="directions-bus" size={52} />
          <Text style={s.tileLabel}>Transport</Text>
          <Text style={s.tileSub}>$90 / $150</Text>
        </View>
      </View>

      <View style={[s.card, { position: 'absolute', bottom: 34, alignSelf: 'center', width: 250 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={s.cardTitle}>Shopping budget</Text>
          <Text style={[s.cardStrong, { color: BRAND }]}>72%</Text>
        </View>
        <View style={s.track}><View style={[s.fill, { width: '72%' }]} /></View>
        <Text style={s.cardSub}>$112 left this month</Text>
      </View>

      <View style={[s.toast, { top: 10, right: 16 }]}>
        <MaterialIcons name="notifications-active" size={14} color={RED} />
        <Text style={s.toastText}>Food budget at <Text style={s.cardStrong}>80%</Text></Text>
      </View>
    </View>
  );
}

// Slide 3 — savings goals list
function ArtGoals({ w }: { w: number }) {
  const goals = [
    { icon: 'laptop-mac', name: 'New Laptop', sub: '$900 of $1,500', pct: 60, active: false },
    { icon: 'flight', name: 'Summer Vacation', sub: '$2,100 of $3,000', pct: 70, active: true },
    { icon: 'shield', name: 'Emergency Fund', sub: '$400 of $2,000', pct: 20, active: false },
  ];
  return (
    <View style={[s.art, { width: w }]}>
      <DashedPath w={w} d="M 40 20 C 200 -10, 380 40, 350 140 S 180 230, 330 330" />
      <Dots style={{ top: 26, left: 30 }} />

      <View style={[s.toast, { top: 4, right: 24 }]}>
        <MaterialIcons name="trending-up" size={14} color={GREEN} />
        <Text style={s.toastText}>Saved <Text style={s.cardStrong}>$3,400</Text></Text>
      </View>

      <View style={{ position: 'absolute', top: 44, left: 0, right: 0, gap: 14, alignItems: 'center' }}>
        {goals.map(g => (
          <View key={g.name} style={[s.card, s.goal, g.active ? { width: w - 36, paddingVertical: 16 } : { width: w - 70 }]}>
            <IconTile name={g.icon} size={g.active ? 52 : 44} />
            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Text style={s.rowTitle}>{g.name}</Text>
              <Text style={s.rowSub}>{g.sub}</Text>
              <View style={[s.track, { marginVertical: 6 }]}><View style={[s.fill, { width: `${g.pct}%` }]} /></View>
            </View>
            <View style={[s.goalBtn, g.active && { backgroundColor: BRAND, borderColor: BRAND }]}>
              <MaterialIcons name="arrow-outward" size={14} color={g.active ? '#fff' : MUTED} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const ART = [ArtTransactions, ArtBudget, ArtGoals];

// ── Screen ────────────────────────────────────────────────────────────────

export default function Welcome() {
  const { width } = useWindowDimensions();
  const artW = Math.min(width, 380);
  const [idx, setIdx] = useState(0);
  const scrollRef = useRef<ScrollViewHandle>(null);
  const [artScale, setArtScale] = useState(1);

  // Grow the illustration to fill the space above the title (no big empty gap).
  const fitArt = (e: { nativeEvent: { layout: { height: number } } }) => {
    const { height } = e.nativeEvent.layout;
    setArtScale(Math.max(0.8, Math.min(height / ART_H, (width + 20) / artW, 1.5)));
  };

  const next = () => {
    if (idx < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (idx + 1) * width, animated: true });
      setIdx(idx + 1);
    }
  };
  const last = idx === SLIDES.length - 1;

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <ScrollView ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEnabled={false} style={{ flex: 1 }}>
        {SLIDES.map((sl, i) => {
          const Art = ART[i];
          return (
            <View key={sl.id} style={[s.slide, { width }]}>
              <View style={s.artWrap} onLayout={i === 0 ? fitArt : undefined}>
                <FadeInView delay={160} slideFrom="bottom" distance={24}>
                  <View style={{ transform: [{ scale: artScale }] }}>
                    <Art w={artW} />
                  </View>
                </FadeInView>
              </View>
              <Text style={s.slideTitle}>{sl.title}</Text>
              <Text style={s.slideDesc}>{sl.desc}</Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={s.footer}>
        <View style={s.dots}>
          {SLIDES.map((_, i) => <View key={i} style={[s.dot, i === idx && s.dotActive]} />)}
        </View>

        <FadeInView delay={380} slideFrom="bottom" distance={18} style={{ alignSelf: 'stretch' }}>
          <TouchableOpacity style={s.btn} activeOpacity={0.85} onPress={() => (last ? router.replace('/(auth)/login') : next())}>
            <Text style={s.btnText}>{last ? 'Get Started' : 'Next'}</Text>
          </TouchableOpacity>
        </FadeInView>

        <View style={s.signRow}>
          <Text style={s.signPrompt}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/login')} activeOpacity={0.7}>
            <Text style={s.signLink}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const shadow = { shadowColor: '#1B1F3B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 18, elevation: 6 };

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },

  slide: { alignItems: 'center', paddingHorizontal: 28 },
  artWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  art: { height: ART_H },

  slideTitle: { fontSize: 28, fontWeight: '700', color: INK, textAlign: 'center', lineHeight: 36, marginBottom: 10 },
  slideDesc: { fontSize: 14, lineHeight: 22, color: MUTED, textAlign: 'center', maxWidth: 300, marginBottom: 8 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, ...shadow },
  cardTitle: { fontSize: 13, fontWeight: '600', color: INK },
  cardSub: { fontSize: 11, color: MUTED },
  cardStrong: { fontSize: 12, fontWeight: '700', color: INK },
  divider: { height: 1, backgroundColor: LINE, marginVertical: 10 },
  chip: { backgroundColor: SOFT, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  chipText: { fontSize: 10, fontWeight: '600', color: BRAND },

  iconTile: { alignItems: 'center', justifyContent: 'center' },
  bubble: { position: 'absolute', width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow },
  dotGrid: { position: 'absolute', width: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  dotGridItem: { width: 5, height: 5, borderRadius: 3, backgroundColor: BRAND, opacity: 0.55 },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  rowTitle: { fontSize: 12, fontWeight: '600', color: INK },
  rowSub: { fontSize: 10, color: MUTED },
  rowAmt: { fontSize: 11, fontWeight: '700' },

  tilesRow: { position: 'absolute', top: 40, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 10 },
  tile: { width: 92, alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, paddingVertical: 14, ...shadow },
  tileActive: { width: 110, paddingVertical: 18, borderWidth: 2, borderColor: BRAND, zIndex: 1 },
  tileLabel: { fontSize: 12, fontWeight: '600', color: INK, marginTop: 10 },
  tileSub: { fontSize: 10, color: MUTED },

  track: { height: 6, borderRadius: 3, backgroundColor: SOFT, marginVertical: 10, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: BRAND },

  toast: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, ...shadow },
  toastText: { fontSize: 11, color: INK },

  goal: { flexDirection: 'row', alignItems: 'center' },
  goalBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center' },

  footer: { alignItems: 'center', paddingHorizontal: 28, paddingBottom: 8 },
  dots: { flexDirection: 'row', gap: 6, marginTop: 14, marginBottom: 22 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D9DCE6' },
  dotActive: { backgroundColor: BRAND },

  btn: {
    backgroundColor: BRAND, borderRadius: 999, paddingVertical: 17, alignSelf: 'stretch', alignItems: 'center',
    shadowColor: BRAND, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.28, shadowRadius: 16, elevation: 8,
  },
  btnText: { fontSize: 16, fontWeight: '600', color: '#fff' },

  signRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  signPrompt: { fontSize: 13, color: MUTED },
  signLink: { fontSize: 13, fontWeight: '700', color: BRAND },
});
