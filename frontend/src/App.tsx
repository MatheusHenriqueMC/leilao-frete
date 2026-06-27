import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage              from './pages/LoginPage'
import AdminDashboard         from './pages/AdminDashboard'
import AdminPage              from './pages/AdminPage'
import TransportadoraDashboard from './pages/TransportadoraDashboard'
import AuctionPage            from './pages/AuctionPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                    element={<LoginPage />} />
        <Route path="/admin"               element={<AdminDashboard />} />
        <Route path="/admin/leilao/:id"    element={<AdminPage />} />
        <Route path="/transportadora"      element={<TransportadoraDashboard />} />
        <Route path="/leilao/:id"          element={<AuctionPage />} />
        <Route path="*"                    element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
