import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api, StockSize } from '@/lib/api';
import { useBike } from '@/lib/bike';
import { byFamily, conditionLabel, FitRow, ModelRow } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { font, Palette, space, TAP, useStyles, useTheme } from '@/lib/theme';
import { Screen } from '@/components/Screen';
import { Badge, ErrorBox, Footer, Heading, Loading, Section } from '@/components/ui';

// Part detail: newest number, the numbers it replaces, its stock size (cable
// length, rotor diameter, sprocket teeth) when documented, every model and year
// span it fits, split by conditions. Codes of the same named bike fold into
// one family row (Road King: FLHR, FLHRC, FLHRCI...) that opens to each code.
export default function PartDetail() {
  const s = useStyles(styles);
  const { oem } = useLocalSearchParams<{ oem: string }>();
  const { bike } = useBike();
  const { data, error, loading, retry } = useApi((sig) => api.part(oem, sig), [oem]);

  return (
    <Screen>
      <Stack.Screen options={{ title: data?.oem ?? oem }} />
      {loading && !data ? <Loading /> : error ? <ErrorBox message={error} onRetry={retry} /> : null}
      {data ? (
        <>
          {data.concept ? <Text style={s.kicker}>{data.concept.toUpperCase()}</Text> : null}
          <Text style={s.oem} selectable>
            {data.oem}
          </Text>
          {data.description ? <Heading style={{ fontSize: 24 }}>{data.description}</Heading> : null}
          {data.requested !== data.oem ? (
            <Text style={s.note}>
              {data.requested} has been replaced by {data.oem}.
            </Text>
          ) : null}

          {data.chain.length > 1 ? (
            <>
              <Section title="Replaces" />
              {data.chain
                .filter((c) => c.oem !== data.oem)
                .map((c) => (
                  <Text key={c.oem} style={s.line} selectable>
                    {c.oem}
                    {c.description && c.description !== data.description ? `  ${c.description}` : ''}
                  </Text>
                ))}
            </>
          ) : null}

          {data.stock_sizes?.length ? (
            <>
              <Section title="Stock size" />
              {data.stock_sizes.map((z) => (
                <SizeRow key={[z.oem, z.label, z.value, z.detail].join('|')} size={z} shown={data.oem} />
              ))}
            </>
          ) : null}

          {data.fits.map((f) => (
            <View key={f.conditions.join(',') || 'any'}>
              <Section
                title="Fits"
                right={
                  f.conditions.length ? (
                    <View style={s.badges}>
                      {f.conditions.map((c) => (
                        <Badge key={c} label={conditionLabel(c)} />
                      ))}
                    </View>
                  ) : undefined
                }
              />
              {byFamily(f.spans).map((r) =>
                r.kind === 'family' ? (
                  <FamilyRow key={r.key} row={r} mine={bike?.model_code} />
                ) : (
                  <CodeRow key={r.model} row={r} mine={bike?.model_code} />
                )
              )}
            </View>
          ))}
          {!data.fits.length ? <Text style={s.note}>No confirmed fitment on file for this number.</Text> : null}
        </>
      ) : null}
      <Footer />
    </Screen>
  );
}

// "Clutch cable ........ 62.69 in", then the detail / older number and the
// years + models printed with that size.
function SizeRow({ size, shown }: { size: StockSize; shown: string }) {
  const s = useStyles(styles);
  const sub = [size.detail, size.oem !== shown ? `as ${size.oem}` : null].filter(Boolean).join(' · ');
  return (
    <View style={s.sizeRow} accessibilityLabel={`${size.label}, ${size.value}${sub ? `, ${sub}` : ''}`}>
      <View style={s.sizeHead}>
        <Text style={s.sizeLabel}>{size.label}</Text>
        <Text style={s.sizeValue} selectable>
          {size.value}
        </Text>
      </View>
      {sub ? <Text style={s.famSub}>{sub}</Text> : null}
      {size.used_on.length ? <Text style={s.famSub}>{size.used_on.join(', ')}</Text> : null}
    </View>
  );
}

function CodeRow({ row, mine, inset }: { row: ModelRow; mine?: string; inset?: boolean }) {
  const { color } = useTheme();
  const s = useStyles(styles);
  const isMine = row.model === mine;
  return (
    <View style={[s.row, inset && s.rowInset, isMine && s.rowMine]}>
      <Text style={[s.model, isMine && { color: color.accent }]}>{row.model}</Text>
      <Text style={s.years}>{row.years}</Text>
    </View>
  );
}

// Collapsed: family name, code count, year envelope. Starts open when the
// rider's own model is inside. One code: a fixed row, name over "CODE · years".
function FamilyRow({ row, mine }: { row: Extract<FitRow, { kind: 'family' }>; mine?: string }) {
  const s = useStyles(styles);
  const hasMine = row.models.some((m) => m.model === mine);
  const [open, setOpen] = useState(hasMine);
  if (row.models.length === 1) {
    const m = row.models[0];
    return (
      <View accessibilityLabel={`${row.name}, ${m.model}, ${m.years}`} style={[s.row, s.famRow, hasMine && s.rowMine]}>
        <Text style={s.chev}> </Text>
        <View style={{ flex: 1 }}>
          <Text style={s.famName}>{row.name}</Text>
          <Text style={s.famSub}>
            {m.model} · {m.years}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${row.name}, ${row.models.length} models, ${row.years}`}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [s.row, s.famRow, hasMine && s.rowMine, pressed && s.famPressed]}
      >
        <Text style={s.chev}>{open ? '▾' : '▸'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.famName}>{row.name}</Text>
          <Text style={s.famSub}>
            {row.models.length} models · {row.years}
          </Text>
        </View>
      </Pressable>
      {open ? row.models.map((m) => <CodeRow key={m.model} row={m} mine={mine} inset />) : null}
    </View>
  );
}

const styles = (color: Palette) => StyleSheet.create({
  kicker: { fontFamily: font.banner, fontSize: 15, color: color.accent, letterSpacing: 1 },
  oem: { fontFamily: font.typeBold, fontSize: 40, color: color.accent, letterSpacing: 1, marginVertical: space.xs },
  note: { fontFamily: font.type, fontSize: 15, color: color.muted, marginTop: space.sm },
  line: { fontFamily: font.type, fontSize: 17, color: color.text, paddingVertical: space.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, justifyContent: 'flex-end', flexShrink: 1 },
  row: {
    flexDirection: 'row',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.rule,
  },
  rowMine: { backgroundColor: color.panel },
  rowInset: { paddingLeft: space.sm + 28 },
  famRow: { alignItems: 'center', minHeight: TAP, gap: space.sm },
  famPressed: { backgroundColor: color.panelHi },
  chev: { fontFamily: font.typeBold, fontSize: 20, color: color.accent, width: 20, textAlign: 'center' },
  famName: { fontFamily: font.sign, fontSize: 24, color: color.text, letterSpacing: 0.5 },
  famSub: { fontFamily: font.type, fontSize: 15, color: color.muted },
  model: { fontFamily: font.typeBold, fontSize: 17, color: color.text, width: 96 },
  sizeRow: { paddingVertical: space.sm, paddingHorizontal: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.rule, gap: 2 },
  sizeHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.md },
  sizeLabel: { fontFamily: font.sign, fontSize: 22, color: color.text, letterSpacing: 0.5, flex: 1 },
  sizeValue: { fontFamily: font.typeBold, fontSize: 22, color: color.accent },
  years: { fontFamily: font.type, fontSize: 17, color: color.muted, flex: 1 },
});
