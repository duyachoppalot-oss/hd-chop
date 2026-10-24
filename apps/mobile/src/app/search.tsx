import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { bikeLabel, useBike } from '@/lib/bike';
import { color, font, space, TAP } from '@/lib/theme';
import { Screen } from '@/components/Screen';
import { Chip, Footer, Heading, Section } from '@/components/ui';

// Words riders actually type; each resolves to a concept in part_concepts and
// returned parts on most of the five Phase 2 gate bikes (2026-10-24 check).
const QUICK = ['gas tank', 'blinkers', 'bags', 'kickstand', 'speedo', 'tail light', 'brake pads', 'air cleaner', 'handlebar', 'fuel cap', 'shocks', 'battery'];

export default function Search() {
  const { bike } = useBike();
  const [q, setQ] = useState('');
  if (!bike) return <Redirect href="/" />;

  const go = (words: string) => {
    const w = words.trim();
    if (w) router.push({ pathname: '/results', params: { q: w } });
  };

  return (
    <Screen>
      <View style={s.bikeRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>YOUR BIKE</Text>
          <Heading>{bikeLabel(bike)}</Heading>
          <Text style={s.code}>{bike.model_code}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.dismissTo('/')} style={s.change} hitSlop={8}>
          <Text style={s.changeText}>Change</Text>
        </Pressable>
      </View>

      <Section title="What do you need?" />
      <TextInput
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => go(q)}
        placeholder="gas tank, blinkers…"
        placeholderTextColor={color.faint}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={80}
        style={s.input}
        accessibilityLabel="Part name"
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => go(q)}
        disabled={!q.trim()}
        style={({ pressed }) => [s.button, !q.trim() && s.buttonOff, pressed && { opacity: 0.85 }]}
      >
        <Text style={s.buttonText}>Look it up</Text>
      </Pressable>

      <Section title="Common asks" />
      <View style={s.chips}>
        {QUICK.map((w) => (
          <Chip key={w} label={w} onPress={() => go(w)} />
        ))}
      </View>
      <Footer />
    </Screen>
  );
}

const s = StyleSheet.create({
  bikeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  kicker: { fontFamily: font.sign, fontSize: 13, color: color.gold, letterSpacing: 2 },
  code: { fontFamily: font.type, fontSize: 16, color: color.muted, marginTop: 2 },
  change: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md, borderWidth: 1, borderColor: color.goldDim, borderRadius: 4 },
  changeText: { fontFamily: font.sign, fontSize: 16, color: color.gold },
  input: {
    minHeight: TAP + 8,
    backgroundColor: color.panel,
    borderWidth: 2,
    borderColor: color.goldDim,
    borderRadius: 4,
    paddingHorizontal: space.lg,
    fontFamily: font.type,
    fontSize: 22,
    color: color.cream,
  },
  button: { minHeight: TAP, marginTop: space.md, backgroundColor: color.gold, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  buttonOff: { backgroundColor: color.goldDim },
  buttonText: { fontFamily: font.signBold, fontSize: 22, color: color.bg, letterSpacing: 1, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
