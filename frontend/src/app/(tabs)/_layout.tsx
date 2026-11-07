import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, type IconName , useUI } from '../../components/common/ui';
import { type } from '../../constants/theme';
const items: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Nearby', icon: 'navigation' },
  { name: 'plan', title: 'My plan', icon: 'map' },
  { name: 'assistance', title: 'Support', icon: 'life-buoy' },
  { name: 'updates', title: 'Updates', icon: 'radio' },
  { name: 'profile', title: 'Household', icon: 'users' },
];
export default function TabsLayout() { const { c, s } = useUI();
  return <View style={{ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: c.cream }}><Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.cream } }} tabBar={({ state, navigation }) => <SafeAreaView edges={['bottom']} style={{ backgroundColor: c.cream }}><View style={{ paddingHorizontal: 8, paddingVertical: 8, flexDirection: 'row' }}>
    {items.map(item => { const route = state.routes.find(r => r.name === item.name); const selected = state.routes[state.index]?.name === item.name; return <Pressable key={item.name} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={item.title} onPress={() => { if (!route) return; const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true }); if (!event.defaultPrevented) navigation.navigate(item.name); }} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.65 : 1 })}><Icon name={item.icon} size={20} color={selected ? c.green : c.muted} /><Text style={{ fontFamily: selected ? type.semibold : type.family, fontSize: 11, color: selected ? c.green : c.muted }}>{item.title}</Text></Pressable>; })}
  </View></SafeAreaView>}>
    {items.map(item => <Tabs.Screen key={item.name} name={item.name} options={{ title: item.title }} />)}
  </Tabs></View>;
}
