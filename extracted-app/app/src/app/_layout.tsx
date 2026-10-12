import { Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';
import { router, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useGame } from '../store/game';
import { colors } from '../theme';

/**
 * The room's status decides the screen: lobby -> /lobby, any game phase -> /game,
 * no room -> home. Screens only call actions; navigation follows the server.
 */
function useRoomNavigation(enabled: boolean) {
  const pathname = usePathname();
  const status = useGame((s) => s.room?.status ?? null);

  useEffect(() => {
    if (!enabled) return;
    if (status) {
      const target = status === 'lobby' ? '/lobby' : '/game';
      if (pathname !== target) router.replace(target);
    } else if (pathname === '/lobby' || pathname === '/game') {
      router.replace('/');
    }
  }, [enabled, status, pathname]);
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });
  useRoomNavigation(fontsLoaded);

  if (!fontsLoaded) return null;
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ground } }}>
        <Stack.Screen name="lobby" options={{ gestureEnabled: false }} />
        <Stack.Screen name="game" options={{ gestureEnabled: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
