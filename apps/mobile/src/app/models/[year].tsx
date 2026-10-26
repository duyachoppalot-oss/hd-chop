import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api, Model } from '@/lib/api';
import { titleCase, useBike } from '@/lib/bike';
import { platformLabel } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { space } from '@/lib/theme';
import { Screen } from '@/components/Screen';
import { Big, ErrorBox, Footer, Loading, Section } from '@/components/ui';

// Step 2: pick the model, grouped by platform. Only models with parts are
// listed: a model we know of but have no fitment for can't be searched.
// Codes of one named bike fold into one family row (Road King: FLHR, FLHRC,
// FLHRCI...) that opens to each code, the same families the part screen uses.
type Row = { kind: 'model'; m: Model } | { kind: 'family'; key: string; name: string; models: Model[] };

function rows(models: Model[]): Row[] {
  const groups = new Map<string, Model[]>();
  for (const m of models) {
    const k = m.family_key ?? `code:${m.model_code}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(m);
  }
  return [...groups].map(([key, ms]): Row =>
    ms.length < 2 ? { kind: 'model', m: ms[0] } : { kind: 'family', key, name: titleCase(ms[0].family ?? ms[0].model_name ?? ms[0].model_code), models: ms }
  );
}

export default function PickModel() {
  const year = Number(useLocalSearchParams<{ year: string }>().year);
  const { bike, setBike } = useBike();
  const { data: models, error, loading, retry } = useApi((sig) => api.models(year, sig), [year]);

  const groups = new Map<string, Model[]>();
  for (const m of models ?? []) {
    if (!m.has_parts) continue;
    if (!groups.has(m.platform)) groups.set(m.platform, []);
    groups.get(m.platform)!.push(m);
  }

  const pick = (m: Model) => {
    setBike({ year, model_code: m.model_code, model_name: m.model_name, specs: m.specs ?? [], chassis: m.chassis });
    router.push('/search');
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: `${year} models` }} />
      {loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={retry} /> : null}
      {[...groups].map(([platform, ms]) => (
        <View key={platform}>
          <Section title={platformLabel(platform)} />
          <View style={{ gap: space.sm }}>
            {rows(ms).map((r) =>
              r.kind === 'model' ? (
                <ModelButton key={r.m.model_code} m={r.m} onPick={pick} />
              ) : (
                <FamilyGroup key={r.key} row={r} onPick={pick} mine={bike?.year === year ? bike.model_code : undefined} />
              )
            )}
          </View>
        </View>
      ))}
      <Footer />
    </Screen>
  );
}

function ModelButton({ m, onPick, inset }: { m: Model; onPick: (m: Model) => void; inset?: boolean }) {
  return (
    <Big
      label={m.model_name ? titleCase(m.model_name) : m.model_code}
      sub={m.model_code}
      onPress={() => onPick(m)}
      style={inset ? { marginLeft: space.lg } : undefined}
    />
  );
}

// Collapsed: family name and its codes. Starts open when the rider's bike is inside.
function FamilyGroup({ row, onPick, mine }: { row: Extract<Row, { kind: 'family' }>; onPick: (m: Model) => void; mine?: string }) {
  const [open, setOpen] = useState(row.models.some((m) => m.model_code === mine));
  return (
    <View style={{ gap: space.sm }}>
      <Big
        label={row.name}
        sub={`${row.models.length} models · ${row.models.map((m) => m.model_code).join(' ')}`}
        expanded={open}
        onPress={() => setOpen(!open)}
      />
      {open ? row.models.map((m) => <ModelButton key={m.model_code} m={m} onPick={onPick} inset />) : null}
    </View>
  );
}
