import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import RubricIngestUploader from '../components/RubricIngestUploader'
import RubricEditor from '../components/RubricEditor'
import { api } from '../api/client'

const MARKING_MODES = [
  {
    value: 'teacher_supervised_ai',
    label: 'Teacher supervised AI marking',
    description: 'Review AI-generated grading examples and refine the prompts until you are satisfied before grading runs.',
  },
  {
    value: 'teacher_marking',
    label: 'Teacher marking',
    description: "AI uses the teacher's own marking as examples when grading student work.",
  },
]

const AI_MODELS = [
  { value: 'opus', label: 'Claude Opus', description: 'Smart, Expensive' },
  { value: 'sonnet', label: 'Claude Sonnet', description: 'Recommended' },
  { value: 'haiku', label: 'Claude Haiku', description: 'Fast, Cheap' },
]

const RESPONSE_DETAILS = [
  { value: 'concise', label: 'Concise', description: 'Short, targeted feedback — one or two sentences per criterion' },
  { value: 'standard', label: 'Standard', description: 'Balanced feedback covering each criterion clearly' },
  { value: 'detailed', label: 'Detailed', description: 'Thorough feedback with specific evidence and improvement suggestions' },
]

const STRICTNESS_OPTIONS = [
  { value: 'lenient', label: 'Lenient', description: 'Generous on partial evidence' },
  { value: 'standard', label: 'Standard', description: 'Apply criteria as written' },
  { value: 'strict', label: 'Strict', description: 'All descriptors must be met' },
]

