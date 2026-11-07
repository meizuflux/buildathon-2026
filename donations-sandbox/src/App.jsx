import { useState } from 'react';
import CitizenDonations from '../../app/src/donations/CitizenDonations';
import DonationsTab from '../../frontend/src/donations/DonationsTab';
import HubStaffConsole from '../../frontend/src/donations/HubStaffConsole';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000';

const STAFF = [
  ['staff.istiqlal@demo.example', 'Masjid Istiqlal'],
  ['staff.damkar-tanah-abang@demo.example', 'Pos Damkar Tanah Abang'],
  ['staff.gor-senen@demo.example', 'GOR Senen'],
  ['staff.sman-8@demo.example', 'SMA Negeri 8 Jakarta'],
  ['staff.gereja-kelapa-gading@demo.example', 'Gereja Santo Yakobus'],
  ['staff.damkar-penjaringan@demo.example', 'Pos Damkar Penjaringan'],
  ['staff.kampung-melayu@demo.example', 'Balai Warga Kampung Melayu'],
];

// A household in Bukit Duri, a flood-prone Jakarta neighbourhood, for demos run outside Jakarta.
const JAKARTA = { lat: -6.2235, lng: 106.8585 };
const JAKARTA_LABEL = 'Bukit Duri, Jakarta';

const ROLES = {
  citizen: { label: 'Citizen app', role: 'family', email: 'family@demo.example' },
  staff: { label: 'Hub staff', role: 'hub_staff', email: STAFF[0][0] },
  government: { label: 'Government dashboard', role: 'operator', email: 'government@demo.example' },
};

function loadSession(key) {
  try {
    return JSON.parse(localStorage.getItem(`haven-sandbox-${key}`)) ?? null;
  } catch {
    return null;
  }
}

function saveSession(key, session) {
  try {
    if (session) localStorage.setItem(`haven-sandbox-${key}`, JSON.stringify(session));
    else localStorage.removeItem(`haven-sandbox-${key}`);
  } catch {
    // storage unavailable; the session lasts until reload
  }
}

function LoginForm({ config, onLogin }) {
  const [email, setEmail] = useState(config.email);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? 'Login failed');
      if (body.user.role !== config.role) throw new Error(`That account is a ${body.user.role}, not ${config.role}.`);
      onLogin({ token: body.access_token, user: body.user, email });
    } catch (e) {
      setError(e.message === 'Failed to fetch' ? `Can't reach the API at ${API_BASE}. Is \`just dev\` running?` : e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Sign in: {config.label}</h2>
      {config.role === 'hub_staff' ? (
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Hub</span>
          <select value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2">
            {STAFF.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" />
        </label>
      )}
      <label className="block text-sm">
        <span className="font-medium text-gray-700">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </label>
      <p className="text-xs text-gray-500">
        Seed with <code>DEMO_PASSWORD=… just demo-data</code> to give every demo account the same password.
      </p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function App() {
  const [tab, setTab] = useState('citizen');
  const [simulateJakarta, setSimulateJakarta] = useState(true);
  const [sessions, setSessions] = useState(() => Object.fromEntries(Object.keys(ROLES).map((k) => [k, loadSession(k)])));
  const session = sessions[tab];

  const setSession = (key, value) => {
    saveSession(key, value);
    setSessions((s) => ({ ...s, [key]: value }));
  };

  let content;
  if (!session) {
    content = <LoginForm key={tab} config={ROLES[tab]} onLogin={(s) => setSession(tab, s)} />;
  } else if (tab === 'citizen') {
    content = (
      <div className="space-y-3">
        <div className="flex justify-center gap-2 text-sm">
          <span className="py-1 text-gray-600">Phone location:</span>
          {[
            [true, `Simulated (${JAKARTA_LABEL})`],
            [false, 'Real device GPS'],
          ].map(([value, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setSimulateJakarta(value)}
              className={`rounded-md px-3 py-1 ${simulateJakarta === value ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="phone mx-auto flex h-[760px] w-[390px] overflow-hidden rounded-[2.5rem] border-[10px] border-gray-900 bg-white shadow-xl">
          <CitizenDonations
            key={String(simulateJakarta)}
            token={session.token}
            apiBase={API_BASE}
            location={simulateJakarta ? JAKARTA : undefined}
          />
        </div>
      </div>
    );
  } else if (tab === 'staff') {
    content = <HubStaffConsole key={session.user.hub_id} hubId={session.user.hub_id} token={session.token} apiBase={API_BASE} />;
  } else {
    content = <DonationsTab token={session.token} apiBase={API_BASE} />;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="font-bold text-gray-900">Haven donations sandbox</span>
          <nav className="flex flex-wrap gap-1">
            {Object.entries(ROLES).map(([key, config]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === key ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                {config.label}
              </button>
            ))}
          </nav>
          {session && (
            <span className="ml-auto flex items-center gap-2 text-sm text-gray-600">
              {session.email}
              <button type="button" onClick={() => setSession(tab, null)} className="text-blue-700 hover:underline">
                Sign out
              </button>
            </span>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{content}</main>
    </div>
  );
}
