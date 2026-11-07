import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { API_BASE } from './api';
import MyActivity from './MyActivity';
import NearbyHubs from './NearbyHubs';
import PledgeForm from './PledgeForm';
import RequestForm from './RequestForm';
import { Button, Chip, colors } from './shared';
import useDeviceLocation from './useDeviceLocation';

const TABS = [
  ['hubs', 'Find hubs'],
  ['request', 'Request supplies'],
  ['activity', 'My activity'],
];

function NeedsLocation({ place }) {
  return (
    <View style={styles.center}>
      {place.status === 'locating' ? (
        <>
          <ActivityIndicator />
          <Text style={styles.meta}>Finding your location…</Text>
        </>
      ) : (
        <>
          <Text style={styles.error}>{place.error}</Text>
          <Button title="Try again" onPress={place.retry} />
        </>
      )}
    </View>
  );
}

/**
 * The full citizen donations tab: find hubs, pledge drop-offs, request supplies, track both.
 * Location comes from the device GPS.
 * Props: token (family login), apiBase, location ({ lat, lng } to simulate a position instead of GPS).
 */
export default function CitizenDonations({ token, apiBase = API_BASE, location }) {
  const [tab, setTab] = useState('hubs');
  const [pledgeHub, setPledgeHub] = useState(null);
  const place = useDeviceLocation(location);

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
    body =
      place.status === 'ready' ? (
        <NearbyHubs
          lat={place.coords.lat}
          lng={place.coords.lng}
          apiBase={apiBase}
          onSelectHub={setPledgeHub}
          actionLabel="Pledge a drop-off"
        />
      ) : (
        <NeedsLocation place={place} />
      );
  } else if (tab === 'request') {
    body = <RequestForm token={token} apiBase={apiBase} place={place} onDone={() => setTab('activity')} />;
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  meta: { fontSize: 14, color: colors.muted },
  error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
});
