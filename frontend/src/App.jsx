import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ClassPage from './pages/ClassPage'
import AssignmentPage from './pages/AssignmentPage'
import AssignmentFormPage from './pages/AssignmentFormPage'
import AssignmentEditPage from './pages/AssignmentEditPage'
import TopicPage from './pages/TopicPage'
import GradingSetupPage from './pages/GradingSetupPage'
import ClassEditPage from './pages/ClassEditPage'

function AppRoutes() {
  const { loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading…
      </div>
    )
  }
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<DashboardPage />} />
      <Route path="/classes/:id" element={<ClassPage />} />
      <Route path="/classes/:id/edit" element={<ClassEditPage />} />
      <Route path="/classes/:id/assignments/new" element={<AssignmentFormPage />} />
      <Route path="/classes/:id/assignments/:aid" element={<AssignmentPage />} />
      <Route path="/classes/:id/assignments/:aid/topics/:topic" element={<TopicPage />} />
      <Route path="/classes/:id/assignments/:aid/edit" element={<AssignmentEditPage />} />
      <Route path="/classes/:id/assignments/:aid/grading-setup" element={<GradingSetupPage />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
