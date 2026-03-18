import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import CreateClassModal from '../components/CreateClassModal'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api/client'

export default function DashboardPage() {
  const { user } = useAuth()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    api.listClasses()
      .then(setClasses)
      .finally(() => setLoading(false))
  }, [])

  function handleCreated(cls) {
    setClasses((prev) => [cls, ...prev])
    setShowCreate(false)
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My Classes</h1>
          {user?.role === 'staff' && (
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              + New Class
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-gray-500">Loading…</p>
        ) : classes.length === 0 ? (
          <p className="text-gray-500">You are not enrolled in any classes yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls) => (
              <ClassCard key={cls.id} cls={cls} />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateClassModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </Layout>
  )
}

function ClassCard({ cls }) {
  return (
    <Link
      to={`/classes/${cls.id}`}
      className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
    >
      <h2 className="font-semibold text-gray-800 mb-1 truncate">{cls.name}</h2>
      {cls.description && (
        <p className="text-sm text-gray-500 line-clamp-2">{cls.description}</p>
      )}
    </Link>
  )
}
