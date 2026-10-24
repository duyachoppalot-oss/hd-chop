import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { bikeLabel, useBike } from '@/lib/bike';
import { useApi } from '@/lib/useApi';
import { color, font, space, TAP } from '@/lib/theme';
import { Screen } from '@/components/Screen';
import { YearWheel } from '@/components/YearWheel';
import { Big, ErrorBox, Footer, Heading, Loading } from '@/components/ui';

// Step 1: spin the tire to the year, then open it. Years come from
// /v1/years (only years with fitment), newest first.
export default function PickYear() {
  const { bike } = useBike();
  const { data: years, error, loading, retry } = useApi((sig) => api.years(sig), []);
  const [picked, setPicked] = useState<number | null>(null);
  // The page doesn't scroll (a scrolling page fights the wheel's drag), so the
  // wheel takes what's left of the screen: 380 on a big phone, less on an SE.
  const wheelHeight = Math.max(240, Math.min(380, useWindowDimensions().height - 440));

  const year = picked ?? (bike && years?.includes(bike.year) ? bike.year : years?.[0] ?? null);

  const open = () => {
    if (year != null) router.push(`/models/${year}`);
  };

  return (
    <Screen scroll={false}>
      <Heading>What are you riding?</Heading>
      <Text style={s.lede}>Spin the wheel to your bike's year, then open it.</Text>
      {bike ? (
        <Big label={`Back to ${bikeLabel(bike)}`} sub="Search parts for this bike" onPress={() => router.push('/search')} style={{ marginTop: space.lg }} />
      ) : null}
      {loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={retry} /> : null}
      {years?.length ? (
        <>
          <YearWheel years={years} value={year} onChange={setPicked} height={wheelHeight} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${year} models`}
            onPress={open}
            style={({ pressed }) => [s.open, pressed && { opacity: 0.85 }]}
          >
            <Text style={s.openText}>Open {year}</Text>
          </Pressable>
        </>
      ) : null}
      <Footer />
    </Screen>
  );
}

const s = StyleSheet.create({
  lede: { fontFamily: font.body, fontSize: 17, color: color.muted, marginTop: space.sm, marginBottom: space.lg, lineHeight: 24 },
  open: {
    minHeight: TAP + 4,
    marginTop: space.xl,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
    backgroundColor: color.gold,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openText: { fontFamily: font.signBold, fontSize: 24, color: color.bg, letterSpacing: 2, textTransform: 'uppercase' },
});
