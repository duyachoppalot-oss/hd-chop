import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { color, font } from '@/lib/theme';

// Year picker drawn as a spinning tire seen side-on. The tire sits mostly off
// the left edge; its right side sweeps past a gold pointer. Years are printed
// on the sidewall like raised white letters, tread blocks ring the outside and
// a gold laced wheel turns inside. Drag up/down to spin (it coasts, then settles
// on a year with a haptic click per year); tap above/below the pointer to nudge
// one year. Years are listed top to bottom in the order given.

const H_DEFAULT = 380; // viewport height unless the screen passes a smaller one
const R = 560; // tire outer radius
const BAND = 124; // tire band width (tread + sidewall)
const R_YEAR = R - 66; // radius of the year lettering
const STEP = 8.4; // degrees between years (~72px of arc at R_YEAR)
const SHOWN = 6; // years rendered each side of the pointer
const RIM = 18; // rim width
const SPOKES = 40; // two flanges x 20, laced crossing
const HUB = 70; // spoke flange radius
const CROSS = 24; // degrees a spoke runs round from flange to rim (crossed lacing)
const TREAD = 72; // tread blocks around the tire
const DEG_PER_PX = 180 / Math.PI / R_YEAR; // finger moves the lettering 1:1
const nativeDriver = Platform.OS !== 'web';

type Props = { years: number[]; value: number | null; onChange: (year: number) => void; height?: number };

