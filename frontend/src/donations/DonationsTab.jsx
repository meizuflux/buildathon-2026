import { useState } from 'react';
import CustomReview from './CustomReview';
import HubInventoryEditor from './HubInventoryEditor';
import HubMap from './HubMap';
import MyAssignments from './MyAssignments';
import OverCapacityHubs from './OverCapacityHubs';
import RequestQueue from './RequestQueue';

const VIEWS = [
  ['hubs', 'Hubs & transport'],
  ['requests', 'Citizen requests'],
  ['custom', 'Custom items'],
  ['inventory', 'Edit a hub'],
];

/**
 * Government donations tab: hub map and over-capacity dispatch, the citizen request queue
 * with the worker's own assignments, custom item review, and a hub inventory editor.
 * Props: token (operator bearer token), apiBase.
 */
export default function DonationsTab({ token, apiBase }) {
  const [view, setView] = useState('hubs');
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2">
        {VIEWS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              view === key ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {view === 'hubs' && (
        <div className="space-y-4">
          <HubMap token={token} apiBase={apiBase} refreshKey={refreshKey} />
          <OverCapacityHubs key={refreshKey} token={token} apiBase={apiBase} />
        </div>
      )}
      {view === 'requests' && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <RequestQueue token={token} apiBase={apiBase} onClaimed={bump} />
          <MyAssignments token={token} apiBase={apiBase} refreshKey={refreshKey} onChange={bump} />
        </div>
      )}
      {view === 'custom' && <CustomReview token={token} apiBase={apiBase} />}
      {view === 'inventory' && <HubInventoryEditor token={token} apiBase={apiBase} onSaved={bump} />}
    </div>
  );
}
