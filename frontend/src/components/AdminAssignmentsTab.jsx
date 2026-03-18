import { useState, useEffect } from 'react'
import RubricIngestUploader from './RubricIngestUploader'
import RubricEditor from './RubricEditor'
import { api } from '../api/client'

export default function AdminAssignmentsTab({ classId, classData, initialOpenId }) {
  const [assignments, setAssignments] = useState(classData.assignments)
  const [expandedId, setExpandedId] = useState(null)
  // Per-assignment edit state: { [assignmentId]: { title, description, strictness, rubric, rubricExists } }
  const [editState, setEditState] = useState({})
  const [saving, setSaving] = useState({})
  const [errors, setErrors] = useState({})

  // Auto-expand the assignment referenced by ?open= param (from /edit redirect)
  useEffect(() => {
    if (!initialOpenId) return
    const id = parseInt(initialOpenId, 10)
    const target = classData.assignments.find((a) => a.id === id)
    if (target) handleExpand(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenId])

  async function handleExpand(assignment) {
    if (expandedId === assignment.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(assignment.id)

    // Initialise edit state from current assignment data
    if (!editState[assignment.id]) {
      const base = {
        title: assignment.title,
        description: assignment.description ?? '',
        strictness: assignment.strictness ?? 'standard',
        additional_notes: assignment.additional_notes ?? '',
        rubric: null,
        rubricExists: false,
      }
      // Fetch existing rubric
      try {
        const r = await api.getRubric(classId, assignment.id)
        if (r) {
          base.rubric = r.rubric
          base.rubricExists = true
        }
      } catch {
        // ignore — rubric just won't be pre-loaded
      }
      setEditState((prev) => ({ ...prev, [assignment.id]: base }))
    }
  }

  function updateField(assignmentId, field, value) {
    setEditState((prev) => ({
      ...prev,
      [assignmentId]: { ...prev[assignmentId], [field]: value },
    }))
  }

  async function handleSave(assignmentId) {
    const state = editState[assignmentId]
    if (!state) return
    setSaving((prev) => ({ ...prev, [assignmentId]: true }))
    setErrors((prev) => ({ ...prev, [assignmentId]: '' }))
    try {
      const updated = await api.updateAssignment(classId, assignmentId, {
        title: state.title,
        description: state.description,
        marking_criteria: '',
        strictness: state.strictness,
        additional_notes: state.additional_notes,
      })
      // Save / update rubric
      if (state.rubric) {
        const body = { rubric: state.rubric }
        if (state.rubricExists) {
          await api.updateRubric(classId, assignmentId, body)
        } else {
          await api.saveRubric(classId, assignmentId, body)
          setEditState((prev) => ({
            ...prev,
            [assignmentId]: { ...prev[assignmentId], rubricExists: true },
          }))
        }
      }
      // Update local assignments list with new title
      setAssignments((prev) =>
        prev.map((a) => (a.id === assignmentId ? { ...a, ...updated } : a))
      )
    } catch (err) {
      setErrors((prev) => ({ ...prev, [assignmentId]: err.message }))
    } finally {
      setSaving((prev) => ({ ...prev, [assignmentId]: false }))
    }
  }

  async function handleDelete(assignmentId) {
    if (!window.confirm('Delete this assignment? This cannot be undone.')) return
    try {
      await api.deleteAssignment(classId, assignmentId)
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId))
      if (expandedId === assignmentId) setExpandedId(null)
    } catch (err) {
      alert(`Failed to delete: ${err.message}`)
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-gray-800">Manage Assignments ({assignments.length})</h2>

      {assignments.length === 0 && (
        <p className="text-gray-500 text-sm">No assignments yet.</p>
      )}

      {assignments.map((assignment) => {
        const isOpen = expandedId === assignment.id
        const state = editState[assignment.id]

        return (
          <div key={assignment.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4">
              <button
                type="button"
                onClick={() => handleExpand(assignment)}
                className="flex items-center gap-2 text-left flex-1 min-w-0"
              >
                <span className="font-medium text-gray-800 truncate">{assignment.title}</span>
                <span className="text-gray-400 text-sm flex-shrink-0">{isOpen ? '▲' : '▼'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleDelete(assignment.id)}
                className="ml-4 text-xs text-red-500 hover:text-red-700 flex-shrink-0"
              >
                Delete
              </button>
            </div>

            {/* Expanded body */}
            {isOpen && (
              <div className="border-t border-gray-100 px-5 py-5 space-y-5">
                {!state ? (
                  <p className="text-sm text-gray-400">Loading…</p>
                ) : (
                  <>
                    {errors[assignment.id] && (
                      <p className="text-sm text-red-600">{errors[assignment.id]}</p>
                    )}

                    {/* Assignment fields */}
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                        <input
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={state.title}
                          onChange={(e) => updateField(assignment.id, 'title', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                          rows={3}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={state.description}
                          onChange={(e) => updateField(assignment.id, 'description', e.target.value)}
                        />
                      </div>

                    </div>

                    {/* Rubric section */}
                    <div className="border-t border-gray-200 pt-5 space-y-4">
                      <h3 className="text-sm font-semibold text-gray-700">Rubric</h3>
                      <RubricIngestUploader
                        onRubricExtracted={(r) => updateField(assignment.id, 'rubric', r)}
                      />
                      <RubricEditor
                        rubric={state.rubric}
                        onChange={(r) => updateField(assignment.id, 'rubric', r)}
                      />
                    </div>

                    {/* AI Grading Options — below rubric, matching the create form */}
                    <div className="border-t border-gray-200 pt-5 space-y-4">
                      <h3 className="text-sm font-semibold text-gray-700">AI Grading Options</h3>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Strictness</label>
                        <select
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={state.strictness}
                          onChange={(e) => updateField(assignment.id, 'strictness', e.target.value)}
                        >
                          <option value="lenient">Lenient</option>
                          <option value="standard">Standard</option>
                          <option value="strict">Strict</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Additional notes for AI</label>
                        <textarea
                          rows={4}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Any extra context the AI should consider when grading — e.g. common mistakes to watch for, clarifications on the rubric, or marking conventions specific to this assessment."
                          value={state.additional_notes}
                          onChange={(e) => updateField(assignment.id, 'additional_notes', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => handleSave(assignment.id)}
                        disabled={saving[assignment.id]}
                        className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                        {saving[assignment.id] ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
