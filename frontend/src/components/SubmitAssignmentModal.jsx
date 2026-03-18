import { useState } from 'react'
import Modal from './Modal'
import { api } from '../api/client'

export default function SubmitAssignmentModal({ classId, assignmentId, onClose, onSubmitted }) {
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!content.trim()) return setError('Submission content is required')
    setSaving(true)
    setError('')
    try {
      const submission = await api.createSubmission(classId, assignmentId, { content: content.trim() })
      onSubmitted(submission)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Submit Assignment" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Your Submission</label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={10}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your answer here…"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
