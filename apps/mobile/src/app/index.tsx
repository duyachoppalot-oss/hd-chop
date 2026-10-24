import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { bikeLabel, useBike } from '@/lib/bike';
import { useApi } from '@/lib/useApi';
import { color, font, space } from '@/lib/theme';
import { Screen } from '@/components/Screen';
import { Big, ErrorBox, Footer, Heading, Loading, Section } from '@/components/ui';

// Step 1: pick the year. Years come from /v1/years (only years with fitment).
export default function PickYear() {
  const { bike } = useBike();
  const { data: years, error, loading, retry } = useApi((sig) => api.years(sig), []);

  const decades = new Map<number, number[]>();
  for (const y of years ?? []) {
    const d = Math.floor(y / 10) * 10;
    if (!decades.has(d)) decades.set(d, []);
    decades.get(d)!.push(y);
  }

  return (
    <Screen>
      <Heading>What are you riding?</Heading>
      <Text style={s.lede}>Pick the year, then the model. Then ask for a part in plain words.</Text>
      {bike ? (
        <Big label={`Back to ${bikeLabel(bike)}`} sub="Search parts for this bike" onPress={() => router.push('/search')} style={{ marginTop: space.lg }} />
      ) : null}
      {loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={retry} /> : null}
      {[...decades].map(([d, ys]) => (
        <View key={d}>
          <Section title={`${d}s`} />
          <View style={s.grid}>
            {ys.map((y) => (
              <Big key={y} label={String(y)} onPress={() => router.push(`/models/${y}`)} style={s.year} />
            ))}
          </View>
        </View>
      ))}
      <Footer />
    </Screen>
  );
}

const s = StyleSheet.create({
  lede: { fontFamily: font.body, fontSize: 17, color: color.muted, marginTop: space.sm, lineHeight: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  year: { flexBasis: '30%', flexGrow: 1, maxWidth: '31.5%', alignItems: 'center' },
});
