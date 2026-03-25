import { useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useUpload } from '../contexts/UploadContext'
import { api } from '../api/client'

export default function Layout({ children }) {
  const { user } = useAuth()
  const { uploads, dismissUpload } = useUpload()
  const { pathname } = useLocation()

  // Only show the floating toast for uploads that started on a different page
  const remoteUploads = uploads.filter((u) => u.originPath !== pathname)

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

      {/* Floating upload indicator — only for uploads from other pages */}
      {remoteUploads.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs">
          {remoteUploads.map((u) => (
            <div
              key={u.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm ${
                u.status === 'error'
                  ? 'bg-red-50 border border-red-200 text-red-700'
                  : u.status === 'done'
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-white border border-gray-200 text-gray-700'
              }`}
            >
              {u.status === 'uploading' && (
                <svg className="animate-spin h-4 w-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {u.status === 'done' && <span className="shrink-0">✓</span>}
              {u.status === 'error' && <span className="shrink-0">✕</span>}
              <span className="truncate flex-1">
                {u.status === 'uploading' && `Uploading ${u.filename}…`}
                {u.status === 'done' && `Uploaded ${u.filename}`}
                {u.status === 'error' && (u.error || `Failed: ${u.filename}`)}
              </span>
              {(u.status === 'done' || u.status === 'error') && (
                <button
                  onClick={() => dismissUpload(u.id)}
                  className="shrink-0 text-gray-400 hover:text-gray-600 ml-1"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
