import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { Page, Body, Button, Notice, Row, useUI } from '../common/ui';
export function SignIn() {
  const { s } = useUI(); const auth = useAuth();
  const [register, setRegister] = useState(false); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit() { setError(''); setBusy(true); try { await auth.authenticate(email, password, register); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in.'); } finally { setBusy(false); } }
  return <Page title={register ? 'Create your account' : 'Sign in to Haven'}><Body muted>Your account connects your household to its shelter assignment and coordination team.</Body><View style={{ gap: 12 }}><Text style={s.fieldLabel}>Email</Text><TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" style={s.input} editable={!busy} /><Text style={s.fieldLabel}>Password</Text><TextInput accessibilityLabel="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={register ? 'new-password' : 'current-password'} style={s.input} editable={!busy} />{register && <Text style={s.caption}>Use at least 8 characters.</Text>}<Row><Button title={register ? 'Create account' : 'Sign in'} onPress={() => void submit()} disabled={!email.trim() || password.length < (register ? 8 : 1)} busy={busy} /><Button title={register ? 'I have an account' : 'Create an account'} variant="ghost" disabled={busy} onPress={() => { setRegister(!register); setError(''); }} /></Row>{!!(error || auth.error) && <Notice danger>{error || auth.error}</Notice>}</View></Page>;
}