function ButtonGroup({ label, options, value, onChange }) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-1.5">{label}</p>
      <div className="flex gap-2">
        {options.map((opt) => {
          const active = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`flex-1 text-center px-2 py-2 rounded-lg border transition-colors ${
                active
                  ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                  : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              <span className={`block text-xs font-semibold ${active ? 'text-indigo-700' : 'text-gray-800'}`}>
                {opt.label}
              </span>
              <span className={`block text-xs mt-0.5 ${active ? 'text-indigo-600' : 'text-gray-500'}`}>
                {opt.description}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StrictnessAndNotes({ strictness, onStrictness, notes, onNotes, inputCls }) {
  return (
    <div className="space-y-4">
      <ButtonGroup label="Strictness" options={STRICTNESS_OPTIONS} value={strictness} onChange={onStrictness} />
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Additional notes for AI</label>
        <textarea
          rows={4}
          className={inputCls}
          placeholder="Extra context the AI should consider — e.g. common mistakes to watch for, clarifications on the rubric, or marking conventions specific to this assessment."
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
        />
      </div>
    </div>
  )
}

export default function AssignmentEditPage() {
  const { id: classId, aid } = useParams()
  const navigate = useNavigate()

  const [cls, setCls] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignmentType, setAssignmentType] = useState('resources')
  const [markIdentically, setMarkIdentically] = useState(true)
  const [rubric, setRubric] = useState(null)
  const [moderationRubric, setModerationRubric] = useState(null)
  const [rubricExists, setRubricExists] = useState(false)
  const [strictness, setStrictness] = useState('standard')
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [moderationStrictness, setModerationStrictness] = useState('standard')
  const [moderationNotes, setModerationNotes] = useState('')
  const [markingMode, setMarkingMode] = useState('teacher_supervised_ai')
  const [aiModel, setAiModel] = useState('haiku')
  const [responseDetail, setResponseDetail] = useState('standard')
  const [useTopicAttachments, setUseTopicAttachments] = useState(false)
  const [topicAttachmentInstructions, setTopicAttachmentInstructions] = useState('')

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  useEffect(() => {
    async function load() {
      try {
        const [classData, rubricData] = await Promise.all([
          api.getClass(classId),
          api.getRubric(classId, aid).catch(() => null),
        ])
        setCls(classData)

        const assignment = classData.assignments.find((a) => a.id === parseInt(aid, 10))
        if (!assignment) return

        const storedIdentically =
          (assignment.same_rubric_for_moderation ?? true) &&
          (assignment.same_ai_options_for_moderation ?? true)

        setTitle(assignment.title)
        setDescription(assignment.description ?? '')
        setAssignmentType(assignment.assignment_type ?? 'resources')
        setMarkIdentically(storedIdentically)
        setStrictness(assignment.strictness ?? 'standard')
        setAdditionalNotes(assignment.additional_notes ?? '')
        setModerationStrictness(assignment.moderation_strictness ?? 'standard')
        setModerationNotes(assignment.moderation_additional_notes ?? '')
        setMarkingMode(assignment.marking_mode ?? 'teacher_supervised_ai')
        setAiModel(assignment.ai_model ?? 'haiku')
        setResponseDetail(assignment.response_detail ?? 'standard')
        setUseTopicAttachments(assignment.use_topic_attachments ?? false)
        setTopicAttachmentInstructions(assignment.topic_attachment_instructions ?? '')

        if (rubricData) {
          setRubric(rubricData.rubric)
          setModerationRubric(rubricData.moderation_rubric ?? null)
          setRubricExists(true)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [classId, aid])

  const isRnM = assignmentType === 'resources_and_moderations'
  const identical = !isRnM || markIdentically

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.deleteAssignment(classId, aid)
      navigate(`/classes/${classId}`)
    } catch (err) {
      setError(err.message)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return setError('Title is required.')
    setSaving(true)
    setError('')

    try {
      await api.updateAssignment(classId, aid, {
        title: title.trim(),
        description: description.trim(),
        marking_criteria: '',
        assignment_type: assignmentType,
        strictness,
        additional_notes: additionalNotes.trim(),
        same_rubric_for_moderation: identical,
        same_ai_options_for_moderation: identical,
        moderation_strictness: !identical ? moderationStrictness : null,
        moderation_additional_notes: !identical ? moderationNotes.trim() : null,
        marking_mode: markingMode,
        ai_model: aiModel,
        response_detail: responseDetail,
        use_topic_attachments: useTopicAttachments,
        topic_attachment_instructions: topicAttachmentInstructions.trim(),
      })

      if (rubric) {
        const body = {
          rubric,
          moderation_rubric: !identical ? moderationRubric : null,
        }
        if (rubricExists) {
          await api.updateRubric(classId, aid, body)
        } else {
          await api.saveRubric(classId, aid, body)
        }
      }

      navigate(`/classes/${classId}/assignments/${aid}`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  if (loading) return <Layout><p className="text-gray-500">Loading…</p></Layout>
  if (!cls) return <Layout><p className="text-red-600">Class not found.</p></Layout>

  const assignment = cls.assignments.find((a) => a.id === parseInt(aid, 10))
  if (!assignment) return <Layout><p className="text-red-600">Assignment not found.</p></Layout>

  return (
    <Layout>
      <div className="max-w-screen-xl mx-auto space-y-5">
        <p className="text-sm text-gray-500">
          <Link to="/" className="hover:underline">My Classes</Link>
          {' / '}
          <Link to={`/classes/${classId}/assignments/${aid}`} className="hover:underline">{assignment.title}</Link>
          {' /'}
        </p>

        <h1 className="text-2xl font-bold text-gray-900">Edit Assignment</h1>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Assignment Details ── */}
          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-gray-800">Assignment Details</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                className={inputCls}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                rows={3}
                className={inputCls}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assignment Type</label>
              <select
                className={inputCls}
                value={assignmentType}
                onChange={(e) => { setAssignmentType(e.target.value); setMarkIdentically(true) }}
              >
                <option value="resources">Resources</option>
                <option value="resources_and_moderations">Resources &amp; Moderations</option>
              </select>
            </div>

            {isRnM && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  checked={markIdentically}
                  onChange={(e) => setMarkIdentically(e.target.checked)}
                />
                <span className="text-sm text-gray-700">Mark resources and moderations identically</span>
              </label>
            )}

            {/* Rubric + Additional notes */}
            <div className="border-t border-gray-100 pt-4">
              {isRnM && !markIdentically ? (
                <div className="space-y-4">
                  {[
                    { label: 'Resources', rubric, setRubric, notes: additionalNotes, setNotes: setAdditionalNotes, placeholder: 'Extra context the AI should consider when grading resources.' },
                    { label: 'Moderations', rubric: moderationRubric, setRubric: setModerationRubric, notes: moderationNotes, setNotes: setModerationNotes, placeholder: 'Extra context the AI should consider when grading moderations.' },
                  ].map(({ label, rubric: r, setRubric: setR, notes, setNotes, placeholder }) => (
                    <div key={label} className="border border-gray-200 rounded-lg p-4 space-y-4">
                      <h3 className="text-sm font-semibold text-gray-700">{label} Settings</h3>
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-gray-700">Rubric</p>
                        <RubricIngestUploader onRubricExtracted={setR} />
                        <RubricEditor rubric={r} onChange={setR} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Additional notes for AI</label>
                        <textarea
                          rows={4}
                          className={inputCls}
                          placeholder={placeholder}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700">Rubric</p>
                  <RubricIngestUploader onRubricExtracted={setRubric} />
                  <RubricEditor rubric={rubric} onChange={setRubric} />
                  <div className="pt-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Additional notes for AI</label>
                    <textarea
                      rows={4}
                      className={inputCls}
                      placeholder="Extra context the AI should consider — e.g. common mistakes to watch for, clarifications on the rubric, or marking conventions specific to this assessment."
                      value={additionalNotes}
                      onChange={(e) => setAdditionalNotes(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Topic Attachments */}
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  checked={useTopicAttachments}
                  onChange={(e) => setUseTopicAttachments(e.target.checked)}
                />
                <div>
                  <span className="text-sm font-medium text-gray-800">Use topic-specific attachments</span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    When enabled, files uploaded to each topic page will be included as reference material
                    when the AI grades submissions for that topic. When disabled, the upload button on topic
                    pages is hidden.
                  </p>
                </div>
              </label>
              {useTopicAttachments && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Attachment instructions
                    <span className="ml-1 font-normal text-gray-400">— tell the AI what these files are and how to use them</span>
                  </label>
                  <textarea
                    className={inputCls}
                    rows={3}
                    placeholder="e.g. The attached files are lecture slides for this topic. Use them to assess whether the student's submission demonstrates knowledge of the key concepts covered in class."
                    value={topicAttachmentInstructions}
                    onChange={(e) => setTopicAttachmentInstructions(e.target.value)}
                  />
                </div>
              )}
            </div>
          </section>

          {/* ── AI Settings ── */}
          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-gray-800">AI Settings</h2>

            <ButtonGroup label="Marking mode" options={MARKING_MODES} value={markingMode} onChange={setMarkingMode} />
            <ButtonGroup label="AI Model" options={AI_MODELS} value={aiModel} onChange={setAiModel} />
            <ButtonGroup label="Feedback Detail" options={RESPONSE_DETAILS} value={responseDetail} onChange={setResponseDetail} />

            {isRnM && !markIdentically ? (
              <div className="space-y-4">
                {[
                  { label: 'Resources', value: strictness, onChange: setStrictness },
                  { label: 'Moderations', value: moderationStrictness, onChange: setModerationStrictness },
                ].map(({ label, value: val, onChange }) => (
                  <div key={label} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">{label} Settings</h3>
                    <ButtonGroup label="Strictness" options={STRICTNESS_OPTIONS} value={val} onChange={onChange} />
                  </div>
                ))}
              </div>
            ) : (
              <ButtonGroup label="Strictness" options={STRICTNESS_OPTIONS} value={strictness} onChange={setStrictness} />
            )}
          </section>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/classes/${classId}/assignments/${aid}`)}
              className="px-5 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>

          {/* Delete */}
          <div className="pt-4 border-t border-gray-200">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
              >
                Delete Assignment
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-sm text-red-700">This will permanently delete all grades and data. Confirm?</p>
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

        </form>
      </div>
    </Layout>
  )
}
