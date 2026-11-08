import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, type IconName , useUI } from '../../components/common/ui';
import { type } from '../../constants/theme';
const items: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Nearby', icon: 'map-pin' },
  { name: 'assistance', title: 'Support', icon: 'plus-square' },
  { name: 'plan', title: 'My Plan', icon: 'home' },
  { name: 'updates', title: 'Updates', icon: 'radio' },
  { name: 'profile', title: 'Household', icon: 'users' },
];
export default function TabsLayout() { const { c, s } = useUI();
  return <View style={{ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: c.cream }}><Tabs initialRouteName="plan" screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.cream } }} tabBar={({ state, navigation }) => <SafeAreaView edges={['bottom']} style={{ backgroundColor: c.white, borderTopWidth: 1, borderTopColor: c.border }}><View style={{ paddingHorizontal: 4, paddingVertical: 4, flexDirection: 'row' }}>
    {items.map(item => { const route = state.routes.find(r => r.name === item.name); const selected = state.routes[state.index]?.name === item.name; return <Pressable key={item.name} role="tab" accessibilityRole="tab" aria-selected={selected} accessibilityState={{ selected }} accessibilityLabel={item.title} onPress={() => { if (!route) return; const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true }); if (!event.defaultPrevented) navigation.navigate(item.name); }} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.65 : 1 })}><Icon name={item.icon} size={19} color={selected ? c.green : c.muted} /><Text style={{ fontFamily: selected ? type.semibold : type.family, fontSize: 10, color: selected ? c.green : c.muted }}>{item.title}</Text></Pressable>; })}
  </View></SafeAreaView>}>
    {items.map(item => <Tabs.Screen key={item.name} name={item.name} options={{ title: item.title }} />)}
  </Tabs></View>;
}
