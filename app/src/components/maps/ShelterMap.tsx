import React, { useRef } from 'react';
import Constants from 'expo-constants';
import { Body } from '../common/ui';
import { View, Platform } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useTheme } from '../../hooks/useTheme';
import type { ShelterMapProps } from '../../utils/shelter';
export default function ShelterMap({ origin, destination, name }: ShelterMapProps) {
  const { dark, palette: c } = useTheme(); const ref = useRef<MapView>(null);
  if (Platform.OS === 'android' && Constants.executionEnvironment !== 'storeClient' && !Constants.expoConfig?.extra?.androidMapsConfigured) return <View style={{ minHeight: 160, justifyContent: 'center', padding: 24, backgroundColor: c.white }}><Body muted>Map preview is unavailable in this build. Use the shelter address or open it in your maps app.</Body></View>;
  return <View style={{ height: 300, backgroundColor: c.white, overflow: 'hidden' }} accessibilityLabel={'Map of assigned shelter and shared household location'}><MapView key={`${origin?.latitude}:${origin?.longitude}:${destination.latitude}:${destination.longitude}`} ref={ref} style={{ flex: 1 }} initialRegion={{ ...destination, latitudeDelta: 0.05, longitudeDelta: 0.05 }} userInterfaceStyle={dark ? 'dark' : 'light'} showsCompass showsPointsOfInterest={false} toolbarEnabled={false} showsUserLocation={false} onMapReady={() => { if (origin) ref.current?.fitToCoordinates([origin, destination], { edgePadding: { top: 64, right: 56, bottom: 64, left: 56 }, animated: false }); }}>
    {origin && <Marker coordinate={origin} title={'Shared household location'} pinColor={c.blue} />}
    <Marker coordinate={destination} title={name} description={'Assigned shelter — check availability before travelling'} pinColor={c.green} />
  </MapView></View>;
}
