import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SignIn } from '../components/resident/SignIn';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { ResidentProvider } from '../resident/provider';
import ResidentApp from '../screens/ResidentApp';

export default function Index() {
  const { palette: c } = useTheme();
  const auth = useAuth();
  if (!auth.ready) return <View style={{ flex: 1, backgroundColor: c.cream, justifyContent: 'center' }}><ActivityIndicator color={c.green} /></View>;
  if (!auth.user) return <SignIn />;
  return <ResidentProvider key={auth.user.id}><ResidentApp /></ResidentProvider>;
}
