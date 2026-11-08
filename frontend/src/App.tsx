import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { DataProvider } from './data'
import Login from './components/Login'
import Layout from './components/Layout'
import CommandCenter from './pages/CommandCenter'
import Alerts from './pages/Alerts'
import Families from './pages/Families'
import FamilyDetail from './pages/FamilyDetail'
import MapPage from './pages/MapPage'
import Broadcasts from './pages/Broadcasts'
import FamilyReports from './pages/FamilyReports'
import Logistics from './pages/Logistics'
import EvacuationPreview from './pages/EvacuationPreview'

export default function App() {
  const { user } = useAuth()
  if (!user) return <Login />
  return (
    <DataProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<CommandCenter />} />
          <Route path="evacuation-preview" element={<EvacuationPreview />} />
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
