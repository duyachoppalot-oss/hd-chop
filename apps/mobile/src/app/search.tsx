import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { bikeLabel, useBike } from '@/lib/bike';
import { specLines } from '@/lib/format';
import { font, inked, LINE, Palette, pushed, space, TAP, useStyles, useTheme } from '@/lib/theme';
import { Screen } from '@/components/Screen';
import { Chip, Footer, Heading, Section } from '@/components/ui';

// Words riders actually type; each resolves to a concept in part_concepts and
// returned parts on most of the five Phase 2 gate bikes (2026-10-24 check).
const QUICK = ['gas tank', 'blinkers', 'bags', 'kickstand', 'speedo', 'tail light', 'brake pads', 'air cleaner', 'handlebar', 'fuel cap', 'shocks', 'battery'];

export default function Search() {
  const { color } = useTheme();
  const s = useStyles(styles);
  const { bike } = useBike();
  const [q, setQ] = useState('');
  if (!bike) return <Redirect href="/" />;
  const spec = specLines(bike.specs ?? []);

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

      {spec.lines.length > 0 && (
        <View style={s.specs} accessibilityLabel={`Engine and transmission: ${spec.lines.join('; ')}`}>
          {spec.lines.map((l) => (
            <Text key={l} style={s.specLine}>{l}</Text>
          ))}
          {spec.note && <Text style={s.specNote}>{spec.note}</Text>}
        </View>
      )}

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
        style={({ pressed }) => [s.button, !q.trim() && s.buttonOff, pressed && pushed(color)]}
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

const styles = (color: Palette) => StyleSheet.create({
  bikeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  kicker: { fontFamily: font.banner, fontSize: 14, color: color.accent, letterSpacing: 1 },
  code: { fontFamily: font.type, fontSize: 16, color: color.muted, marginTop: 2 },
  specs: { marginTop: space.sm, paddingLeft: space.sm, borderLeftWidth: LINE, borderLeftColor: color.fill, gap: 2 },
  specLine: { fontFamily: font.type, fontSize: 17, color: color.text },
  specNote: { fontFamily: font.type, fontSize: 14, color: color.muted, fontStyle: 'italic' },
  change: { ...inked(color), minHeight: 48, justifyContent: 'center', paddingHorizontal: space.md, backgroundColor: color.panel },
  changeText: { fontFamily: font.sign, fontSize: 20, color: color.accent },
  input: {
    minHeight: TAP + 8,
    backgroundColor: color.panel,
    borderWidth: LINE,
    borderColor: color.line,
    borderRadius: 10,
    paddingHorizontal: space.lg,
    fontFamily: font.type,
    fontSize: 22,
    color: color.text,
  },
  button: { ...inked(color), minHeight: TAP, marginTop: space.md, marginRight: 4, backgroundColor: color.fill, alignItems: 'center', justifyContent: 'center' },
  buttonOff: { backgroundColor: color.accentDim, borderColor: color.accentDim, boxShadow: 'none' },
  buttonText: { fontFamily: font.sign, fontSize: 28, color: color.onFill, letterSpacing: 1.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
