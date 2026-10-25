import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Part } from '@/lib/api';
import { byFamily, byModel, conditionLabel } from '@/lib/format';
import { font, inked, Palette, pushed, space, useStyles } from '@/lib/theme';
import { Badge } from './ui';

const OTHER_SHOWN = 6;

// One part: newest number, conditions, years on the rider's model, other
// models that take the same part (codes of one named bike folded to
// "Road King ×7 1994–2006"), and the numbers it replaces.
export function PartCard({ part, model }: { part: Part; model: string }) {
  const s = useStyles(styles);
  const rows = byModel(part.spans);
  const own = rows.find((r) => r.model === model);
  const others = byFamily(part.spans.filter((sp) => sp.model_code !== model));
  const inferred = part.condition_source === 'inferred';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Part ${part.oem}${part.description ? `, ${part.description}` : ''}`}
      onPress={() => router.push(`/part/${encodeURIComponent(part.oem)}`)}
      style={({ pressed }) => [s.card, pressed && s.pressed]}
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
      {own ? (
        <Text style={s.own}>
          <Text style={s.ownModel}>{own.model} </Text>
          {own.years}
        </Text>
      ) : null}
      {others.length ? (
        <Text style={s.others}>
          Also fits{' '}
          {others
            .slice(0, OTHER_SHOWN)
            .map((r) => (r.kind === 'family' ? `${r.name} ×${r.models.length} ${r.years}` : `${r.model} ${r.years}`))
            .join(' · ')}
          {others.length > OTHER_SHOWN ? ` · +${others.length - OTHER_SHOWN} more` : ''}
        </Text>
      ) : null}
      {part.replaces.length ? <Text style={s.replaces}>Replaces {part.replaces.join(', ')}</Text> : null}
    </Pressable>
  );
}

const styles = (color: Palette) => StyleSheet.create({
  card: {
    ...inked(color),
    backgroundColor: color.panel,
    padding: space.lg,
    marginBottom: space.lg,
    marginRight: 4,
    gap: space.sm,
  },
  pressed: { ...pushed(color), backgroundColor: color.panelHi },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  oem: { fontFamily: font.typeBold, fontSize: 26, color: color.accent, letterSpacing: 1 },
  chev: { fontFamily: font.sign, fontSize: 34, color: color.accent },
  desc: { fontFamily: font.body, fontSize: 18, color: color.text },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  inferred: { fontFamily: font.type, fontSize: 13, color: color.muted },
  own: { fontFamily: font.type, fontSize: 17, color: color.text },
  ownModel: { fontFamily: font.typeBold, color: color.accent },
  others: { fontFamily: font.type, fontSize: 14, color: color.muted, lineHeight: 20 },
  replaces: { fontFamily: font.type, fontSize: 14, color: color.muted },
});
