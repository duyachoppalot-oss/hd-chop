import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { Appearance, font, inked, LINE, Palette, pushed, space, TAP, useStyles, useTheme } from '@/lib/theme';

export function Heading({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const s = useStyles(styles);
  return <Text style={[s.heading, style]}>{children}</Text>;
}

// Section head in banner lettering over a thick ink rule, like a flash-sheet caption.
export function Section({ title, right }: { title: string; right?: ReactNode }) {
  const s = useStyles(styles);
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
  expanded,
}: {
  label: string;
  sub?: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  // Set for a row that opens a group: shows ▸ / ▾ and reports the state.
  expanded?: boolean;
}) {
  const { color } = useTheme();
  const s = useStyles(styles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={expanded == null ? undefined : { expanded }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.big, pressed && s.bigPressed, disabled && s.bigDisabled, style]}
    >
      <Text style={[s.bigLabel, disabled && { color: color.faint }]} numberOfLines={1}>
        {expanded == null ? '' : expanded ? '▾ ' : '▸ '}
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
  const s = useStyles(styles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => [s.chip, active && s.chipActive, pressed && s.chipPressed]}
    >
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, light }: { label: string; light?: boolean }) {
  const s = useStyles(styles);
  return (
    <View style={[s.badge, light && s.badgeLight]}>
      <Text style={[s.badgeText, light && s.badgeTextLight]}>{label}</Text>
    </View>
  );
}

export function Loading() {
  const { color } = useTheme();
  const s = useStyles(styles);
  return (
    <View style={s.center}>
      <ActivityIndicator color={color.accent} size="large" />
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const s = useStyles(styles);
  return (
    <View style={[s.center, { gap: space.lg }]}>
      <Text style={s.errorText}>{message}</Text>
      {onRetry ? <Big label="Try again" onPress={onRetry} style={{ alignSelf: 'stretch' }} /> : null}
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  const s = useStyles(styles);
  return <Text style={s.empty}>{children}</Text>;
}

const LOOKS: { key: Appearance; label: string }[] = [
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
  { key: 'system', label: 'Phone' },
];

// Page color: black page, white page, or follow the phone. Saved on the device.
export function AppearancePicker() {
  const { appearance, setAppearance } = useTheme();
  const s = useStyles(styles);
  return (
    <View style={s.looks} accessibilityRole="radiogroup" accessibilityLabel="Page color">
      <Text style={s.looksLabel}>Page</Text>
      {LOOKS.map((l) => (
        <Chip key={l.key} label={l.label} active={appearance === l.key} onPress={() => setAppearance(l.key)} />
      ))}
    </View>
  );
}

// DATA_RIGHTS.md: shown in the app footer.
export function Footer() {
  const s = useStyles(styles);
  return <Text style={s.footer}>Not affiliated with or endorsed by Harley-Davidson.</Text>;
}

const styles = (color: Palette) => StyleSheet.create({
  heading: { fontFamily: font.sign, fontSize: 36, lineHeight: 40, color: color.text, letterSpacing: 1 },
  section: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    borderBottomWidth: LINE,
    borderBottomColor: color.line,
    paddingBottom: space.xs,
    marginTop: space.xl,
    marginBottom: space.md,
  },
  sectionText: { fontFamily: font.banner, fontSize: 16, color: color.accent, letterSpacing: 1, textTransform: 'uppercase' },
  big: {
    ...inked(color),
    minHeight: TAP,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: color.panel,
    marginRight: 4,
  },
  bigPressed: { ...pushed(color), backgroundColor: color.panelHi },
  bigDisabled: { backgroundColor: color.bg, borderColor: color.faint, boxShadow: 'none' },
  bigLabel: { fontFamily: font.sign, fontSize: 26, color: color.text, letterSpacing: 0.5 },
  bigSub: { fontFamily: font.type, fontSize: 15, color: color.muted, marginTop: 2 },
  chip: {
    ...inked(color),
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: 24,
    borderWidth: 2.5,
    boxShadow: `3px 3px 0px ${color.shadow}`,
    backgroundColor: color.panel,
  },
  chipPressed: { ...pushed(color), backgroundColor: color.panelHi },
  chipActive: { backgroundColor: color.fill },
  chipText: { fontFamily: font.sign, fontSize: 20, color: color.accent, letterSpacing: 0.5 },
  chipTextActive: { color: color.onFill },
  badge: { backgroundColor: color.fill, borderWidth: 2, borderColor: color.fill, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeLight: { backgroundColor: 'transparent', borderColor: color.line, borderStyle: 'dashed' },
  badgeText: { fontFamily: font.sign, fontSize: 16, color: color.onFill, letterSpacing: 0.5 },
  badgeTextLight: { color: color.accent },
  looks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, marginTop: space.lg },
  looksLabel: { fontFamily: font.banner, fontSize: 14, color: color.accent, letterSpacing: 1, textTransform: 'uppercase', marginRight: space.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  errorText: { fontFamily: font.body, fontSize: 18, color: color.danger, textAlign: 'center' },
  empty: { fontFamily: font.body, fontSize: 17, color: color.muted, lineHeight: 24 },
  footer: { fontFamily: font.body, fontSize: 12, color: color.faint, textAlign: 'center', marginTop: space.xl, marginBottom: space.lg },
});
