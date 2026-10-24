import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '@/lib/api';
import { useBike } from '@/lib/bike';
import { byModel, conditionLabel } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { color, font, space } from '@/lib/theme';
import { Screen } from '@/components/Screen';
import { Badge, ErrorBox, Footer, Heading, Loading, Section } from '@/components/ui';

// Part detail: newest number, the numbers it replaces, every model and year
// span it fits, split by conditions.
export default function PartDetail() {
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
              {byModel(f.spans).map((r) => (
                <View key={r.model} style={[s.row, r.model === bike?.model_code && s.rowMine]}>
                  <Text style={[s.model, r.model === bike?.model_code && { color: color.gold }]}>{r.model}</Text>
                  <Text style={s.years}>{r.years}</Text>
                </View>
              ))}
            </View>
          ))}
          {!data.fits.length ? <Text style={s.note}>No confirmed fitment on file for this number.</Text> : null}
        </>
      ) : null}
      <Footer />
    </Screen>
  );
}

const s = StyleSheet.create({
  kicker: { fontFamily: font.sign, fontSize: 14, color: color.gold, letterSpacing: 2 },
  oem: { fontFamily: font.typeBold, fontSize: 40, color: color.gold, letterSpacing: 1, marginVertical: space.xs },
  note: { fontFamily: font.type, fontSize: 15, color: color.muted, marginTop: space.sm },
  line: { fontFamily: font.type, fontSize: 17, color: color.cream, paddingVertical: space.xs },
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
  model: { fontFamily: font.typeBold, fontSize: 17, color: color.cream, width: 96 },
  years: { fontFamily: font.type, fontSize: 17, color: color.muted, flex: 1 },
});
