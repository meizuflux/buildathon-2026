import { useState } from 'react';
import HubInventoryEditor from './HubInventoryEditor';
import OverCapacityHubs from './OverCapacityHubs';

/** Complete donations tab for the dashboard. Props: token (operator bearer token), apiBase. */
export default function DonationsTab({ token, apiBase }) {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <OverCapacityHubs key={refreshKey} token={token} apiBase={apiBase} />
      <HubInventoryEditor token={token} apiBase={apiBase} onSaved={() => setRefreshKey((k) => k + 1)} />
    </div>
  );
}
