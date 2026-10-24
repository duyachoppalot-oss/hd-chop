import { useState } from 'react';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { api } from '@/lib/api';
import { bikeLabel, useBike } from '@/lib/bike';
import { useApi } from '@/lib/useApi';
import { color, font, space } from '@/lib/theme';
import { Screen } from '@/components/Screen';
import { PartCard } from '@/components/PartCard';
import { Chip, Empty, ErrorBox, Footer, Heading, Loading, Section } from '@/components/ui';

// Search results (docs/SPEC.md "Search pipeline"): up to 3 concepts as chips,
// parts per concept, trigram fallback when no concept matched.
export default function Results() {
  const { q = '' } = useLocalSearchParams<{ q: string }>();
  const { bike } = useBike();
  const [all, setAll] = useState(false);
  const [pick, setPick] = useState(0);
  const { data, error, loading, retry } = useApi(
    (sig) => (bike ? api.search(bike.year, bike.model_code, q, all, sig) : Promise.resolve(null)),
    [bike?.year, bike?.model_code, q, all]
  );
  if (!bike) return <Redirect href="/" />;

  const result = data?.results[Math.min(pick, (data?.results.length ?? 1) - 1)];
  const label = bikeLabel(bike);

  return (
    <Screen>
      <Stack.Screen options={{ title: `“${q}”` }} />
      {loading && !data ? <Loading /> : error ? <ErrorBox message={error} onRetry={retry} /> : null}
      {data && data.results.length > 1 ? (
        <View style={s.chips}>
          {data.results.map((r, i) => (
            <Chip key={r.concept.slug} label={r.concept.display_name} active={i === pick} onPress={() => setPick(i)} />
          ))}
        </View>
      ) : null}
      {result ? (
        <>
          <Heading>{result.concept.display_name}</Heading>
          <Text style={s.fits}>
            {result.parts.length
              ? `${result.parts.length} OEM part${result.parts.length === 1 ? ' fits' : 's fit'} your ${label}`
              : `No OEM ${result.concept.display_name.toLowerCase()} listed for your ${label}.`}
          </Text>
          {data?.concepts[0]?.match === 'trigram' ? <Text style={s.note}>Closest match for “{data.query}”.</Text> : null}
          {result.parts.length ? (
            <View style={s.toggle}>
              <Text style={s.toggleText}>Show other bikes beyond ±10 years</Text>
              <Switch
                value={all}
                onValueChange={setAll}
                trackColor={{ true: color.gold, false: color.rule }}
                thumbColor={color.cream}
                accessibilityLabel="Show other bikes beyond 10 years"
              />
            </View>
          ) : null}
          <View style={{ marginTop: space.md }}>
            {result.parts.map((p) => (
              <PartCard key={`${p.chain_root}|${p.conditions.join(',')}`} part={p} model={bike.model_code} />
            ))}
          </View>
        </>
      ) : null}
      {data?.fallback ? (
        <>
          <Heading>No match for “{data.query}”</Heading>
          {data.fallback.length ? (
            <>
              <Text style={s.fits}>Closest part names for your {label}:</Text>
              <Section title="Closest names" />
              {data.fallback.map((p) => (
                <PartCard key={`${p.chain_root}|${p.conditions.join(',')}`} part={p} model={bike.model_code} />
              ))}
            </>
          ) : (
            <Empty>Nothing close on your {label}. Try another word — “tank” instead of “fuel cell”, “blinkers” instead of “indicators”. We log misses and add the words riders use.</Empty>
          )}
        </>
      ) : null}
      <Footer />
    </Screen>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  fits: { fontFamily: font.body, fontSize: 17, color: color.muted, marginTop: space.xs },
  note: { fontFamily: font.type, fontSize: 14, color: color.muted, marginTop: space.xs },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md, minHeight: 44, gap: space.md },
  toggleText: { fontFamily: font.body, fontSize: 15, color: color.cream, flex: 1 },
});
