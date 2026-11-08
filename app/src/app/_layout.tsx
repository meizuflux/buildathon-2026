import React from 'react';
import { useFonts } from 'expo-font';
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular';
import { ActivityIndicator, Text, View } from 'react-native';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import '../styles/web.css';
import { AuthProvider } from '../hooks/useAuth';
import { ThemeProvider, useTheme } from '../hooks/useTheme';

export default function RootLayout() {
  return <ThemeProvider><Application /></ThemeProvider>;
}

function Application() {
  const { palette: c, dark } = useTheme();
  const [loaded, error] = useFonts({ IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold, IBMPlexMono_400Regular });
  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: c.cream, alignItems: 'center', justifyContent: 'center' }}>
        {error ? <Text style={{ color: c.text }}>Unable to load fonts. Please restart Haven.</Text> : <ActivityIndicator color={c.green} />}
      </View>
    );
  }
  return (
    <SafeAreaProvider>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <AuthProvider><Slot /></AuthProvider>
    </SafeAreaProvider>
  );
}
