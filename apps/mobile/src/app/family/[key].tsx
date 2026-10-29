import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, FamilyPart } from '@/lib/api';
import { yearRange } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { font, inked, LINE, Palette, pushed, space, TAP, useStyles, useTheme } from '@/lib/theme';
import { Screen } from '@/components/Screen';
import { FamilyPartCard } from '@/components/FamilyPartCard';
import { Big, Chip, Empty, ErrorBox, Footer, Heading, Loading, Section } from '@/components/ui';

const QUICK = ['gas tank', 'turn signals', 'seat', 'fenders', 'tail light', 'headlight', 'air cleaner', 'handlebar', 'kickstand', 'speedo'];

type Era = { from: number; to: number } | null;

// Decades inside the family's years: Touring 1980–2026 -> 1980s ... 2020s.
function eras(a: number, b: number): { label: string; from: number; to: number }[] {
  const out = [];
  for (let d = Math.floor(a / 10) * 10; d <= b; d += 10) out.push({ label: `${d}s`, from: Math.max(d, a), to: Math.min(d + 9, b) });
  return out.length > 1 ? out : [];
}

// One family: words in, every part on the family's bikes out, each with a
// table of the models and years it fits. Decade chips cut the family to a
// stretch of years; long lists page in with "Show more".
export default function FamilySearch() {
  const { color } = useTheme();
  const s = useStyles(styles);
  const { key } = useLocalSearchParams<{ key: string }>();
  const fams = useApi((sig) => api.families(sig), []);
  const fam = fams.data?.find((f) => f.key === key);
  const [q, setQ] = useState('');
  const [words, setWords] = useState('');
  const [era, setEra] = useState<Era>(null);
  const [pick, setPick] = useState(0);
  // Extra pages per concept slug: pages loaded after the first, and their parts.
  const [more, setMore] = useState<Record<string, { pages: number; parts: FamilyPart[] }>>({});
  const [moreBusy, setMoreBusy] = useState(false);
  const { data, error, loading, retry } = useApi(
    (sig) => (words ? api.familySearch(key, words, era, 0, sig) : Promise.resolve(null)),
    [key, words, era?.from, era?.to],
  );
  useEffect(() => {
    setMore({});
    setPick(0);
  }, [key, words, era?.from, era?.to]);

  const go = (w: string) => {
    const t = w.trim();
    if (t) {
      setQ(t);
      setWords(t);
    }
  };

  const result = data?.results[Math.min(pick, (data?.results.length ?? 1) - 1)];
  const extra = result ? more[result.concept.slug] : undefined;
  const parts = result ? [...result.parts, ...(extra?.parts ?? [])] : [];
  const loadedRoots = result ? Math.min(result.total, data!.page_size * (1 + (extra?.pages ?? 0))) : 0;
  const name = fam?.name ?? '';
  const scope = era ? `${name} ${yearRange(era.from, era.to)}` : name;

  const loadMore = async () => {
    if (!result || !data) return;
    const slug = result.concept.slug;
    const pages = extra?.pages ?? 0;
    setMoreBusy(true);
    try {
      const r = await api.familySearch(key, words, era, data.page_size * (pages + 1));
      const got = r.results.find((x) => x.concept.slug === slug)?.parts ?? [];
      setMore((m) => ({
        ...m,
        [slug]: {
          pages: pages + 1,
          parts: [...(m[slug]?.parts ?? []), ...got],
        },
      }));
    } catch {
      // The button stays; a tap retries.
    } finally {
      setMoreBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: name || 'Family' }} />
      {fams.error ? <ErrorBox message={fams.error} onRetry={fams.retry} /> : null}
      {fam ? (
        <>
          <Text style={s.kicker}>{fam.kind === 'frame' ? 'FRAME FAMILY' : 'MOTOR FAMILY'}</Text>
          <Heading>{fam.name}</Heading>
          <Text style={s.code}>
            {yearRange(fam.year_start, fam.year_end)} · {fam.models} models
          </Text>
        </>
      ) : null}

      <Section title="What do you need?" />
      <TextInput
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => go(q)}
        placeholder="gas tank, turn signals…"
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

      {fam && eras(fam.year_start, fam.year_end).length ? (
        <>
          <Section title="Years" />
          <View style={s.chips}>
            <Chip label="All years" active={!era} onPress={() => setEra(null)} />
            {eras(fam.year_start, fam.year_end).map((e) => (
              <Chip key={e.label} label={e.label} active={era?.from === e.from} onPress={() => setEra({ from: e.from, to: e.to })} />
            ))}
          </View>
        </>
      ) : null}

      {!words ? (
        <>
          <Section title="Common asks" />
          <View style={s.chips}>
            {QUICK.map((w) => (
              <Chip key={w} label={w} onPress={() => go(w)} />
            ))}
          </View>
        </>
      ) : null}

      {words && loading && !data ? <Loading /> : error ? <ErrorBox message={error} onRetry={retry} /> : null}
      {data && data.results.length > 1 ? (
        <View style={[s.chips, { marginTop: space.xl }]}>
          {data.results.map((r, i) => (
            <Chip key={r.concept.slug} label={r.concept.display_name} active={i === pick} onPress={() => setPick(i)} />
          ))}
        </View>
      ) : null}
      {result ? (
        <>
          <Section title={result.concept.display_name} />
          <Text style={s.fits}>
            {result.total
              ? `${result.total} OEM part${result.total === 1 ? '' : 's'} on ${scope}`
              : `No OEM ${result.concept.display_name.toLowerCase()} listed for ${scope}.`}
          </Text>
          {data?.concepts[0]?.match === 'trigram' ? <Text style={s.note}>Closest match for “{data.query}”.</Text> : null}
          <View style={{ marginTop: space.md }}>
            {parts.map((p) => (
              <FamilyPartCard key={`${p.oem}|${p.conditions.join(',')}`} part={p} />
            ))}
          </View>
          {loadedRoots < result.total ? (
            <Big
              label={moreBusy ? 'Loading…' : 'Show more'}
              sub={`${loadedRoots} of ${result.total} parts shown`}
              onPress={loadMore}
              disabled={moreBusy}
            />
          ) : null}
        </>
      ) : null}
      {data?.fallback ? (
        <>
          <Section title={`No match for “${data.query}”`} />
          {data.fallback.length ? (
            <>
              <Text style={s.fits}>Closest part names on {scope}:</Text>
              <View style={{ marginTop: space.md }}>
                {data.fallback.map((p) => (
                  <FamilyPartCard key={`${p.oem}|${p.conditions.join(',')}`} part={p} />
                ))}
              </View>
            </>
          ) : (
            <Empty>Nothing close on {scope}. Try another word — “tank” instead of “fuel cell”, “turn signals” instead of “indicators”.</Empty>
          )}
        </>
      ) : null}
      <Footer />
    </Screen>
  );
}

const styles = (color: Palette) =>
  StyleSheet.create({
    kicker: {
      fontFamily: font.banner,
      fontSize: 14,
      color: color.accent,
      letterSpacing: 1,
    },
    code: {
      fontFamily: font.type,
      fontSize: 16,
      color: color.muted,
      marginTop: 2,
    },
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
    button: {
      ...inked(color),
      minHeight: TAP,
      marginTop: space.md,
      marginRight: 4,
      backgroundColor: color.fill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonOff: {
      backgroundColor: color.accentDim,
      borderColor: color.accentDim,
      boxShadow: 'none',
    },
    buttonText: {
      fontFamily: font.sign,
      fontSize: 28,
      color: color.onFill,
      letterSpacing: 1.5,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    fits: { fontFamily: font.body, fontSize: 17, color: color.muted },
    note: {
      fontFamily: font.type,
      fontSize: 14,
      color: color.muted,
      marginTop: space.xs,
    },
  });
