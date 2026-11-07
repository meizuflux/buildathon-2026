import React from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SyncProvider } from '../hooks/useSync';
import { colors } from '../constants/theme';
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: 1, gcTime: 24 * 60 * 60 * 1000 }, mutations: { retry: false } } });
export default function RootLayout() { return <SafeAreaProvider><QueryClientProvider client={client}><SyncProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }}><Stack.Screen name="(tabs)" /><Stack.Screen name="(onboarding)/index" options={{ presentation: 'modal' }} /><Stack.Screen name="assistance/new" options={{ presentation: 'modal' }} /><Stack.Screen name="reports/index" options={{ presentation: 'modal' }} /></Stack></SyncProvider></QueryClientProvider></SafeAreaProvider>; }
