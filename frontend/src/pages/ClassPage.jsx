import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import AddMemberModal from '../components/AddMemberModal'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api/client'

export default function ClassPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [cls, setCls] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('assignments')
  const [showAddMember, setShowAddMember] = useState(false)

  useEffect(() => {
    api.getClass(id)
      .then(setCls)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <Layout><p className="text-gray-500">Loading…</p></Layout>
  if (!cls) return <Layout><p className="text-red-600">Class not found.</p></Layout>

  const myMembership = cls.members.find((m) => m.user_id === user?.user_id)
  const isTeacher = myMembership?.role === 'teacher'

  function handleMemberAdded(member) {
    setCls((prev) => ({ ...prev, members: [...prev.members, member] }))
    setShowAddMember(false)
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <p className="text-sm text-gray-500 mb-1">
            <Link to="/" className="hover:underline">My Classes</Link> /
          </p>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{cls.name}</h1>
            {isTeacher && (
              <Link
                to={`/classes/${id}/edit`}
                className="px-3 py-1 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Edit
              </Link>
            )}
          </div>
          {cls.description && <p className="text-gray-600 mt-1">{cls.description}</p>}
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {(isTeacher ? ['assignments', 'members'] : ['assignments', 'members']).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'assignments' && (
          <AssignmentsTab
            classId={id}
            assignments={cls.assignments}
            isTeacher={isTeacher}
            onNew={() => navigate(`/classes/${id}/assignments/new`)}
          />
        )}
        {tab === 'members' && (
          <MembersTab
            members={cls.members}
            isTeacher={isTeacher}
            onAdd={() => setShowAddMember(true)}
          />
        )}
      </div>

      {showAddMember && (
        <AddMemberModal
          classId={id}
          onClose={() => setShowAddMember(false)}
          onAdded={handleMemberAdded}
        />
      )}
    </Layout>
  )
}

function AssignmentsTab({ classId, assignments, isTeacher, onNew }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800">Assignments ({assignments.length})</h2>
        {isTeacher && (
          <button
            onClick={onNew}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            + New Assignment
          </button>
        )}
      </div>
      {assignments.length === 0 ? (
        <p className="text-gray-500 text-sm">No assignments yet.</p>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => (
            <Link
              key={a.id}
              to={`/classes/${classId}/assignments/${a.id}`}
              className="block bg-white border border-gray-200 rounded-xl px-5 py-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-800">{a.title}</span>
                <StrictnessBadge strictness={a.strictness} />
              </div>
              {a.description && (
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{a.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function MembersTab({ members, isTeacher, onAdd }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800">Members ({members.length})</h2>
        {isTeacher && (
          <button
            onClick={onAdd}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            + Add Member
          </button>
        )}
      </div>
      <div className="space-y-2">
        {members.map((m) => (
          <div
            key={m.user_id}
            className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-3"
          >
            <div>
              <p className="text-sm font-medium text-gray-800">{m.name || m.user_id}</p>
              <p className="text-xs text-gray-500">{m.email}</p>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              m.role === 'teacher'
                ? 'bg-purple-100 text-purple-700'
                : 'bg-green-100 text-green-700'
            }`}>
              {m.role}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StrictnessBadge({ strictness }) {
  const colors = {
    lenient: 'bg-green-100 text-green-700',
    standard: 'bg-yellow-100 text-yellow-700',
    strict: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[strictness] ?? 'bg-gray-100 text-gray-600'}`}>
      {strictness}
    </span>
  )
}
