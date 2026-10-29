import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { api, FamilyInfo } from '@/lib/api';
import { yearRange } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { font, Palette, space, useStyles } from '@/lib/theme';
import { Screen } from '@/components/Screen';
import { Big, ErrorBox, Footer, Heading, Loading, Section } from '@/components/ui';

// Search a whole family instead of one year + model: pick a frame (Touring,
// Dyna...) or a motor (Shovelhead, Twin Cam...), then type part words.
export default function PickFamily() {
  const s = useStyles(styles);
  const { data, error, loading, retry } = useApi((sig) => api.families(sig), []);
  const list = (kind: FamilyInfo['kind']) =>
    (data ?? [])
      .filter((f) => f.kind === kind)
      .map((f) => (
        <Big
          key={f.key}
          label={f.name}
          sub={`${yearRange(f.year_start, f.year_end)} · ${f.models} model${f.models === 1 ? '' : 's'}`}
          onPress={() => router.push(`/family/${f.key}`)}
          style={{ marginBottom: space.md }}
        />
      ));
  return (
    <Screen>
      <Heading>Search a family</Heading>
      <Text style={s.lede}>Every part that fits a whole line of bikes, with the models and years each one fits.</Text>
      {loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={retry} /> : null}
      {data ? (
        <>
          <Section title="By frame" />
          {list('frame')}
          <Section title="By motor" />
          {list('motor')}
        </>
      ) : null}
      <Footer />
    </Screen>
  );
}

const styles = (color: Palette) =>
  StyleSheet.create({
    lede: {
      fontFamily: font.body,
      fontSize: 17,
      color: color.muted,
      marginTop: space.sm,
      lineHeight: 24,
    },
  });
