import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import { DataProvider, useData } from './data.jsx'
import Layout from './components/Layout.jsx'
import { FirstLogin, Login } from './pages/Login.jsx'
import Overview from './pages/Overview.jsx'
import StatusPage from './pages/StatusPage.jsx'
import Inventory from './pages/Inventory.jsx'
import Shipments from './pages/Shipments.jsx'
import Requests from './pages/Requests.jsx'
import HelpNearby from './pages/HelpNearby.jsx'
import Citizens from './pages/Citizens.jsx'
import Messages from './pages/Messages.jsx'
import Updates from './pages/Updates.jsx'
import Account from './pages/Account.jsx'

export default function App() {
  const { user } = useAuth()
  if (!user) return <Login />
  if (user.must_change_password) return <FirstLogin />
  return (
    <DataProvider>
      <PortalRoutes />
    </DataProvider>
  )
}

function PortalRoutes() {
  const { isOrg } = useData()
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        {isOrg ? <Route path="inventory" element={<Inventory />} /> : <Route path="status" element={<StatusPage />} />}
        <Route path="shipments" element={<Shipments />} />
        <Route path="requests" element={<Requests />} />
        {isOrg && <Route path="help" element={<HelpNearby />} />}
        {isOrg && <Route path="citizens" element={<Citizens />} />}
        <Route path="messages" element={<Messages />} />
        <Route path="messages/:id" element={<Messages />} />
        <Route path="updates" element={<Updates />} />
        <Route path="account" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