export function YearWheel({ years, value, onChange, height = H_DEFAULT }: Props) {
  const H = height;
  const half = useRef(H / 2);
  half.current = H / 2;
  const startIndex = Math.max(0, value == null ? 0 : years.indexOf(value));
  const angle = useRef(new Animated.Value(startIndex * STEP)).current; // degrees; index = angle / STEP
  const current = useRef(startIndex * STEP);
  const index = useRef(startIndex);
  const [center, setCenter] = useState(startIndex);
  const [width, setWidth] = useState(343);
  const last = years.length - 1;

  useEffect(() => {
    const id = angle.addListener(({ value: a }) => {
      current.current = a;
      const i = Math.min(last, Math.max(0, Math.round(a / STEP)));
      if (i !== index.current) {
        index.current = i;
        setCenter(i);
        onChange(years[i]);
        if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
      }
    });
    return () => angle.removeListener(id);
  }, [angle, last, years, onChange]);

  const settle = (toIndex: number) => {
    const i = Math.min(last, Math.max(0, toIndex));
    Animated.spring(angle, { toValue: i * STEP, useNativeDriver: nativeDriver, friction: 7, tension: 60 }).start();
  };

  const pan = useMemo(() => {
    let a0 = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        angle.stopAnimation();
        a0 = current.current;
      },
      onPanResponderMove: (_, g) => {
        // Finger up turns the visible side upward: later rows come to the pointer.
        const a = a0 - g.dy * DEG_PER_PX;
        angle.setValue(Math.min(last * STEP + STEP, Math.max(-STEP, a)));
      },
      onPanResponderRelease: (e, g) => {
        if (Math.abs(g.dy) < 5 && Math.abs(g.vy) < 0.1) {
          // Tap: above the pointer = previous row, below = next.
          settle(index.current + (e.nativeEvent.locationY < half.current ? -1 : 1));
          return;
        }
        // Fling: coast as far as a quarter second at release speed, then snap.
        const v = -g.vy * 1000 * DEG_PER_PX; // deg/s (vy is px/ms)
        settle(Math.round((current.current + v * 0.25) / STEP));
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);

  // Tire geometry: rightmost point 18px in from the viewport edge, centred vertically.
  const cx = width - 18 - R;
  const cy = H / 2;
  const box = { position: 'absolute' as const, left: cx - R, top: cy - R, width: 2 * R, height: 2 * R };
  const spin = angle.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '-360deg'], extrapolate: 'extend' });

  const decor = useMemo(
    () => ({
      // Laced spokes: each runs from the hub flange to the rim at an angle,
      // alternating direction so neighbours cross; nipple where it meets the rim.
      spokes: Array.from({ length: SPOKES }, (_, k) => {
        const rad = Math.PI / 180;
        const a = (360 / SPOKES) * k * rad;
        const b = a + (k % 2 ? CROSS : -CROSS) * rad;
        const rr = R - BAND - RIM + 2;
        const [ax, ay, bx, by] = [HUB * Math.cos(a), HUB * Math.sin(a), rr * Math.cos(b), rr * Math.sin(b)];
        const len = Math.hypot(bx - ax, by - ay);
        return {
          k,
          near: k % 2 === 1,
          left: R + (ax + bx) / 2 - len / 2,
          top: R + (ay + by) / 2 - 1,
          len,
          rot: Math.atan2(by - ay, bx - ax) / rad,
          nx: R + bx,
          ny: R + by,
        };
      }),
      tread: Array.from({ length: TREAD }, (_, i) => (360 / TREAD) * i),
    }),
    []
  );

  const shown = [];
  for (let i = Math.max(0, center - SHOWN); i <= Math.min(last, center + SHOWN); i++) shown.push(i);

  return (
    <View
      style={[s.view, { height: H }]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Model year"
      accessibilityValue={{ text: value ? String(value) : '' }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => settle(index.current + (e.nativeEvent.actionName === 'increment' ? -1 : 1))}
      {...pan.panHandlers}
    >
      {/* Wheel: spokes, gold rim, rubber band and tread turn together. */}
      <Animated.View pointerEvents="none" style={[box, { transform: [{ rotate: spin }] }]}>
        {decor.spokes.map((sp) => (
          <View
            key={`s${sp.k}`}
            style={[s.spoke, sp.near ? s.spokeNear : s.spokeFar, { left: sp.left, top: sp.top, width: sp.len, transform: [{ rotate: `${sp.rot}deg` }] }]}
          />
        ))}
        {decor.spokes.map((sp) => (
          <View key={`n${sp.k}`} style={[s.nipple, { left: sp.nx - 3, top: sp.ny - 3 }]} />
        ))}
        <View style={[s.circle, { margin: BAND, borderRadius: R - BAND, borderWidth: RIM, borderColor: color.gold }]} />
        <View style={[s.circle, { margin: BAND + RIM, borderRadius: R - BAND - RIM, borderWidth: 3, borderColor: '#8C6D1F' }]} />
        <View style={[s.circle, { borderWidth: BAND, borderColor: '#161412' }]} />
        <View style={[s.circle, { margin: 18, borderRadius: R - 18, borderWidth: BAND - 36, borderColor: '#1E1B17' }]} />
        {decor.tread.map((d) => (
          <View key={`t${d}`} style={[s.spokeWrap, { transform: [{ rotate: `${d}deg` }] }]}>
            <View style={s.tread} />
          </View>
        ))}
        {/* White outline: outer edge of the tire and the bead where it meets the rim. */}
        <View style={[s.circle, s.outline]} />
        <View style={[s.circle, s.outline, { margin: BAND - 2, borderRadius: R - BAND + 2 }]} />
      </Animated.View>

      {/* Sidewall lettering: each year sits at its own angle relative to the pointer. */}
      {shown.map((i) => {
        const rot = angle.interpolate({
          inputRange: [i * STEP - 180, i * STEP + 180],
          outputRange: ['180deg', '-180deg'],
          extrapolate: 'clamp',
        });
        return (
          <Animated.View key={years[i]} pointerEvents="none" style={[box, { transform: [{ rotate: rot }] }]}>
            <View style={s.labelSlot}>
              <Text style={[s.year, i === center && s.yearOn]}>{years[i]}</Text>
            </View>
          </Animated.View>
        );
      })}

      {/* The tire curves away top and bottom. */}
      <LinearGradient
        pointerEvents="none"
        colors={[color.bg, 'rgba(11,10,8,0)', 'rgba(11,10,8,0)', color.bg]}
        locations={[0, 0.28, 0.72, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Gold pointer and window brackets at the reading position. */}
      <View pointerEvents="none" style={[s.window, { top: H / 2 - 34, left: cx + R_YEAR - 92, width: 184 }]} />
      <View pointerEvents="none" style={[s.pointer, { top: H / 2 - 14 }]} />
    </View>
  );
}

const s = StyleSheet.create({
  view: { width: '100%', overflow: 'hidden' },
  circle: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: R },
  spokeWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'flex-end', justifyContent: 'center' },
  spoke: { position: 'absolute', height: 2, borderRadius: 1 },
  spokeNear: { backgroundColor: 'rgba(222,225,230,0.9)' }, // chrome, outer flange
  spokeFar: { backgroundColor: 'rgba(150,154,162,0.75)' }, // inner flange, a shade back
  nipple: { position: 'absolute', width: 6, height: 6, borderRadius: 1, backgroundColor: '#C9CCD1' },
  outline: { borderWidth: 2, borderColor: 'rgba(242,236,222,0.9)' },
  tread: { width: 16, height: 18, marginRight: 2, backgroundColor: '#0A0908', borderRadius: 2 },
  labelSlot: { position: 'absolute', left: R + R_YEAR - 92, top: R - 28, width: 184, height: 56, alignItems: 'center', justifyContent: 'center' },
  year: {
    fontFamily: font.signBold,
    fontSize: 40,
    letterSpacing: 5,
    color: '#CFC6B0',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 2,
  },
  yearOn: { color: color.cream },
  window: { position: 'absolute', height: 68, borderTopWidth: 2, borderBottomWidth: 2, borderColor: color.gold },
  pointer: {
    position: 'absolute',
    right: 0,
    width: 0,
    height: 0,
    borderTopWidth: 14,
    borderBottomWidth: 14,
    borderRightWidth: 22,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: color.gold,
  },
});
