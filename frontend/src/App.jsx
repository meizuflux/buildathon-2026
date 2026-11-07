import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import { DataProvider } from './data.jsx'
import Login from './components/Login.jsx'
import Layout from './components/Layout.jsx'
import CommandCenter from './pages/CommandCenter.jsx'
import Alerts from './pages/Alerts.jsx'
import MapPage from './pages/MapPage.jsx'
import Broadcasts from './pages/Broadcasts.jsx'
import Needs from './pages/Needs.jsx'
import Dispatch from './pages/Dispatch.jsx'
import Inventory from './pages/Inventory.jsx'
import Organizations from './pages/Organizations.jsx'
import OrganizationDetail from './pages/OrganizationDetail.jsx'

export default function App() {
  const { user } = useAuth()
  if (!user) return <Login />
  return (
    <DataProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<CommandCenter />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="map" element={<MapPage />} />
          <Route path="citizens" element={<Unavailable name="Citizen assistance" />} />
          <Route path="comms" element={<Navigate to="/comms/broadcasts" replace />} />
          <Route path="comms/broadcasts" element={<Broadcasts />} />
          <Route path="logistics" element={<Navigate to="/logistics/needs" replace />} />
          <Route path="logistics/needs" element={<Needs />} />
          <Route path="logistics/dispatch" element={<Dispatch />} />
          <Route path="logistics/inventory" element={<Inventory />} />
          <Route path="organizations" element={<Organizations />} />
          <Route path="organizations/:id" element={<OrganizationDetail />} />
          <Route path="partners" element={<Unavailable name="Partner accounts" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DataProvider>
  )
}

function Unavailable({ name }) {
  return <div className="page"><h1>{name}</h1><p>This feature is unavailable with the current server.</p></div>
}
