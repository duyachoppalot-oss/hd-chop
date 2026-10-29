import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { FamilyPart, FamilySpan } from '@/lib/api';
import { titleCase } from '@/lib/bike';
import { conditionLabel, yearRange } from '@/lib/format';
import { font, inked, Palette, space, useStyles } from '@/lib/theme';
import { Badge } from './ui';

type Model = { code: string; name: string | null };
type Range = { key: string; years: string; models: Model[] };

// Spans grouped by their exact year range ("2000–2009": FLHR, FLHT...), oldest
// first, so a card shows the ranges and the codes under each fold away.
function ranges(spans: FamilySpan[]): Range[] {
  const out = new Map<string, Range & { a: number; b: number }>();
  for (const s of spans) {
    const key = `${s.year_start}-${s.year_end}`;
    if (!out.has(key)) out.set(key, { key, a: s.year_start, b: s.year_end, years: yearRange(s.year_start, s.year_end), models: [] });
    const r = out.get(key)!;
    if (!r.models.some((m) => m.code === s.model_code)) r.models.push({ code: s.model_code, name: s.model_name ?? s.family ?? null });
  }
  return [...out.values()].sort((x, y) => x.a - y.a || x.b - y.b).map(({ key, years, models }) => ({ key, years, models }));
}

// A part in a family search: number, name, conditions, then one row per year
// range (tap to open the models that take it in those years), and the numbers it replaces.
export function FamilyPartCard({ part }: { part: FamilyPart }) {
  const s = useStyles(styles);
  const all = ranges(part.spans);
  const models = new Set(part.spans.map((sp) => sp.model_code)).size;
  const inferred = part.condition_source === 'inferred';
  return (
    <View style={s.card}>
      {/* The head opens the part page; the range toggles sit outside it (no button in a button). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Part ${part.oem}${part.description ? `, ${part.description}` : ''}, fits ${models} model${models === 1 ? '' : 's'}, ${yearRange(part.year_start, part.year_end)}`}
        onPress={() => router.push(`/part/${encodeURIComponent(part.oem)}`)}
        style={({ pressed }) => [s.headTap, pressed && s.pressed]}
      >
        <View style={s.top}>
          <Text style={s.oem} selectable>
            {part.oem}
          </Text>
          <Text style={s.chev}>›</Text>
        </View>
        {part.description ? <Text style={s.desc}>{part.description}</Text> : null}
        {part.conditions.length ? (
          <View style={s.badges}>
            {part.conditions.map((c) => (
              <Badge key={c} label={conditionLabel(c)} light={inferred} />
            ))}
            {inferred ? <Text style={s.inferred}>inferred</Text> : null}
          </View>
        ) : null}
      </Pressable>
      <View style={s.table}>
        <View style={s.head}>
          <Text style={s.headText}>Years</Text>
          <Text style={s.headText}>Models</Text>
        </View>
        {all.map((r) => (
          <RangeRow key={r.key} range={r} />
        ))}
      </View>
      {part.replaces.length ? <Text style={s.replaces}>Replaces {part.replaces.join(', ')}</Text> : null}
    </View>
  );
}

// Collapsed: years + model count; tap opens code + name rows. One model: shown
// on the line itself, nothing to open.
function RangeRow({ range }: { range: Range }) {
  const s = useStyles(styles);
  const [open, setOpen] = useState(false);
  if (range.models.length === 1) {
    const m = range.models[0];
    return (
      <View accessibilityLabel={`${range.years}, ${m.code}${m.name ? ` ${m.name}` : ''}`} style={s.range}>
        <Text style={s.toggle}> </Text>
        <Text style={s.rangeYears}>{range.years}</Text>
        <Text style={s.single} numberOfLines={1}>
          <Text style={s.code}>{m.code}</Text>
          {m.name ? ` ${titleCase(m.name)}` : ''}
        </Text>
      </View>
    );
  }
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${range.years}, ${range.models.length} models`}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [s.range, pressed && s.pressed]}
      >
        <Text style={s.toggle}>{open ? '▾' : '▸'}</Text>
        <Text style={s.rangeYears}>{range.years}</Text>
        <Text style={s.count}>{range.models.length} models</Text>
      </Pressable>
      {open
        ? range.models.map((m) => (
            <View key={m.code} style={s.row}>
              <Text style={s.code}>{m.code}</Text>
              <Text style={s.name} numberOfLines={1}>
                {m.name ? titleCase(m.name) : ''}
              </Text>
            </View>
          ))
        : null}
    </View>
  );
}

const styles = (color: Palette) =>
  StyleSheet.create({
    card: {
      ...inked(color),
      backgroundColor: color.panel,
      padding: space.lg,
      marginBottom: space.lg,
      marginRight: 4,
      gap: space.sm,
    },
    headTap: { gap: space.sm, borderRadius: 6 },
    pressed: { backgroundColor: color.panelHi },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    oem: {
      fontFamily: font.typeBold,
      fontSize: 26,
      color: color.accent,
      letterSpacing: 1,
    },
    chev: { fontFamily: font.sign, fontSize: 34, color: color.accent },
    desc: { fontFamily: font.body, fontSize: 18, color: color.text },
    badges: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: space.sm,
    },
    inferred: { fontFamily: font.type, fontSize: 13, color: color.muted },
    table: { marginTop: space.xs },
    head: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderBottomWidth: 2,
      borderBottomColor: color.line,
      paddingBottom: 2,
    },
    headText: {
      fontFamily: font.banner,
      fontSize: 12,
      color: color.accent,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    range: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      minHeight: 48,
      borderBottomWidth: 1,
      borderBottomColor: color.rule,
    },
    toggle: { fontFamily: font.typeBold, fontSize: 18, color: color.accent, width: 18, textAlign: 'center' },
    rangeYears: { fontFamily: font.typeBold, fontSize: 18, color: color.text },
    count: { fontFamily: font.type, fontSize: 15, color: color.muted, flex: 1, textAlign: 'right' },
    single: { fontFamily: font.body, fontSize: 15, color: color.text, flex: 1, textAlign: 'right' },
    row: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: space.sm,
      minHeight: 34,
      paddingVertical: 6,
      paddingLeft: 26,
      borderBottomWidth: 1,
      borderBottomColor: color.rule,
    },
    code: { fontFamily: font.typeBold, fontSize: 15, color: color.accent, minWidth: 80 },
    name: { fontFamily: font.body, fontSize: 15, color: color.text, flex: 1 },
    replaces: { fontFamily: font.type, fontSize: 14, color: color.muted },
  });
