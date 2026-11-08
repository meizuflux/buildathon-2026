// Sign in or create a family account.
import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { type } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';
import { Icon } from './Icon';
import { Action, InlineNotice, LinkButton, useDash } from './parts';

export function SignIn() {
  const { c, s } = useDash();
  const auth = useAuth();
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = !!email.trim() && password.length >= (register ? 8 : 1);

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try { await auth.authenticate(email, password, register); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in. Please try again.'); }
    finally { setBusy(false); }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.cream }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 24, width: '100%', maxWidth: 480, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center', gap: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="home" size={28} color={c.onPrimary} />
        </View>
        <Text accessibilityRole="header" aria-level={1} style={{ fontFamily: type.semibold, fontSize: 30, lineHeight: 36, color: c.ink }}>Haven</Text>
        <Text style={[s.secondary, { textAlign: 'center' }]}>Your household’s shelter plan, updates and coordination desk.</Text>
      </View>
      <View style={[s.panel, { gap: 16 }]}>
        <Text accessibilityRole="header" aria-level={2} style={s.h2}>{register ? 'Create your account' : 'Sign in'}</Text>
        <View style={{ gap: 6 }}>
          <Text style={s.strong}>Email</Text>
          <TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none"
            autoCorrect={false} autoComplete="email" editable={!busy} style={s.input} onSubmitEditing={() => { void submit(); }} />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={s.strong}>Password</Text>
          <TextInput accessibilityLabel="Password" value={password} onChangeText={setPassword} secureTextEntry
            autoComplete={register ? 'new-password' : 'current-password'} editable={!busy} style={s.input} onSubmitEditing={() => { void submit(); }} />
          {register && <Text style={s.secondary}>Use at least 8 characters.</Text>}
        </View>
        {!!(error || auth.error) && <InlineNotice tone="critical" icon="alert-circle">{error || auth.error}</InlineNotice>}
        <Action title={register ? 'Create account' : 'Sign in'} onPress={() => { void submit(); }} disabled={!ready} busy={busy} />
        <View style={{ alignItems: 'center' }}>
          <LinkButton title={register ? 'I already have an account' : 'Create an account'} onPress={() => { setRegister(!register); setError(''); }} disabled={busy} />
        </View>
      </View>
    </ScrollView>
  );
}
