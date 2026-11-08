import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useUI } from '../common/ui';
import { searchAddresses, type AddressSuggestion } from '../../services/addressSearch';

export function AddressAutocomplete({ value, onChangeText, onSelect }: {
  value: string;
  onChangeText: (value: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
}) {
  const { c, s } = useUI();
  const [active, setActive] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const query = value.trim();
    if (!active || query.length < 4) {
      setSuggestions([]);
      setLoading(false);
      setError('');
      return;
    }

    const controller = new AbortController();
    let current = true;
    const timeout = setTimeout(() => {
      setLoading(true);
      setError('');
      void searchAddresses(query, controller.signal).then(results => {
        if (current) setSuggestions(results);
      }).catch(() => {
        if (current && !controller.signal.aborted) setError('Address suggestions could not be loaded. You can keep entering the address.');
      }).finally(() => {
        if (current) setLoading(false);
      });
    }, 400);

    return () => {
      current = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [active, value]);

  return <View style={{ gap: 6 }}>
    <TextInput
      accessibilityLabel="Full home address"
      value={value}
      onFocus={() => setActive(true)}
      onChangeText={text => { setActive(true); onChangeText(text); }}
      placeholder="Start typing a street address"
      placeholderTextColor={c.muted}
      autoComplete="street-address"
      style={s.input}
    />
    <Text style={s.caption}>Address suggestions by OpenStreetMap (Photon). Your search text is sent to the lookup service.</Text>
    {loading && <Text style={s.caption}>Searching addresses…</Text>}
    {!!error && <Text style={s.caption}>{error}</Text>}
    {suggestions.length > 0 && <View accessibilityRole="list" style={{ borderWidth: 1, borderColor: c.border, borderRadius: 8, backgroundColor: c.white, overflow: 'hidden' }}>
      {suggestions.map((suggestion, index) => <Pressable
        key={`${suggestion.latitude}:${suggestion.longitude}:${suggestion.label}`}
        accessibilityRole="button"
        accessibilityLabel={`Use address ${suggestion.label}`}
        onPress={() => { setActive(false); setSuggestions([]); onSelect(suggestion); }}
        style={({ pressed }) => ({ minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: index < suggestions.length - 1 ? 1 : 0, borderBottomColor: c.border, backgroundColor: pressed ? c.greenLight : c.white })}>
        <Text style={{ color: c.ink, fontFamily: s.fieldLabel.fontFamily, fontSize: 14, lineHeight: 19 }}>{suggestion.label}</Text>
      </Pressable>)}
    </View>}
  </View>;
}