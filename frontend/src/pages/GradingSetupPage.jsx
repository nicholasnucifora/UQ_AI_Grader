import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import RubricIngestUploader from '../components/RubricIngestUploader'
import RubricEditor from '../components/RubricEditor'
import { ReadOnlyMarkingGrid, HTML_PROSE } from '../components/Marking'
import { api } from '../api/client'

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

// ---------------------------------------------------------------------------
// Preview result — full-width layout matching the teacher marking panel
// ---------------------------------------------------------------------------

function PreviewResultCard({ result, rubric, index }) {
  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
        <div>
          <span className="text-xs text-gray-400 mr-2">Sample {index + 1}</span>
          <span className="text-sm font-semibold text-gray-800">
            {result.primary_author_name || result.resource_id}
          </span>
          {result.resource_topics && (
            <span className="ml-2 text-xs text-gray-400">{result.resource_topics}</span>
          )}
        </div>
        {result.status === 'error' && (
          <span className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
            Error
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        {result.status === 'error' ? (
          <p className="text-sm text-red-500">{result.error_message ?? 'Grading failed.'}</p>
        ) : (
          <>
            {/* Student submission content */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Student Submission</p>
              {result.resource_sections?.length > 0 ? (
                <div className="space-y-3">
                  {result.resource_sections.map((section, i) => (
                    <div key={i} className={HTML_PROSE} dangerouslySetInnerHTML={{ __html: section }} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No content available</p>
              )}
            </div>

            {/* AI marking grid */}
            {rubric?.criteria ? (
              <ReadOnlyMarkingGrid rubric={rubric} criterionGrades={result.criterion_grades} />
            ) : (
              <p className="text-sm text-amber-600">Rubric not loaded — cannot display marking grid.</p>
            )}

            {/* Overall feedback */}
            {result.overall_feedback && (
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Overall feedback</p>
                <p className="text-sm text-gray-600 leading-relaxed">{result.overall_feedback}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared settings banner
// ---------------------------------------------------------------------------

function SharedBanner() {
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
      <span className="shrink-0 mt-0.5">⚠</span>
      <span>
        Settings on this page are <strong>shared with the assignment</strong>. Any changes are saved directly to the class and assignment — not just to the AI grading.
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function GradingSetupPage() {
  const { id: classId, aid: assignmentId } = useParams()
  const navigate = useNavigate()

  const [cls, setCls] = useState(null)
  const [assignment, setAssignment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [rubricExists, setRubricExists] = useState(false)
  const [totalResources, setTotalResources] = useState(null)

  // Editable fields — all shared with the real assignment/class
  const [classDescription, setClassDescription] = useState('')
  const [assignmentDescription, setAssignmentDescription] = useState('')
  const [markingMode, setMarkingMode] = useState('teacher_supervised_ai')
  const [markIdentically, setMarkIdentically] = useState(true)
  const [strictness, setStrictness] = useState('standard')
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [moderationStrictness, setModerationStrictness] = useState('standard')
  const [moderationNotes, setModerationNotes] = useState('')
  const [aiModel, setAiModel] = useState('haiku')
  const [responseDetail, setResponseDetail] = useState('standard')
  const [useTopicAttachments, setUseTopicAttachments] = useState(false)
  const [topicAttachmentInstructions, setTopicAttachmentInstructions] = useState('')
  const [rubric, setRubric] = useState(null)
  const [moderationRubric, setModerationRubric] = useState(null)

  // Preview grading state
  const [previewJob, setPreviewJob] = useState(null)
  const [previewResults, setPreviewResults] = useState(null)
  const [selectedGrade, setSelectedGrade] = useState(null)
  const [previewIdx, setPreviewIdx] = useState(0)
  const [running, setRunning] = useState(false)
  const [extending, setExtending] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    // Reset all data state immediately so stale values from a previous assignment
    // are never shown while the new fetch is in flight.
    setTotalResources(null)
    setPreviewJob(null)
    setPreviewResults(null)
    setSelectedGrade(null)
    setPreviewIdx(0)
    setRubric(null)
    setModerationRubric(null)
    setRubricExists(false)
    setError(null)
    setLoading(true)

    async function load() {
      try {
        const [clsData, rubricData, job, stats] = await Promise.all([
          api.getClass(classId),
          api.getRubric(classId, assignmentId).catch(() => null),
          api.getGradeStatus(classId, assignmentId).catch(() => null),
          api.getRippleStats(classId, assignmentId).catch(() => null),
        ])
        if (cancelled) return
        if (stats) setTotalResources(stats.resources ?? null)

        setCls(clsData)
        setClassDescription(clsData.description ?? '')

        const a = clsData.assignments.find((x) => x.id === parseInt(assignmentId, 10))
        if (a) {
          setAssignment(a)
          setAssignmentDescription(a.description ?? '')
          setMarkingMode(a.marking_mode ?? 'teacher_supervised_ai')
          setMarkIdentically(
            (a.same_rubric_for_moderation ?? true) && (a.same_ai_options_for_moderation ?? true)
          )
          setStrictness(a.strictness ?? 'standard')
          setAdditionalNotes(a.additional_notes ?? '')
          setModerationStrictness(a.moderation_strictness ?? 'standard')
          setModerationNotes(a.moderation_additional_notes ?? '')
          setAiModel(a.ai_model ?? 'haiku')
          setResponseDetail(a.response_detail ?? 'standard')
          setUseTopicAttachments(a.use_topic_attachments ?? false)
          setTopicAttachmentInstructions(a.topic_attachment_instructions ?? '')
        }

        if (rubricData) {
          setRubric(rubricData.rubric ?? null)
          setModerationRubric(rubricData.moderation_rubric ?? null)
          setRubricExists(true)
        }

        if (job && job.is_preview) {
          setPreviewJob(job)
          if (job.status === 'complete') {
            const results = await api.getGradeResults(classId, assignmentId).catch(() => [])
            if (!cancelled) setPreviewResults(results)
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [classId, assignmentId])

  // Poll when preview is running/queued
  useEffect(() => {
    if (!previewJob) return
    const active = previewJob.status === 'queued' || previewJob.status === 'running'
    if (!active) {
      if (previewJob.status === 'complete') {
        api.getGradeResults(classId, assignmentId).then(setPreviewResults).catch(() => {})
      }
      return
    }
    const interval = setInterval(async () => {
      const job = await api.getGradeStatus(classId, assignmentId).catch(() => null)
      if (!job) return
      setPreviewJob(job)
      if (job.status === 'complete') {
        api.getGradeResults(classId, assignmentId).then(setPreviewResults).catch(() => {})
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [previewJob?.status, classId, assignmentId])

  async function saveAllSettings() {
    await Promise.all([
      api.updateClass(classId, { description: classDescription }),
      api.updateAssignment(classId, assignmentId, {
        description: assignmentDescription.trim(),
        marking_mode: markingMode,
        same_rubric_for_moderation: identical,
        same_ai_options_for_moderation: identical,
        strictness,
        additional_notes: additionalNotes.trim(),
        moderation_strictness: !identical ? moderationStrictness : null,
        moderation_additional_notes: !identical ? moderationNotes.trim() : null,
        ai_model: aiModel,
        response_detail: responseDetail,
        use_topic_attachments: useTopicAttachments,
        topic_attachment_instructions: topicAttachmentInstructions.trim(),
      }),
      rubric
        ? (rubricExists
            ? api.updateRubric(classId, assignmentId, { rubric, moderation_rubric: !identical ? moderationRubric : null })
            : api.saveRubric(classId, assignmentId, { rubric, moderation_rubric: !identical ? moderationRubric : null }).then(() => setRubricExists(true)))
        : Promise.resolve(),
    ])
  }

  async function handleRunPreview() {
    setError(null)
    setRunning(true)
    setPreviewResults(null)
    setPreviewIdx(0)
    setSelectedGrade(null)
    try {
      await saveAllSettings()
      const job = await api.startPreviewGrading(classId, assignmentId)
      setPreviewJob(job)
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  async function handleFindSpread() {
    setError(null)
    setExtending(true)
    try {
      const job = await api.extendPreviewForSpread(classId, assignmentId)
      // Zero out totals locally — the background task hasn't updated them yet.
      // This forces the progress bar to show "Starting…" instead of 100%.
      setPreviewJob({ ...job, total: 0, graded: 0 })
    } catch (err) {
      setError(err.message)
    } finally {
      setExtending(false)
    }
  }

  async function handleAcceptAndGradeAll() {
    setError(null)
    setAccepting(true)
    try {
      await saveAllSettings()
      // startGrading auto-deletes any existing preview job on the backend
      await api.startGrading(classId, assignmentId)
      navigate(`/classes/${classId}/assignments/${assignmentId}`)
    } catch (err) {
      setError(err.message)
      setAccepting(false)
    }
  }

  async function handleCancelPreview() {
    try {
      await api.cancelGrading(classId, assignmentId)
      setPreviewJob((j) => j ? { ...j, status: 'cancelled' } : j)
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <Layout><p className="text-gray-500">Loading…</p></Layout>
  if (!assignment) return <Layout><p className="text-red-600">Assignment not found.</p></Layout>

  const isRnM = assignment.assignment_type === 'resources_and_moderations'
  const identical = !isRnM || markIdentically

  const status = previewJob?.status
  const isRunning = status === 'queued' || status === 'running'
  const isComplete = status === 'complete' && previewResults && previewResults.length > 0
  const progressPct = previewJob && previewJob.total > 0
    ? Math.min(100, Math.round((previewJob.graded / previewJob.total) * 100))
    : 0
  const sampleSize = previewJob?.preview_sample_size ?? 3
  const previewResourceResults = (previewResults ?? []).filter((r) => r.result_type === 'resource')

  // Derive ordered level titles from rubric (highest → lowest points)
  const levelOrder = rubric?.criteria?.[0]?.levels
    ? [...rubric.criteria[0].levels].sort((a, b) => b.points - a.points).map((l) => l.title)
    : []

  // Determine the "overall grade" for a result as the most common level title across criteria
  function getOverallGrade(result) {
    const counts = {}
    ;(result.criterion_grades ?? []).forEach((g) => {
      if (g.level_title) counts[g.level_title] = (counts[g.level_title] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }

  // Group results by overall grade label
  const resultsByGrade = {}
  previewResourceResults.forEach((r) => {
    const grade = getOverallGrade(r)
    if (grade) {
      if (!resultsByGrade[grade]) resultsByGrade[grade] = []
      resultsByGrade[grade].push(r)
    }
  })

  // Auto-select first populated grade when results arrive
  const firstPopulatedGrade = levelOrder.find((t) => resultsByGrade[t]?.length > 0) ?? null
  const activeGrade = selectedGrade ?? firstPopulatedGrade

  const filteredResults = activeGrade ? (resultsByGrade[activeGrade] ?? []) : []
  const currentResult = filteredResults[previewIdx] ?? null

  function handleSelectGrade(grade) {
    setSelectedGrade(grade)
    setPreviewIdx(0)
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <Layout>
      <div className="max-w-screen-xl mx-auto space-y-5">
        {/* Breadcrumb */}
        <p className="text-sm text-gray-500">
          <Link to="/" className="hover:underline">My Classes</Link>
          {' / '}
          <Link to={`/classes/${classId}`} className="hover:underline">{cls?.name ?? '…'}</Link>
          {' / '}
          <Link to={`/classes/${classId}/assignments/${assignmentId}`} className="hover:underline">{assignment.title}</Link>
          {' /'}
        </p>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Setup AI Grading</h1>
          <p className="text-sm text-gray-500 mt-1">
            Run a preview on a small sample, adjust settings, and repeat until you are happy with the output. Then grade all submissions.
          </p>
        </div>

        <SharedBanner />

        {error && (
          <div className="flex items-start justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-3 text-red-400 hover:text-red-600 shrink-0">✕</button>
          </div>
        )}

        {/* ── Class & Assessment Details ── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">Class &amp; Assessment Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Class description
              <span className="ml-1.5 font-normal text-gray-400 text-xs">— shared with the class</span>
            </label>
            <textarea
              rows={2}
              className={inputCls}
              value={classDescription}
              onChange={(e) => setClassDescription(e.target.value)}
              disabled={isRunning}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Assessment description
              <span className="ml-1.5 font-normal text-gray-400 text-xs">— shared with the assignment</span>
            </label>
            <textarea
              rows={3}
              className={inputCls}
              value={assignmentDescription}
              onChange={(e) => setAssignmentDescription(e.target.value)}
              disabled={isRunning}
            />
          </div>

          {assignment?.assignment_type === 'resources_and_moderations' && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                checked={markIdentically}
                disabled={isRunning}
                onChange={(e) => setMarkIdentically(e.target.checked)}
              />
              <span className="text-sm text-gray-700">Mark resources and moderations identically</span>
            </label>
          )}

          {/* Rubric + Additional notes */}
          <div className="border-t border-gray-100 pt-4">
            {!identical ? (
              <div className="space-y-4">
                {[
                  { label: 'Resources', rubric, setRubric, notes: additionalNotes, setNotes: setAdditionalNotes, placeholder: 'Extra context the AI should consider when grading resources.' },
                  { label: 'Moderations', rubric: moderationRubric, setRubric: setModerationRubric, notes: moderationNotes, setNotes: setModerationNotes, placeholder: 'Extra context the AI should consider when grading moderations.' },
                ].map(({ label, rubric: r, setRubric: setR, notes, setNotes, placeholder }) => (
                  <div key={label} className="border border-gray-200 rounded-lg p-4 space-y-4">
                    <h3 className="text-sm font-semibold text-gray-700">{label} Settings</h3>
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-gray-700">Rubric</p>
                      <RubricIngestUploader onRubricExtracted={setR} disabled={isRunning} />
                      <RubricEditor rubric={r} onChange={setR} disabled={isRunning} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Additional notes for AI</label>
                      <textarea
                        rows={4}
                        className={inputCls}
                        placeholder={placeholder}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        disabled={isRunning}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Rubric</p>
                  <p className="text-xs text-gray-400 mt-0.5">Changes here update the assignment rubric.</p>
                </div>
                <RubricIngestUploader onRubricExtracted={setRubric} disabled={isRunning} />
                <RubricEditor rubric={rubric} onChange={setRubric} disabled={isRunning} />
                <div className="pt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Additional notes for AI
                    <span className="ml-1.5 font-normal text-gray-400 text-xs">— shared with the assignment</span>
                  </label>
                  <textarea
                    rows={4}
                    className={inputCls}
                    placeholder="Extra context the AI should consider — e.g. common mistakes to watch for, clarifications on the rubric, or marking conventions specific to this assessment."
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                    disabled={isRunning}
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
                disabled={isRunning}
                onChange={(e) => setUseTopicAttachments(e.target.checked)}
              />
              <div>
                <span className="text-sm font-medium text-gray-800">Use topic-specific attachments</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  When enabled, files uploaded to each topic page will be included as reference material
                  when the AI grades submissions for that topic. When disabled, the upload button on topic
                  pages is hidden.
                  <span className="ml-1 font-normal text-gray-400">— shared with the assignment</span>
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
                  disabled={isRunning}
                  onChange={(e) => setTopicAttachmentInstructions(e.target.value)}
                />
              </div>
            )}
          </div>
        </section>

        {/* ── AI Settings ── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">AI Settings</h2>

          {/* Marking mode */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">
              Marking mode
              <span className="ml-1.5 font-normal text-gray-400 text-xs">— shared with the assignment</span>
            </p>
            <div className="flex gap-2">
              {[
                { value: 'teacher_supervised_ai', label: 'Teacher supervised AI marking', description: 'Review AI-generated grading examples and refine the prompts until you are satisfied before grading runs.' },
                { value: 'teacher_marking', label: 'Teacher marking', description: "AI uses the teacher's own marking as examples when grading student work." },
              ].map((m) => {
                const active = markingMode === m.value
                return (
                  <button
                    key={m.value}
                    type="button"
                    disabled={isRunning}
                    onClick={() => setMarkingMode(m.value)}
                    className={`flex-1 text-center px-2 py-2 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                        : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <span className={`block text-xs font-semibold ${active ? 'text-indigo-700' : 'text-gray-800'}`}>
                      {m.label}
                    </span>
                    <span className={`block text-xs mt-0.5 ${active ? 'text-indigo-600' : 'text-gray-500'}`}>
                      {m.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* AI Model */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">
              AI Model
              <span className="ml-1.5 font-normal text-gray-400 text-xs">— shared with the assignment</span>
            </p>
            <div className="flex gap-2">
              {AI_MODELS.map((m) => {
                const active = aiModel === m.value
                return (
                  <button
                    key={m.value}
                    type="button"
                    disabled={isRunning}
                    onClick={() => setAiModel(m.value)}
                    className={`flex-1 text-center px-2 py-2 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                        : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <span className={`block text-xs font-semibold ${active ? 'text-indigo-700' : 'text-gray-800'}`}>
                      {m.label}
                    </span>
                    <span className={`block text-xs mt-0.5 ${active ? 'text-indigo-500' : 'text-gray-400'}`}>
                      {m.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Feedback Detail */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">
              Feedback Detail
              <span className="ml-1.5 font-normal text-gray-400 text-xs">— shared with the assignment</span>
            </p>
            <div className="flex gap-2">
              {RESPONSE_DETAILS.map((d) => {
                const active = responseDetail === d.value
                return (
                  <button
                    key={d.value}
                    type="button"
                    disabled={isRunning}
                    onClick={() => setResponseDetail(d.value)}
                    className={`flex-1 text-center px-2 py-2 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                        : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <span className={`block text-xs font-semibold ${active ? 'text-indigo-700' : 'text-gray-800'}`}>
                      {d.label}
                    </span>
                    <span className={`block text-xs mt-0.5 ${active ? 'text-indigo-600' : 'text-gray-500'}`}>
                      {d.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Strictness — split if R&M with separate settings */}
          {!identical ? (
            <div className="space-y-4">
              {[
                { label: 'Resources', value: strictness, onChange: setStrictness },
                { label: 'Moderations', value: moderationStrictness, onChange: setModerationStrictness },
              ].map(({ label, value: val, onChange }) => (
                <div key={label} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">{label} Settings</h3>
                  <p className="text-sm font-medium text-gray-700 mb-1.5">Strictness</p>
                  <div className="flex gap-2">
                    {[
                      { value: 'lenient', label: 'Lenient', description: 'Generous on partial evidence' },
                      { value: 'standard', label: 'Standard', description: 'Apply criteria as written' },
                      { value: 'strict', label: 'Strict', description: 'All descriptors must be met' },
                    ].map((s) => {
                      const active = val === s.value
                      return (
                        <button
                          key={s.value}
                          type="button"
                          disabled={isRunning}
                          onClick={() => onChange(s.value)}
                          className={`flex-1 text-center px-2 py-2 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            active
                              ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                              : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                          }`}
                        >
                          <span className={`block text-xs font-semibold ${active ? 'text-indigo-700' : 'text-gray-800'}`}>
                            {s.label}
                          </span>
                          <span className={`block text-xs mt-0.5 ${active ? 'text-indigo-600' : 'text-gray-500'}`}>
                            {s.description}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1.5">
                Strictness
                <span className="ml-1.5 font-normal text-gray-400 text-xs">— shared with the assignment</span>
              </p>
              <div className="flex gap-2">
                {[
                  { value: 'lenient', label: 'Lenient', description: 'Generous on partial evidence' },
                  { value: 'standard', label: 'Standard', description: 'Apply criteria as written' },
                  { value: 'strict', label: 'Strict', description: 'All descriptors must be met' },
                ].map((s) => {
                  const active = strictness === s.value
                  return (
                    <button
                      key={s.value}
                      type="button"
                      disabled={isRunning}
                      onClick={() => setStrictness(s.value)}
                      className={`flex-1 text-center px-2 py-2 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        active
                          ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                          : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`block text-xs font-semibold ${active ? 'text-indigo-700' : 'text-gray-800'}`}>
                        {s.label}
                      </span>
                      <span className={`block text-xs mt-0.5 ${active ? 'text-indigo-600' : 'text-gray-500'}`}>
                        {s.description}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {/* ── Preview ── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800">Preview</h2>
              {markingMode === 'teacher_supervised_ai' && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Grades {sampleSize} sample submission{sampleSize !== 1 ? 's' : ''} with the current settings. Adjust and rerun until satisfied.
                </p>
              )}
            </div>
            {markingMode === 'teacher_supervised_ai' && (
              <div className="flex items-center gap-2">
                {isRunning && (
                  <button
                    onClick={handleCancelPreview}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                )}
                {isComplete && (
                  <button
                    onClick={handleFindSpread}
                    disabled={isRunning || extending}
                    title="Grades more samples until scores span a wide range (up to 15 total)"
                    className={`px-3 py-1.5 text-sm rounded-lg border ${
                      isRunning || extending
                        ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                        : 'border-indigo-300 text-indigo-700 hover:bg-indigo-50'
                    }`}
                  >
                    {extending ? 'Finding…' : 'Find Spread'}
                  </button>
                )}
                <button
                  onClick={handleRunPreview}
                  disabled={isRunning || running}
                  className={`px-3 py-1.5 text-sm rounded-lg ${
                    isRunning || running
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  {running ? 'Starting…' : isComplete ? 'Rerun Preview' : 'Run Preview'}
                </button>
              </div>
            )}
          </div>

          {markingMode === 'teacher_marking' ? (
            <p className="text-sm text-gray-400 italic">
              Preview is not available for teacher marking mode — this feature is not yet developed.
            </p>
          ) : (
            <>
              {/* Progress */}
              {isRunning && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">
                    {previewJob.total === 0 ? 'Starting…' : `Grading… ${previewJob.graded} / ${previewJob.total}`}
                  </p>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-indigo-500 h-2 rounded-full transition-all"
                      style={{ width: (status === 'queued' || previewJob.total === 0) ? '0%' : `${progressPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* No preview yet */}
              {!previewJob && !isRunning && (
                <p className="text-sm text-gray-400">
                  Run a preview to see how the AI grades sample submissions with the current settings.
                </p>
              )}

              {/* Results — grade band grid + one at a time */}
              {isComplete && levelOrder.length > 0 && (
                <div className="space-y-4">
                  {totalResources != null && (
                    <p className="text-xs text-gray-400">
                      {previewResourceResults.length} of {totalResources} resource{totalResources !== 1 ? 's' : ''} sampled
                      {previewResourceResults.length >= totalResources && (
                        <span className="ml-1 text-amber-500">— all resources graded, no more available</span>
                      )}
                      {previewResourceResults.length < totalResources && previewResourceResults.length >= 15 && (
                        <span className="ml-1">— maximum sample size reached</span>
                      )}
                    </p>
                  )}
                  {/* Grade band grid */}
                  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${levelOrder.length}, minmax(0, 1fr))` }}>
                    {levelOrder.map((title) => {
                      const count = resultsByGrade[title]?.length ?? 0
                      const isActive = activeGrade === title
                      return (
                        <button
                          key={title}
                          onClick={() => count > 0 && handleSelectGrade(title)}
                          className={`rounded-lg border px-2 py-2.5 text-center transition-colors ${
                            isActive && count > 0
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : count > 0
                              ? 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer'
                              : 'border-gray-100 text-gray-300 cursor-default'
                          }`}
                        >
                          <div className="text-xs font-semibold truncate">{title}</div>
                          <div className={`text-xl font-bold leading-tight mt-0.5 ${count === 0 ? 'text-gray-200' : isActive ? 'text-white' : 'text-gray-700'}`}>
                            {count}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Sample viewer */}
                  {activeGrade && filteredResults.length === 0 && (
                    <p className="text-sm text-gray-400 italic text-center py-6 border border-dashed border-gray-200 rounded-lg">
                      No samples at <strong>{activeGrade}</strong> yet — use "Find Spread" to grade more samples.
                    </p>
                  )}

                  {activeGrade && filteredResults.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">
                          <span className="font-semibold">{activeGrade}</span>
                          {' · '}sample <span className="font-semibold">{previewIdx + 1}</span> of {filteredResults.length}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setPreviewIdx((i) => Math.max(0, i - 1))}
                            disabled={previewIdx === 0}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed"
                          >
                            ← Previous
                          </button>
                          <button
                            onClick={() => setPreviewIdx((i) => Math.min(filteredResults.length - 1, i + 1))}
                            disabled={previewIdx === filteredResults.length - 1}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 disabled:cursor-not-allowed"
                          >
                            Next →
                          </button>
                        </div>
                      </div>
                      <PreviewResultCard
                        key={currentResult?.id}
                        result={currentResult}
                        rubric={rubric}
                        index={previewIdx}
                      />
                    </div>
                  )}
                </div>
              )}

              {status === 'cancelled' && !isComplete && (
                <p className="text-sm text-gray-400">Preview cancelled. Adjust settings and run again.</p>
              )}

              {status === 'error' && (
                <p className="text-sm text-red-500">Preview failed. Check the settings and try again.</p>
              )}
            </>
          )}
        </section>

        {/* ── Accept ── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800">Grade All Submissions</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {isComplete
                  ? 'Happy with the preview? Accept the current settings and grade all submissions.'
                  : 'Run a preview first to verify the AI output before grading everything.'}
              </p>
            </div>
            <button
              onClick={handleAcceptAndGradeAll}
              disabled={!isComplete || accepting || isRunning}
              className={`px-4 py-2 text-sm rounded-lg shrink-0 font-medium ${
                isComplete && !accepting && !isRunning
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {accepting ? 'Starting…' : 'Accept & Grade All'}
            </button>
          </div>
        </section>
      </div>
    </Layout>
  )
}
