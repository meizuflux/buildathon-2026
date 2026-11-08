import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import { DataProvider } from './data.jsx'
import Login from './components/Login.jsx'
import Layout from './components/Layout.jsx'
import CommandCenter from './pages/CommandCenter.jsx'
import Alerts from './pages/Alerts.jsx'
import Families from './pages/Families.jsx'
import FamilyDetail from './pages/FamilyDetail.jsx'
import MapPage from './pages/MapPage.jsx'
import Broadcasts from './pages/Broadcasts.jsx'
import FamilyReports from './pages/FamilyReports.jsx'
import Logistics from './pages/Logistics.jsx'

export default function App() {
  const { user } = useAuth()
  if (!user) return <Login />
  return (
    <DataProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<CommandCenter />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="families" element={<Families />} />
          <Route path="families/:id" element={<FamilyDetail />} />
          <Route path="map" element={<MapPage />} />
          <Route path="comms" element={<Navigate to="/comms/broadcasts" replace />} />
          <Route path="comms/broadcasts" element={<Broadcasts />} />
          <Route path="comms/reports" element={<FamilyReports />} />
          <Route path="logistics" element={<Navigate to="/logistics/needs" replace />} />
          <Route path="logistics/needs" element={<Logistics section="needs" />} />
          <Route path="logistics/dispatch" element={<Logistics section="dispatch" />} />
          <Route path="logistics/inventory" element={<Logistics section="inventory" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DataProvider>
  )
}
