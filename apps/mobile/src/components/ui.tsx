import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { color, font, space, TAP } from '@/lib/theme';

export function Heading({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[s.heading, style]}>{children}</Text>;
}

// Section label with a gold rule underneath, like a shop-manual section head.
export function Section({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionText}>{title}</Text>
      {right}
    </View>
  );
}

export function Big({
  label,
  sub,
  onPress,
  disabled,
  style,
}: {
  label: string;
  sub?: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.big, pressed && s.bigPressed, disabled && s.bigDisabled, style]}
    >
      <Text style={[s.bigLabel, disabled && { color: color.faint }]} numberOfLines={1}>
        {label}
      </Text>
      {sub ? (
        <Text style={[s.bigSub, disabled && { color: color.faint }]} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function Chip({ label, onPress, active }: { label: string; onPress?: () => void; active?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [s.chip, active && s.chipActive, pressed && s.bigPressed]}
    >
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, light }: { label: string; light?: boolean }) {
  return (
    <View style={[s.badge, light && s.badgeLight]}>
      <Text style={[s.badgeText, light && s.badgeTextLight]}>{label}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={s.center}>
      <ActivityIndicator color={color.gold} size="large" />
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={[s.center, { gap: space.lg }]}>
      <Text style={s.errorText}>{message}</Text>
      {onRetry ? <Big label="Try again" onPress={onRetry} style={{ alignSelf: 'stretch' }} /> : null}
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <Text style={s.empty}>{children}</Text>;
}

// DATA_RIGHTS.md: shown in the app footer.
export function Footer() {
  return <Text style={s.footer}>Not affiliated with or endorsed by Harley-Davidson.</Text>;
}

const s = StyleSheet.create({
  heading: { fontFamily: font.signBold, fontSize: 30, color: color.cream, letterSpacing: 0.5, textTransform: 'uppercase' },
  section: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    borderBottomColor: color.gold,
    paddingBottom: space.xs,
    marginTop: space.xl,
    marginBottom: space.md,
  },
  sectionText: { fontFamily: font.sign, fontSize: 15, color: color.gold, letterSpacing: 2, textTransform: 'uppercase' },
  big: {
    minHeight: TAP,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: 4,
  },
  bigPressed: { backgroundColor: color.panelHi, borderColor: color.gold },
  bigDisabled: { backgroundColor: color.bg },
  bigLabel: { fontFamily: font.sign, fontSize: 22, color: color.cream },
  bigSub: { fontFamily: font.body, fontSize: 14, color: color.muted, marginTop: 2 },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderWidth: 1,
    borderColor: color.goldDim,
    borderRadius: 22,
  },
  chipActive: { backgroundColor: color.gold, borderColor: color.gold },
  chipText: { fontFamily: font.sign, fontSize: 16, color: color.gold, letterSpacing: 0.5 },
  chipTextActive: { color: color.bg },
  badge: { backgroundColor: color.gold, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3 },
  badgeLight: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.goldDim, borderStyle: 'dashed' },
  badgeText: { fontFamily: font.sign, fontSize: 13, color: color.bg, letterSpacing: 0.5, textTransform: 'uppercase' },
  badgeTextLight: { color: color.gold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  errorText: { fontFamily: font.body, fontSize: 18, color: color.danger, textAlign: 'center' },
  empty: { fontFamily: font.body, fontSize: 17, color: color.muted, lineHeight: 24 },
  footer: { fontFamily: font.body, fontSize: 12, color: color.faint, textAlign: 'center', marginTop: space.xl, marginBottom: space.lg },
});
