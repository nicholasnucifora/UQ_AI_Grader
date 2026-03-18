import { useState } from 'react'
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

export default function AssignmentFormPage() {
  const { id: classId } = useParams()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignmentType, setAssignmentType] = useState('')
  const [markIdentically, setMarkIdentically] = useState(true)
  const [rubric, setRubric] = useState(null)
  const [strictness, setStrictness] = useState('standard')
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [markingMode, setMarkingMode] = useState('teacher_supervised_ai')
  const [aiModel, setAiModel] = useState('haiku')
  const [responseDetail, setResponseDetail] = useState('standard')
  const [useTopicAttachments, setUseTopicAttachments] = useState(false)
  const [topicAttachmentInstructions, setTopicAttachmentInstructions] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const isRnM = assignmentType === 'resources_and_moderations'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return setError('Title is required.')
    if (!assignmentType) return setError('Please select an Assignment Type before creating.')
    setSaving(true)
    setError('')
    try {
      const assignment = await api.createAssignment(classId, {
        title: title.trim(),
        description: description.trim(),
        marking_criteria: '',
        assignment_type: assignmentType,
        strictness,
        additional_notes: additionalNotes.trim(),
        marking_mode: markingMode,
        ai_model: aiModel,
        response_detail: responseDetail,
        use_topic_attachments: useTopicAttachments,
        topic_attachment_instructions: topicAttachmentInstructions.trim(),
      })
      if (rubric) {
        await api.saveRubric(classId, assignment.id, { rubric })
      }
      navigate(`/classes/${classId}/assignments/${assignment.id}`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-screen-xl mx-auto space-y-5">
        <p className="text-sm text-gray-500">
          <Link to="/" className="hover:underline">My Classes</Link>
          {' / '}
          <Link to={`/classes/${classId}`} className="hover:underline">Class</Link>
          {' /'}
        </p>

        <h1 className="text-2xl font-bold text-gray-900">New Assignment</h1>

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
                className={inputCls}
                rows={3}
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
                <option value="" disabled>-- Select assignment type --</option>
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

            {/* Rubric */}
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Rubric</p>
              <RubricIngestUploader onRubricExtracted={setRubric} />
              <RubricEditor rubric={rubric} onChange={setRubric} />
            </div>

            {/* Additional notes */}
            <div className="border-t border-gray-100 pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional notes for AI
              </label>
              <textarea
                className={inputCls}
                rows={4}
                placeholder="Extra context the AI should consider — e.g. common mistakes to watch for, clarifications on the rubric, or marking conventions specific to this assessment."
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
              />
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
            <ButtonGroup label="Strictness" options={STRICTNESS_OPTIONS} value={strictness} onChange={setStrictness} />
          </section>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Create Assignment'}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-5 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>

        </form>
      </div>
    </Layout>
  )
}
