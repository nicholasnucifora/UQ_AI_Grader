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

// Small inline toggle button placed next to a section heading.
// linked=true → indigo "Shared", linked=false → gray "Separate"
function LinkToggle({ linked, onToggle, linkedTip, unlinkedTip }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!linked)}
      title={linked ? linkedTip : unlinkedTip}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium border transition-colors ${
        linked
          ? 'bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100 hover:border-indigo-300'
          : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 hover:border-gray-300'
      }`}
    >
      🔗 {linked ? 'Shared' : 'Separate'}
    </button>
  )
}

function GradeScaleFields({ max, onMax, rounding, onRounding, dp, onDp }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-700 whitespace-nowrap w-28">Grade out of</label>
        <input
          type="number"
          min="0"
          step="any"
          className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="e.g. 4"
          value={max}
          onChange={(e) => onMax(e.target.value)}
        />
        <span className="text-xs text-gray-400">leave blank to skip scaling</span>
      </div>
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-700 whitespace-nowrap w-28">Rounding</label>
        <select
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={rounding}
          onChange={(e) => onRounding(e.target.value)}
        >
          <option value="none">No rounding (exact decimal)</option>
          <option value="round">Round to nearest</option>
          <option value="round_up">Always round up (ceiling)</option>
          <option value="round_down">Always round down (floor)</option>
          <option value="half">Nearest half-mark (e.g. 3 or 3.5)</option>
        </select>
      </div>
      {rounding !== 'half' && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-700 whitespace-nowrap w-28">Decimal places</label>
          <select
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={dp}
            onChange={(e) => onDp(parseInt(e.target.value, 10))}
          >
            <option value={0}>0 — whole numbers only (e.g. 3)</option>
            <option value={1}>1 — one decimal (e.g. 3.5)</option>
            <option value={2}>2 — two decimals (e.g. 3.25)</option>
          </select>
        </div>
      )}
    </div>
  )
}

function CombineTypeSection({ label, enabled, onToggle, maxN, onMaxN }) {
  const inputCls = 'border border-gray-300 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="text-sm text-gray-700">{label}</span>
      </label>
      {enabled && (
        <div className="ml-6 space-y-1.5">
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-600 whitespace-nowrap">Max submissions counted:</label>
            <input
              type="number"
              min="1"
              step="1"
              className={`w-20 ${inputCls}`}
              placeholder="No limit"
              value={maxN}
              onChange={(e) => onMaxN(e.target.value)}
            />
          </div>
          <p className="text-xs text-gray-400">
            {maxN && parseInt(maxN, 10) > 0
              ? `Expected ${maxN} submissions. Best ${maxN} scores count — submitting fewer reduces the grade (missing submissions score 0). Submitting more only helps.`
              : 'No limit set — grade is the average of however many they submitted. No penalty for submitting fewer.'}
          </p>
        </div>
      )}
    </div>
  )
}

function RubricBlock({ rubric, setRubric }) {
  return (
    <div className="space-y-3">
      <RubricIngestUploader onRubricExtracted={setRubric} />
      {!rubric && (
        <>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <button
            type="button"
            onClick={() => setRubric({ title: 'Rubric', criteria: [{ id: crypto.randomUUID(), name: 'Criterion 1', weight_percentage: 100, levels: [{ id: crypto.randomUUID(), title: 'High', points: 10, description: '' }, { id: crypto.randomUUID(), title: 'Low', points: 0, description: '' }] }] })}
            className="w-full py-2 text-sm text-indigo-600 border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
          >
            + Create rubric from scratch
          </button>
        </>
      )}
      <RubricEditor rubric={rubric} onChange={setRubric} />
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
  const [sameRubric, setSameRubric] = useState(true)
  const [sameNotes, setSameNotes] = useState(true)
  const [sameAttachments, setSameAttachments] = useState(true)
  const [rubric, setRubric] = useState(null)
  const [moderationRubric, setModerationRubric] = useState(null)
  const [rubricExists, setRubricExists] = useState(false)
  const [strictness, setStrictness] = useState('standard')
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [moderationNotes, setModerationNotes] = useState('')
  const [markingMode, setMarkingMode] = useState('teacher_supervised_ai')
  const [aiModel, setAiModel] = useState('haiku')
  const [responseDetail, setResponseDetail] = useState('standard')
  const [useTopicAttachments, setUseTopicAttachments] = useState(false)
  const [topicAttachmentInstructions, setTopicAttachmentInstructions] = useState('')
  const [moderationTopicAttachmentInstructions, setModerationTopicAttachmentInstructions] = useState('')
  const [gradeScaleEnabled, setGradeScaleEnabled] = useState(false)
  const [gradeScaleMax, setGradeScaleMax] = useState('')
  const [gradeRounding, setGradeRounding] = useState('none')
  const [gradeDecimalPlaces, setGradeDecimalPlaces] = useState(2)
  const [separateModerationGradeScale, setSeparateModerationGradeScale] = useState(false)
  const [moderationGradeScaleMax, setModerationGradeScaleMax] = useState('')
  const [moderationGradeRounding, setModerationGradeRounding] = useState('none')
  const [moderationGradeDecimalPlaces, setModerationGradeDecimalPlaces] = useState(2)
  const [combineResourceGrades, setCombineResourceGrades] = useState(false)
  const [combineModerationGrades, setCombineModerationGrades] = useState(false)
  const [combineResourceMaxN, setCombineResourceMaxN] = useState('')
  const [combineModerationMaxN, setCombineModerationMaxN] = useState('')
  const [combineScope, setCombineScope] = useState('topic')

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

        setTitle(assignment.title)
        setDescription(assignment.description ?? '')
        setAssignmentType(assignment.assignment_type ?? 'resources')
        setSameRubric(assignment.same_rubric_for_moderation ?? true)
        setSameNotes(assignment.same_ai_options_for_moderation ?? true)
        const modAttachInstr = assignment.moderation_topic_attachment_instructions ?? ''
        setSameAttachments(!modAttachInstr.trim())
        setStrictness(assignment.strictness ?? 'standard')
        setAdditionalNotes(assignment.additional_notes ?? '')
        setModerationNotes(assignment.moderation_additional_notes ?? '')
        setMarkingMode(assignment.marking_mode ?? 'teacher_supervised_ai')
        setAiModel(assignment.ai_model ?? 'haiku')
        setResponseDetail(assignment.response_detail ?? 'standard')
        setUseTopicAttachments(assignment.use_topic_attachments ?? false)
        setTopicAttachmentInstructions(assignment.topic_attachment_instructions ?? '')
        setModerationTopicAttachmentInstructions(modAttachInstr)
        setGradeScaleEnabled(assignment.grade_scale_enabled ?? false)
        setGradeScaleMax(assignment.grade_scale_max != null ? String(assignment.grade_scale_max) : '')
        setGradeRounding(assignment.grade_rounding ?? 'none')
        setGradeDecimalPlaces(assignment.grade_decimal_places ?? 2)
        setSeparateModerationGradeScale(assignment.separate_moderation_grade_scale ?? false)
        setModerationGradeScaleMax(assignment.moderation_grade_scale_max != null ? String(assignment.moderation_grade_scale_max) : '')
        setModerationGradeRounding(assignment.moderation_grade_rounding ?? 'none')
        setModerationGradeDecimalPlaces(assignment.moderation_grade_decimal_places ?? 2)
        setCombineResourceGrades(assignment.combine_resource_grades ?? false)
        setCombineModerationGrades(assignment.combine_moderation_grades ?? false)
        setCombineResourceMaxN(assignment.combine_resource_max_n != null ? String(assignment.combine_resource_max_n) : '')
        setCombineModerationMaxN(assignment.combine_moderation_max_n != null ? String(assignment.combine_moderation_max_n) : '')
        setCombineScope(assignment.combine_scope ?? 'topic')

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
        same_rubric_for_moderation: !isRnM || sameRubric,
        same_ai_options_for_moderation: !isRnM || sameNotes,
        moderation_strictness: null,
        moderation_additional_notes: isRnM && !sameNotes ? moderationNotes.trim() : null,
        marking_mode: markingMode,
        ai_model: aiModel,
        response_detail: responseDetail,
        use_topic_attachments: useTopicAttachments,
        topic_attachment_instructions: topicAttachmentInstructions.trim(),
        moderation_topic_attachment_instructions: isRnM && !sameAttachments ? moderationTopicAttachmentInstructions.trim() : '',
        grade_scale_enabled: gradeScaleEnabled,
        grade_scale_max: gradeScaleEnabled && gradeScaleMax !== '' ? parseFloat(gradeScaleMax) : null,
        grade_rounding: gradeRounding,
        grade_decimal_places: gradeDecimalPlaces,
        separate_moderation_grade_scale: gradeScaleEnabled && isRnM && separateModerationGradeScale,
        moderation_grade_scale_max: gradeScaleEnabled && isRnM && separateModerationGradeScale && moderationGradeScaleMax !== '' ? parseFloat(moderationGradeScaleMax) : null,
        moderation_grade_rounding: moderationGradeRounding,
        moderation_grade_decimal_places: moderationGradeDecimalPlaces,
        combine_resource_grades: combineResourceGrades,
        combine_moderation_grades: combineModerationGrades,
        combine_resource_max_n: combineResourceGrades && combineResourceMaxN !== '' ? parseInt(combineResourceMaxN, 10) : null,
        combine_moderation_max_n: combineModerationGrades && combineModerationMaxN !== '' ? parseInt(combineModerationMaxN, 10) : null,
        combine_scope: combineScope,
      })

      if (rubric) {
        const body = {
          rubric,
          moderation_rubric: isRnM && !sameRubric ? moderationRubric : null,
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
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea rows={3} className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assignment Type</label>
              <select
                className={inputCls}
                value={assignmentType}
                onChange={(e) => {
                  setAssignmentType(e.target.value)
                  setSameRubric(true)
                  setSameNotes(true)
                  setSameAttachments(true)
                }}
              >
                <option value="resources">Resources</option>
                <option value="resources_and_moderations">Resources &amp; Moderations</option>
              </select>
            </div>

            {/* Rubric */}
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center gap-1.5 mb-3">
                <p className="text-sm font-medium text-gray-700">Rubric</p>
                {isRnM && (
                  <LinkToggle
                    linked={sameRubric}
                    onToggle={setSameRubric}
                    linkedTip="Rubric is shared with moderations — click to use separate rubrics"
                    unlinkedTip="Using separate rubrics — click to share the same rubric for both"
                  />
                )}
              </div>
              {isRnM && !sameRubric ? (
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Resources</p>
                    <RubricBlock rubric={rubric} setRubric={setRubric} />
                  </div>
                  <div className="border-t border-gray-100 pt-5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Moderations</p>
                    <RubricBlock rubric={moderationRubric} setRubric={setModerationRubric} />
                  </div>
                </div>
              ) : (
                <RubricBlock rubric={rubric} setRubric={setRubric} />
              )}
            </div>

            {/* Additional notes */}
            <div className="border-t border-gray-100 pt-4">
              {isRnM && !sameNotes ? (
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-sm font-medium text-gray-700">Additional notes for AI</label>
                      <LinkToggle
                        linked={false}
                        onToggle={setSameNotes}
                        linkedTip=""
                        unlinkedTip="Using separate notes — click to share the same notes for both"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mb-1">Resources</p>
                    <textarea
                      rows={4}
                      className={inputCls}
                      placeholder="Extra context for grading resources."
                      value={additionalNotes}
                      onChange={(e) => setAdditionalNotes(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">&nbsp;</label>
                    <p className="text-xs text-gray-500 mb-1">Moderations</p>
                    <textarea
                      rows={4}
                      className={inputCls}
                      placeholder="Extra context for grading moderations."
                      value={moderationNotes}
                      onChange={(e) => setModerationNotes(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <label className="text-sm font-medium text-gray-700">Additional notes for AI</label>
                    {isRnM && (
                      <LinkToggle
                        linked={true}
                        onToggle={setSameNotes}
                        linkedTip="Notes are shared with moderations — click to use separate notes"
                        unlinkedTip=""
                      />
                    )}
                  </div>
                  <textarea
                    rows={4}
                    className={inputCls}
                    placeholder="Extra context the AI should consider — e.g. common mistakes to watch for, clarifications on the rubric, or marking conventions specific to this assessment."
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                  />
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
                isRnM && !sameAttachments ? (
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <label className="text-xs font-medium text-gray-700">Attachment instructions</label>
                        <LinkToggle
                          linked={false}
                          onToggle={setSameAttachments}
                          linkedTip=""
                          unlinkedTip="Using separate instructions — click to share the same instructions for both"
                        />
                      </div>
                      <p className="text-xs text-gray-400 mb-1">Resources</p>
                      <textarea
                        className={inputCls}
                        rows={3}
                        placeholder="e.g. The attached files are lecture slides. Use them to assess knowledge of key concepts."
                        value={topicAttachmentInstructions}
                        onChange={(e) => setTopicAttachmentInstructions(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">&nbsp;</label>
                      <p className="text-xs text-gray-400 mb-1">Moderations</p>
                      <textarea
                        className={inputCls}
                        rows={3}
                        placeholder="e.g. Use the attached files as context when evaluating moderation submissions."
                        value={moderationTopicAttachmentInstructions}
                        onChange={(e) => setModerationTopicAttachmentInstructions(e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-xs font-medium text-gray-700">
                        Attachment instructions
                        <span className="ml-1 font-normal text-gray-400">— tell the AI what these files are and how to use them</span>
                      </label>
                      {isRnM && (
                        <LinkToggle
                          linked={true}
                          onToggle={setSameAttachments}
                          linkedTip="Instructions are shared with moderations — click to use separate instructions"
                          unlinkedTip=""
                        />
                      )}
                    </div>
                    <textarea
                      className={inputCls}
                      rows={3}
                      placeholder="e.g. The attached files are lecture slides for this topic. Use them to assess whether the student's submission demonstrates knowledge of the key concepts covered in class."
                      value={topicAttachmentInstructions}
                      onChange={(e) => setTopicAttachmentInstructions(e.target.value)}
                    />
                  </div>
                )
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

          {/* ── Grade Output ── */}
          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-gray-800">Grade Output</h2>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                checked={gradeScaleEnabled}
                onChange={(e) => setGradeScaleEnabled(e.target.checked)}
              />
              <div>
                <span className="text-sm font-medium text-gray-800">Scale grades to a custom range</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Convert raw rubric scores to a target grade (e.g. out of 4, or out of 100 for a percentage).
                </p>
              </div>
            </label>

            {gradeScaleEnabled && (
              <div className="ml-7 space-y-4 border-l-2 border-indigo-100 pl-4">
                {isRnM && separateModerationGradeScale ? (
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Resources</p>
                      </div>
                      <GradeScaleFields max={gradeScaleMax} onMax={setGradeScaleMax} rounding={gradeRounding} onRounding={setGradeRounding} dp={gradeDecimalPlaces} onDp={setGradeDecimalPlaces} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Moderations</p>
                        <LinkToggle
                          linked={false}
                          onToggle={(val) => setSeparateModerationGradeScale(!val)}
                          linkedTip=""
                          unlinkedTip="Using separate grade output — click to use identical settings for both"
                        />
                      </div>
                      <GradeScaleFields max={moderationGradeScaleMax} onMax={setModerationGradeScaleMax} rounding={moderationGradeRounding} onRounding={setModerationGradeRounding} dp={moderationGradeDecimalPlaces} onDp={setModerationGradeDecimalPlaces} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {isRnM && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <p className="text-xs text-gray-500">Grade output</p>
                        <LinkToggle
                          linked={true}
                          onToggle={(val) => setSeparateModerationGradeScale(!val)}
                          linkedTip="Grade output is identical for Resources & Moderations — click to use separate settings"
                          unlinkedTip=""
                        />
                      </div>
                    )}
                    <GradeScaleFields max={gradeScaleMax} onMax={setGradeScaleMax} rounding={gradeRounding} onRounding={setGradeRounding} dp={gradeDecimalPlaces} onDp={setGradeDecimalPlaces} />
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Combined student grade</p>
              <p className="text-xs text-gray-500">
                Show one overall grade per student, calculated across multiple submissions. Displayed alongside individual submission grades — not a replacement.
              </p>

              <CombineTypeSection
                label="Resources"
                enabled={combineResourceGrades}
                onToggle={setCombineResourceGrades}
                maxN={combineResourceMaxN}
                onMaxN={setCombineResourceMaxN}
              />

              {isRnM && (
                <CombineTypeSection
                  label="Moderations"
                  enabled={combineModerationGrades}
                  onToggle={setCombineModerationGrades}
                  maxN={combineModerationMaxN}
                  onMaxN={setCombineModerationMaxN}
                />
              )}

              {(combineResourceGrades || (isRnM && combineModerationGrades)) && (
                <div className="pt-1 space-y-1.5">
                  <p className="text-xs font-medium text-gray-700">Show combined grade:</p>
                  <div className="flex gap-2">
                    {[
                      { value: 'topic', label: 'Per topic', desc: 'Separate combined grade for each topic' },
                      { value: 'assignment', label: 'Whole assignment', desc: 'One combined grade across all topics' },
                    ].map((opt) => {
                      const active = combineScope === opt.value
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setCombineScope(opt.value)}
                          className={`flex-1 text-center px-3 py-2 rounded-lg border text-xs transition-colors ${
                            active ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                          }`}
                        >
                          <span className={`block font-semibold ${active ? 'text-indigo-700' : 'text-gray-800'}`}>{opt.label}</span>
                          <span className={`block mt-0.5 ${active ? 'text-indigo-600' : 'text-gray-500'}`}>{opt.desc}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={() => navigate(`/classes/${classId}/assignments/${aid}`)} className="px-5 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>

          {/* Delete */}
          <div className="pt-4 border-t border-gray-200">
            {!confirmDelete ? (
              <button type="button" onClick={() => setConfirmDelete(true)} className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50">
                Delete Assignment
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-sm text-red-700">This will permanently delete all grades and data. Confirm?</p>
                <button type="button" onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
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
