import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme, type ViewStyle } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Black and gold, drawn like a kustom-kulture flash sheet: flat fills, firm
// outlines and hard offset shadows (no blur). Two palettes: dark (black page,
// gold lines) and light (white page, black lines, gold fills and shadows).
// Comic caps for headings, banner lettering for section heads, typewriter for
// part numbers. Big tap targets for garage use.
const dark = {
  bg: '#0B0A08',
  bgClear: 'rgba(11,10,8,0)', // bg at zero alpha, for fades
  panel: '#17140F',
  panelHi: '#211C14',
  rule: '#3A3226',
  accent: '#D4A52C', // gold text and icons
  accentDim: '#8C6D1F',
  line: '#D4A52C', // outlines and rules
  fill: '#D4A52C', // primary buttons, badges, active chips
  onFill: '#0B0A08',
  shadow: '#4E3B10', // hard offset shadows
  text: '#F2E8D0',
  muted: '#A39880',
  faint: '#6E6553',
  danger: '#D9644A',
};

export type Palette = typeof dark;

const light: Palette = {
  bg: '#FFFFFF',
  bgClear: 'rgba(255,255,255,0)',
  panel: '#FFFFFF',
  panelHi: '#F6F0E1',
  rule: '#E4DCCB',
  accent: '#8A6A12', // gold dark enough to read on white
  accentDim: '#C9AE6A',
  line: '#14110C',
  fill: '#D4A52C',
  onFill: '#0B0A08',
  shadow: '#D4A52C',
  text: '#14110C',
  muted: '#5C5448',
  faint: '#8A8276',
  danger: '#B3261E',
};

export const font = {
  sign: 'Bangers_400Regular', // comic caps (one weight)
  signBold: 'Bangers_400Regular',
  banner: 'Rye_400Regular', // section heads and kickers
  body: 'Oswald_400Regular',
  type: 'CourierPrime_400Regular',
  typeBold: 'CourierPrime_700Bold',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

// Minimum tap target (points). Apple's floor is 44; gloves need more.
export const TAP = 56;

// Outline weights.
export const LINE = 2.5;
export const SHADOW = 4;

// Inked box: firm outline plus a hard offset shadow, like a flash-sheet panel.
export const inked = (c: Palette): ViewStyle => ({
  borderWidth: LINE,
  borderColor: c.line,
  borderRadius: 10,
  boxShadow: `${SHADOW}px ${SHADOW}px 0px ${c.shadow}`,
});

// Pressed inked box: slides into its shadow, so it reads as pushed down.
export const pushed = (c: Palette): ViewStyle => ({
  transform: [{ translateX: SHADOW - 1 }, { translateY: SHADOW - 1 }],
  boxShadow: `1px 1px 0px ${c.shadow}`,
});

// Rider's choice, saved on the device. 'system' follows the phone.
export type Appearance = 'dark' | 'light' | 'system';
const KEY = 'hdchop.appearance';

type Theme = { color: Palette; scheme: 'dark' | 'light'; appearance: Appearance; setAppearance: (a: Appearance) => void; ready: boolean };
const Ctx = createContext<Theme>({ color: dark, scheme: 'dark', appearance: 'dark', setAppearance: () => {}, ready: true });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [appearance, setState] = useState<Appearance>('dark');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'dark' || v === 'light' || v === 'system') setState(v);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  const theme = useMemo<Theme>(() => {
    const scheme = appearance === 'system' ? (system === 'light' ? 'light' : 'dark') : appearance;
    return {
      color: scheme === 'light' ? light : dark,
      scheme,
      appearance,
      ready,
      setAppearance: (a) => {
        setState(a);
        AsyncStorage.setItem(KEY, a).catch(() => {});
      },
    };
  }, [appearance, system, ready]);
  return <Ctx.Provider value={theme}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

// Styles built from the current palette; rebuilt only when the palette changes.
// Pass a module-level factory so the memo holds.
export function useStyles<T>(make: (c: Palette) => T): T {
  const { color } = useTheme();
  return useMemo(() => make(color), [make, color]);
}
