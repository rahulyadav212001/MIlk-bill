import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { paperTheme } from '../constants/theme';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { ensureAuthenticatedUserId } from '../services/firebase';
import { AnimatedSplashScreen } from '../components/AnimatedSplashScreen';

// Keep native splash screen visible while app initializes
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    async function prepare() {
      try {
        // Eager background authentication on startup - zero login screens required
        await ensureAuthenticatedUserId().catch(() => {});
      } catch (e) {
        console.warn('App initialization error:', e);
      } finally {
        setAppIsReady(true);
        // Hide the native splash screen so AnimatedSplashScreen displays smoothly
        await SplashScreen.hideAsync().catch(() => {});
      }
    }
    prepare();
  }, []);

  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="supplier/buy"
            options={{
              headerShown: false,
              presentation: 'card',
            }}
          />
          <Stack.Screen
            name="supplier/sell"
            options={{
              headerShown: false,
              presentation: 'card',
            }}
          />
          <Stack.Screen
            name="supplier/[id]/history"
            options={{
              headerShown: false,
              presentation: 'card',
            }}
          />
          <Stack.Screen
            name="customer/[id]/history"
            options={{
              headerShown: false,
              presentation: 'card',
            }}
          />
          <Stack.Screen
            name="customer/daily-supply-summary"
            options={{
              headerShown: false,
              presentation: 'card',
            }}
          />
        </Stack>

        {showSplash && (
          <AnimatedSplashScreen
            isAppReady={appIsReady}
            onAnimationComplete={() => setShowSplash(false)}
          />
        )}
      </PaperProvider>
    </SafeAreaProvider>
  );
}
