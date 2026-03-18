import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { api } from '../api/client'

export default function ClassEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  useEffect(() => {
    api.getClass(id)
      .then((cls) => {
        setName(cls.name)
        setDescription(cls.description)
      })
      .catch(() => setError('Failed to load class.'))
      .finally(() => setLoading(false))
  }, [id])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return setError('Name is required.')
    setSaving(true)
    setError('')
    try {
      await api.updateClass(id, { name: name.trim(), description: description.trim() })
      navigate(`/classes/${id}`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.deleteClass(id)
      navigate('/')
    } catch (err) {
      setError(err.message)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  if (loading) return <Layout><p className="text-gray-500">Loading…</p></Layout>

  return (
    <Layout>
      <div className="max-w-xl mx-auto">
        <p className="text-sm text-gray-500 mb-1">
          <Link to="/" className="hover:underline">My Classes</Link>
          {' / '}
          <Link to={`/classes/${id}`} className="hover:underline">Class</Link>
          {' /'}
        </p>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Class</h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Class name</label>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              className={inputCls}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/classes/${id}`)}
              className="px-5 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>

        {/* Delete */}
        <div className="mt-10 pt-6 border-t border-gray-200">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
            >
              Delete Class
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-red-700">This will permanently delete all assignments and data. Confirm?</p>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
