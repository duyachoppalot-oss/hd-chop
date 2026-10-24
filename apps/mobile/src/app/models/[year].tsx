import { Stack, router, useLocalSearchParams } from 'expo-router';
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
export default function PickModel() {
  const year = Number(useLocalSearchParams<{ year: string }>().year);
  const { setBike } = useBike();
  const { data: models, error, loading, retry } = useApi((sig) => api.models(year, sig), [year]);

  const groups = new Map<string, Model[]>();
  for (const m of models ?? []) {
    if (!m.has_parts) continue;
    if (!groups.has(m.platform)) groups.set(m.platform, []);
    groups.get(m.platform)!.push(m);
  }

  const pick = (m: Model) => {
    setBike({ year, model_code: m.model_code, model_name: m.model_name, specs: m.specs ?? [] });
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
            {ms.map((m) => (
              <Big
                key={m.model_code}
                label={m.model_name ? titleCase(m.model_name) : m.model_code}
                sub={m.model_code}
                onPress={() => pick(m)}
              />
            ))}
          </View>
        </View>
      ))}
      <Footer />
    </Screen>
  );
}
