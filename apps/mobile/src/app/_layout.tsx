import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Oswald_400Regular, Oswald_600SemiBold, Oswald_700Bold } from '@expo-google-fonts/oswald';
import { CourierPrime_400Regular, CourierPrime_700Bold } from '@expo-google-fonts/courier-prime';
import { View } from 'react-native';
import { BikeProvider } from '@/lib/bike';
import { color, font } from '@/lib/theme';

export default function RootLayout() {
  const [loaded] = useFonts({ Oswald_400Regular, Oswald_600SemiBold, Oswald_700Bold, CourierPrime_400Regular, CourierPrime_700Bold });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  return (
    <BikeProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: color.bg },
          headerTintColor: color.gold,
          headerTitleStyle: { fontFamily: font.sign, fontSize: 20, color: color.cream },
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
      </Stack>
    </BikeProvider>
  );
}
