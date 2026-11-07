import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { API_BASE, DEMO_CENTER } from './api';
import MyActivity from './MyActivity';
import NearbyHubs from './NearbyHubs';
import PledgeForm from './PledgeForm';
import RequestForm from './RequestForm';
import { Chip, colors } from './shared';

const TABS = [
  ['hubs', 'Find hubs'],
  ['request', 'Request supplies'],
  ['activity', 'My activity'],
];

/**
 * The full citizen donations tab: find hubs, pledge drop-offs, request supplies, track both.
 * Props: token (family login), lat, lng, apiBase.
 */
export default function CitizenDonations({ token, lat = DEMO_CENTER.lat, lng = DEMO_CENTER.lng, apiBase = API_BASE }) {
  const [tab, setTab] = useState('hubs');
  const [pledgeHub, setPledgeHub] = useState(null);

  let body;
  if (tab === 'hubs' && pledgeHub) {
    body = (
      <PledgeForm
        hub={pledgeHub}
        token={token}
        apiBase={apiBase}
        onCancel={() => setPledgeHub(null)}
        onDone={() => {
          setPledgeHub(null);
          setTab('activity');
        }}
      />
    );
  } else if (tab === 'hubs') {
    body = <NearbyHubs lat={lat} lng={lng} apiBase={apiBase} onSelectHub={setPledgeHub} actionLabel="Pledge a drop-off" />;
  } else if (tab === 'request') {
    body = <RequestForm token={token} lat={lat} lng={lng} apiBase={apiBase} onDone={() => setTab('activity')} />;
  } else {
    body = <MyActivity token={token} apiBase={apiBase} />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {TABS.map(([key, label]) => (
          <Chip
            key={key}
            label={label}
            active={tab === key}
            onPress={() => {
              setTab(key);
              setPledgeHub(null);
            }}
          />
        ))}
      </View>
      <View style={styles.body}>{body}</View>
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
