import React from 'react';
import { useFonts } from 'expo-font';
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';
import { ActivityIndicator, View, Text } from 'react-native';
import '../styles/web.css';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { SignIn } from '../components/auth/SignIn';
import { config } from '../constants/config';
import { SyncProvider } from '../hooks/useSync';
import { ThemeProvider, useTheme } from '../hooks/useTheme';
import { DemoProvider } from '../demo/store';
import { LiveProvider } from '../demo/liveStore';
import PlanDashboard from '../screens/PlanDashboard';
export const unstable_settings = { initialRouteName: '(tabs)' };
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: 1, gcTime: 24 * 60 * 60 * 1000 }, mutations: { retry: false } } });
export default function RootLayout() { return <ThemeProvider><Application /></ThemeProvider>; }
function Application() {
  const { palette: colors, dark } = useTheme();
  const [loaded, error] = useFonts({ IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold, IBMPlexMono_400Regular, IBMPlexMono_500Medium });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', gap: 16 }}>{error ? <Text>Unable to load fonts. Please restart Haven.</Text> : <ActivityIndicator color={colors.green} />}</View>;
  return <SafeAreaProvider><QueryClientProvider client={client}><AuthProvider><SessionApp /></AuthProvider></QueryClientProvider></SafeAreaProvider>; }
function SessionApp() {
  const { palette: colors, dark } = useTheme(); const auth = useAuth();
  if (!auth.ready) return <View style={{ flex: 1, backgroundColor: colors.cream, justifyContent: 'center' }}><ActivityIndicator color={colors.green} /></View>;
  // Demo mode: the resident dashboard is the whole app, with simulated data and no sign-in.
  if (config.mode === 'mock') return <><StatusBar style={dark ? 'light' : 'dark'} /><DemoProvider><PlanDashboard /></DemoProvider></>;
  if (config.mode === 'api' && !auth.user) return <><StatusBar style={dark ? 'light' : 'dark'} /><SignIn /></>;
  if (config.residentDashboard) return <><StatusBar style={dark ? 'light' : 'dark'} /><LiveProvider key={auth.user?.id}><PlanDashboard /></LiveProvider></>;
  return <SyncProvider key={auth.user?.id ?? 'local'}><StatusBar style={dark ? 'light' : 'dark'} /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }}><Stack.Screen name="(tabs)" /><Stack.Screen name="(onboarding)/index" options={{ presentation: 'modal' }} /><Stack.Screen name="assistance/new" options={{ presentation: 'modal' }} /><Stack.Screen name="reports/index" options={{ presentation: 'modal' }} /></Stack></SyncProvider>; }
