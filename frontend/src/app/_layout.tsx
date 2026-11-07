import React from 'react';
import { useFonts } from 'expo-font';
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';
import { ActivityIndicator, View, Text } from 'react-native';
import '../styles/web.css';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SyncProvider } from '../hooks/useSync';
import { ThemeProvider, useTheme } from '../hooks/useTheme';
export const unstable_settings = { initialRouteName: '(tabs)' };
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: 1, gcTime: 24 * 60 * 60 * 1000 }, mutations: { retry: false } } });
export default function RootLayout() { return <ThemeProvider><Application /></ThemeProvider>; }
function Application() {
  const { palette: colors, dark } = useTheme();
  const [loaded, error] = useFonts({ IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold, IBMPlexMono_500Medium });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', gap: 16 }}>{error ? <Text>Unable to load fonts. Please restart Haven.</Text> : <ActivityIndicator color={colors.green} />}</View>;
  return <SafeAreaProvider><QueryClientProvider client={client}><SyncProvider><StatusBar style={dark ? 'light' : 'dark'} /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }}><Stack.Screen name="(tabs)" /><Stack.Screen name="(onboarding)/index" options={{ presentation: 'modal' }} /><Stack.Screen name="assistance/new" options={{ presentation: 'modal' }} /><Stack.Screen name="reports/index" options={{ presentation: 'modal' }} /></Stack></SyncProvider></QueryClientProvider></SafeAreaProvider>; }
