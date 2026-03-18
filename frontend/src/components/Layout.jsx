import { useAuth } from '../contexts/AuthContext'
import { api } from '../api/client'

export default function Layout({ children }) {
  const { user } = useAuth()

  function handleLogout(e) {
    e.preventDefault()
    api.logout().finally(() => {
      window.location.href = '/login'
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <a href="/" className="text-lg font-semibold text-blue-600 hover:text-blue-700">
          AI Ripple Grader
        </a>
        {user && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-700">{user.name}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              user.role === 'staff'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-green-100 text-green-700'
            }`}>
              {user.role}
            </span>
            <a
              href="#"
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Logout
            </a>
          </div>
        )}
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
