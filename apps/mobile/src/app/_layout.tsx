import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Oswald_400Regular, Oswald_600SemiBold, Oswald_700Bold } from '@expo-google-fonts/oswald';
import { CourierPrime_400Regular, CourierPrime_700Bold } from '@expo-google-fonts/courier-prime';
import { Bangers_400Regular } from '@expo-google-fonts/bangers';
import { Rye_400Regular } from '@expo-google-fonts/rye';
import { View } from 'react-native';
import { BikeProvider } from '@/lib/bike';
import { font, ThemeProvider, useTheme } from '@/lib/theme';

// Keep the native splash (black + gold lockup) up until the fonts are ready.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    Oswald_400Regular,
    Oswald_600SemiBold,
    Oswald_700Bold,
    CourierPrime_400Regular,
    CourierPrime_700Bold,
    Bangers_400Regular,
    Rye_400Regular,
  });
  return (
    <ThemeProvider>
      <Root fontsReady={loaded} />
    </ThemeProvider>
  );
}

function Root({ fontsReady }: { fontsReady: boolean }) {
  const { color, scheme, ready } = useTheme();
  const loaded = fontsReady && ready; // fonts plus the saved light/dark choice
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);
  if (!loaded) return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  return (
    <BikeProvider>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: color.bg },
          headerTintColor: color.accent,
          headerTitleStyle: { fontFamily: font.sign, fontSize: 26, color: color.text },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: color.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'HD CHOP' }} />
        <Stack.Screen name="models/[year]" options={{ title: 'Pick model' }} />
        <Stack.Screen name="search" options={{ title: 'Parts counter' }} />
        <Stack.Screen name="results" options={{ title: 'Results' }} />
        <Stack.Screen name="part/[oem]" options={{ title: 'Part' }} />
        <Stack.Screen name="family/index" options={{ title: 'Families' }} />
        <Stack.Screen name="family/[key]" options={{ title: 'Family' }} />
      </Stack>
    </BikeProvider>
  );
}
