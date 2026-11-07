import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { API_BASE } from './api';
import DonateForm from './DonateForm';
import MyActivity from './MyActivity';
import RequestForm from './RequestForm';
import { Chip, colors } from './shared';
import useDeviceLocation from './useDeviceLocation';

const TABS = [
  ['donate', 'Donate'],
  ['request', 'Request supplies'],
  ['activity', 'My activity'],
];

/**
 * The citizen donations tab: donate, request supplies, and track both. The system matches every
 * donation and request to the best hub; citizens never pick one. Location comes from device GPS.
 * Props: token (family login), apiBase, location ({ lat, lng } to simulate a position instead of GPS).
 */
export default function CitizenDonations({ token, apiBase = API_BASE, location }) {
  const [tab, setTab] = useState('donate');
  const place = useDeviceLocation(location);
  const showActivity = () => setTab('activity');

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {TABS.map(([key, label]) => (
          <Chip key={key} label={label} active={tab === key} onPress={() => setTab(key)} />
        ))}
      </View>
      <View style={styles.body}>
        {tab === 'donate' && <DonateForm token={token} apiBase={apiBase} place={place} onDone={showActivity} />}
        {tab === 'request' && <RequestForm token={token} apiBase={apiBase} place={place} onDone={showActivity} />}
        {tab === 'activity' && <MyActivity token={token} apiBase={apiBase} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9fafb' },
  tabs: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, flexWrap: 'wrap',
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#fff',
  },
  body: { flex: 1 },
});
