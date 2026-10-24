import { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { color, space } from '@/lib/theme';

// Scrolling page with a readable max width (matters on web and iPad).
export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  if (!scroll) return <View style={[s.root, s.pad]}><View style={s.inner}>{children}</View></View>;
  return (
    <ScrollView style={s.root} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <View style={s.inner}>{children}</View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  pad: { padding: space.lg, flexGrow: 1 },
  inner: { width: '100%', maxWidth: 640, alignSelf: 'center', flexGrow: 1 },
});
