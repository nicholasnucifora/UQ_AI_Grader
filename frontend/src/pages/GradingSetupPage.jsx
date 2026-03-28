import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { ReadOnlyMarkingGrid, HTML_PROSE } from '../components/Marking'
import { api } from '../api/client'
import {
  ButtonGroup,
  FeedbackFormatPicker,
  LinkToggle,
  RubricBlock,
  TopicAttachmentManager,
  AI_MODELS,
} from '../components/AssignmentShared'

// ---------------------------------------------------------------------------
// Preview result — full-width layout matching the teacher marking panel
// ---------------------------------------------------------------------------

function PreviewResultCard({ result, rubric, index }) {
  const [originalOpen, setOriginalOpen] = useState(false)
  const isModeration = result.result_type === 'moderation'

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
        <div>
          <span className="text-xs text-gray-400 mr-2">Sample {index + 1}</span>
          <span className="text-sm font-semibold text-gray-800">
            {isModeration
              ? (result.moderation_user_name || result.moderation_user_id || 'Unknown moderator')
              : (result.primary_author_name || result.resource_id)}
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
            {isModeration ? (
              <>
                {/* Moderation comment */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Moderation Comment</p>
                  {result.moderation_comment ? (
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{result.moderation_comment}</p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No comment available</p>
                  )}
                </div>
                {/* Collapsible original resource */}
                {result.resource_sections?.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setOriginalOpen((o) => !o)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                    >
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Original resource — {result.primary_author_name || 'author'}
                      </span>
                      <span className="text-gray-400 text-xs ml-2">{originalOpen ? '▲ hide' : '▼ show'}</span>
                    </button>
                    {originalOpen && (
                      <div className="p-4 space-y-3 border-t border-gray-200">
                        {result.resource_sections.map((section, i) => (
                          <div key={i} className={HTML_PROSE} dangerouslySetInnerHTML={{ __html: section }} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* Resource: show student submission content */
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
            )}

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
  const [searchParams] = useSearchParams()
  const isNewSubmissionsMode = searchParams.get('mode') === 'new_submissions'

  const [cls, setCls] = useState(null)
  const [assignment, setAssignment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [rubricExists, setRubricExists] = useState(false)
  const [totalResources, setTotalResources] = useState(null)

  // Editable fields — all shared with the real assignment/class
  const [classDescription, setClassDescription] = useState('')
  const [assignmentDescription, setAssignmentDescription] = useState('')
  const [markingMode, setMarkingMode] = useState('teacher_supervised_ai')
  const [sameRubric, setSameRubric] = useState(true)
  const [sameNotes, setSameNotes] = useState(true)
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [moderationNotes, setModerationNotes] = useState('')
  const [aiModel, setAiModel] = useState('haiku')
  const [feedbackFormat, setFeedbackFormat] = useState('')
  const [useTopicAttachments, setUseTopicAttachments] = useState(false)
  const [topicAttachmentInstructions, setTopicAttachmentInstructions] = useState('')
  const [topicInstructionOverrides, setTopicInstructionOverrides] = useState({})
  const [rubric, setRubric] = useState(null)
  const [moderationRubric, setModerationRubric] = useState(null)

  // Auto-save
  const saveEnabled = useRef(false)
  const saveTimerRef = useRef(null)
  const savedTimerRef = useRef(null)
  const [autoSaveStatus, setAutoSaveStatus] = useState(null) // null | 'saving' | 'saved'
  const [settingsChangedSincePreview, setSettingsChangedSincePreview] = useState(false)

  // New submissions mode state
  const [topicsWithoutAttachments, setTopicsWithoutAttachments] = useState([])
  const [showMissingAttachmentsConfirm, setShowMissingAttachmentsConfirm] = useState(false)
  const [startingNewSubmissions, setStartingNewSubmissions] = useState(false)

  // Preview grading state
  const [previewJob, setPreviewJob] = useState(null)
  const [previewResults, setPreviewResults] = useState(null)
  const [selectedGrade, setSelectedGrade] = useState(null)
  const [previewIdx, setPreviewIdx] = useState(0)
  const [previewTab, setPreviewTab] = useState('resource') // 'resource' | 'moderation'
  const [running, setRunning] = useState(false)
  const [extending, setExtending] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
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
          setSameRubric(a.same_rubric_for_moderation ?? true)
          setSameNotes(a.same_ai_options_for_moderation ?? true)
          setAdditionalNotes(a.additional_notes ?? '')
          setModerationNotes(a.moderation_additional_notes ?? '')
          setAiModel(a.ai_model ?? 'haiku')
          setFeedbackFormat(a.feedback_format ?? '')
          setUseTopicAttachments(a.use_topic_attachments ?? false)
          setTopicAttachmentInstructions(a.topic_attachment_instructions ?? '')
          setTopicInstructionOverrides(a.topic_instruction_overrides ?? {})
        }

        if (rubricData) {
          setRubric(rubricData.rubric ?? null)
          setModerationRubric(rubricData.moderation_rubric ?? null)
          setRubricExists(true)
        }

        if (job && job.is_preview) {
          setPreviewJob(job)
          if (job.preview_type) setPreviewTab(job.preview_type)
          if (job.status === 'complete') {
            const results = await api.getGradeResults(classId, assignmentId).catch(() => [])
            if (!cancelled) {
              setPreviewResults(results)
              // If there are both resource and moderation results, show whichever tab has results
              const hasRes = results.some((r) => r.result_type === 'resource')
              const hasMod = results.some((r) => r.result_type === 'moderation')
              if (hasMod && !hasRes) setPreviewTab('moderation')
            }
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          // Enable auto-save after the initial render cycle has completed
          setTimeout(() => { saveEnabled.current = true }, 0)
        }
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
      if (job.graded > 0 || job.status === 'complete') {
        api.getGradeResults(classId, assignmentId).then(setPreviewResults).catch(() => {})
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [previewJob?.status, classId, assignmentId])

  // Load topics to detect ones without attachments (new submissions mode + topic attachments enabled)
  useEffect(() => {
    if (!isNewSubmissionsMode || !useTopicAttachments || !classId || !assignmentId) return
    api.getTopics(classId, assignmentId)
      .then((topics) => {
        setTopicsWithoutAttachments(topics.filter((t) => t.attachment_count === 0).map((t) => t.topic))
      })
      .catch(() => {})
  }, [isNewSubmissionsMode, useTopicAttachments, classId, assignmentId])

  const isRnM = assignment?.assignment_type === 'resources_and_moderations'
  const rubricLinked = !isRnM || sameRubric
  const notesLinked = !isRnM || sameNotes

  // Auto-save: debounce all editable field changes and save to the backend
  useEffect(() => {
    if (!saveEnabled.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setAutoSaveStatus('saving')
      try {
        await saveAllSettings()
        setAutoSaveStatus('saved')
        savedTimerRef.current = setTimeout(() => setAutoSaveStatus(null), 2000)
      } catch {
        setAutoSaveStatus(null)
      }
    }, 800)
  }, [
    classDescription, assignmentDescription, markingMode,
    sameRubric, sameNotes, additionalNotes, moderationNotes,
    aiModel, feedbackFormat, useTopicAttachments,
    topicAttachmentInstructions, topicInstructionOverrides,
    rubric, moderationRubric,
  ]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mark preview as stale when AI-relevant settings change after a run
  useEffect(() => {
    if (!saveEnabled.current) return
    setSettingsChangedSincePreview(true)
  }, [
    rubric, moderationRubric, additionalNotes, moderationNotes,
    aiModel, feedbackFormat, markingMode, sameRubric, sameNotes,
    useTopicAttachments, topicAttachmentInstructions, topicInstructionOverrides,
  ]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveAllSettings() {
    await Promise.all([
      api.updateClass(classId, { description: classDescription }),
      api.updateAssignment(classId, assignmentId, {
        description: assignmentDescription.trim(),
        marking_mode: markingMode,
        same_rubric_for_moderation: rubricLinked,
        same_ai_options_for_moderation: notesLinked,
        additional_notes: additionalNotes.trim(),
        moderation_additional_notes: !notesLinked ? moderationNotes.trim() : null,
        ai_model: aiModel,
        feedback_format: feedbackFormat.trim(),
        use_topic_attachments: useTopicAttachments,
        topic_attachment_instructions: topicAttachmentInstructions.trim(),
        topic_instruction_overrides: topicInstructionOverrides,
      }),
      rubric
        ? (rubricExists
            ? api.updateRubric(classId, assignmentId, { rubric, moderation_rubric: !rubricLinked ? moderationRubric : null })
            : api.saveRubric(classId, assignmentId, { rubric, moderation_rubric: !rubricLinked ? moderationRubric : null }).then(() => setRubricExists(true)))
        : Promise.resolve(),
    ])
  }

  async function handleRunPreview(type) {
    setError(null)
    setRunning(true)
    setPreviewIdx(0)
    setSelectedGrade(null)
    setSettingsChangedSincePreview(false)
    // Clear only the results for this type locally so the other type stays visible
    setPreviewResults((prev) => prev ? prev.filter((r) => r.result_type !== type) : null)
    try {
      await saveAllSettings()
      const job = await api.startPreviewGrading(classId, assignmentId, type)
      setPreviewJob(job)
      setPreviewTab(type)
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  async function handleExtendPreview(type) {
    setError(null)
    setExtending(true)
    try {
      const job = await api.extendPreviewForSpread(classId, assignmentId, type)
      setPreviewJob({ ...job, total: 0, graded: 0 })
      setPreviewTab(type)
    } catch (err) {
      setError(err.message)
    } finally {
      setExtending(false)
    }
  }

  async function handleClearAllPreviews() {
    setError(null)
    setClearing(true)
    try {
      await api.clearPreview(classId, assignmentId)
      setPreviewJob(null)
      setPreviewResults(null)
      setSelectedGrade(null)
      setPreviewIdx(0)
      setPreviewTab('resource')
    } catch (err) {
      setError(err.message)
    } finally {
      setClearing(false)
    }
  }

  async function handleAcceptAndGradeAll() {
    setError(null)
    setAccepting(true)
    try {
      await saveAllSettings()
      await api.startGrading(classId, assignmentId)
      navigate(`/classes/${classId}/assignments/${assignmentId}`)
    } catch (err) {
      setError(err.message)
      setAccepting(false)
    }
  }

  async function doGradeNewSubmissions() {
    setError(null)
    setStartingNewSubmissions(true)
    try {
      await saveAllSettings()
      await api.startGrading(classId, assignmentId)
      navigate(`/classes/${classId}/assignments/${assignmentId}`)
    } catch (err) {
      setError(err.message)
      setStartingNewSubmissions(false)
    }
  }

  function handleTopicAttachmentsChange(topic, atts) {
    setTopicsWithoutAttachments((prev) =>
      atts.length > 0 ? prev.filter((t) => t !== topic) : prev.includes(topic) ? prev : [...prev, topic]
    )
  }

  function handleGradeNewSubmissions() {
    if (useTopicAttachments && topicsWithoutAttachments.length > 0) {
      setShowMissingAttachmentsConfirm(true)
      return
    }
    doGradeNewSubmissions()
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

  const status = previewJob?.status
  const isRunning = status === 'queued' || status === 'running'
  const sampleSize = previewJob?.preview_sample_size ?? 3
  // Guard against graded briefly exceeding total during extension ramp-up
  const displayTotal = Math.max(previewJob?.total ?? 0, previewJob?.graded ?? 0)
  const progressPct = displayTotal > 0
    ? Math.min(100, Math.round(((previewJob?.graded ?? 0) / displayTotal) * 100))
    : 0

  // Exclude orphaned results (job_id=null) left over from previous full grading runs —
  // those are kept in the DB so the preview can detect already-graded resources, but
  // should not appear in the preview display.
  const allResults = (previewResults ?? []).filter((r) => r.job_id !== null)
  const resourceResults = allResults.filter((r) => r.result_type === 'resource')
  const moderationResults = allResults.filter((r) => r.result_type === 'moderation')
  const hasResourceResults = resourceResults.length > 0
  const hasModerationResults = moderationResults.length > 0
  const hasAnyResults = hasResourceResults || hasModerationResults
  // Extended = more samples than the initial run (user clicked Extend at least once)
  const resourceExtended = resourceResults.length > sampleSize
  const moderationExtended = moderationResults.length > sampleSize
  const clearLabel = hasResourceResults && hasModerationResults ? 'Clear All Previews' : 'Clear Preview'

  // isComplete: we have at least one result and no job is running
  const isComplete = !isRunning && hasAnyResults

  // The rubric to use for the current tab's grade bands
  const activeRubric = previewTab === 'moderation' && !rubricLinked ? moderationRubric : rubric
  const activeResults = previewTab === 'moderation' ? moderationResults : resourceResults

  const levelOrder = activeRubric?.criteria?.[0]?.levels
    ? [...activeRubric.criteria[0].levels].sort((a, b) => b.points - a.points).map((l) => l.title)
    : []

  function getOverallGrade(result) {
    const counts = {}
    ;(result.criterion_grades ?? []).forEach((g) => {
      if (g.level_title) counts[g.level_title] = (counts[g.level_title] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }

  const resultsByGrade = {}
  activeResults.forEach((r) => {
    const grade = getOverallGrade(r)
    if (grade) {
      if (!resultsByGrade[grade]) resultsByGrade[grade] = []
      resultsByGrade[grade].push(r)
    }
  })

  const firstPopulatedGrade = levelOrder.find((t) => resultsByGrade[t]?.length > 0) ?? null
  const activeGrade = selectedGrade ?? firstPopulatedGrade
  const filteredResults = activeGrade ? (resultsByGrade[activeGrade] ?? []) : []
  const currentResult = filteredResults[previewIdx] ?? null

  function handleSelectGrade(grade) {
    setSelectedGrade(grade)
    setPreviewIdx(0)
  }

  function handlePreviewTabChange(tab) {
    setPreviewTab(tab)
    setSelectedGrade(null)
    setPreviewIdx(0)
  }

  // Which preview type is currently running (if any)
  const runningType = isRunning ? (previewJob?.preview_type || 'resource') : null

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <Layout>
      <div className="max-w-screen-xl mx-auto space-y-5">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            <Link to="/" className="hover:underline">My Classes</Link>
            {' / '}
            <Link to={`/classes/${classId}`} className="hover:underline">{cls?.name ?? '…'}</Link>
            {' / '}
            <Link to={`/classes/${classId}/assignments/${assignmentId}`} className="hover:underline">{assignment.title}</Link>
            {' /'}
          </p>
          {autoSaveStatus === 'saving' && (
            <span className="text-xs text-gray-400">Saving…</span>
          )}
          {autoSaveStatus === 'saved' && (
            <span className="text-xs text-green-600">Saved</span>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">Setup AI Grading</h1>
          <p className="text-sm text-gray-500 mt-1">
            Run a preview on a small sample, adjust settings, and repeat until you are happy with the output. Then grade all submissions.
          </p>
        </div>

        <SharedBanner />

        {/* ── New Submissions Banner ── */}
        {isNewSubmissionsMode && (
          <section className="bg-green-50 border-2 border-green-300 rounded-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-6">
              <div className="space-y-1.5">
                <h2 className="text-lg font-bold text-green-900">New submissions are ready to grade</h2>
                <p className="text-sm text-green-800">
                  Your previous AI settings are saved and ready to go — you can kick off grading right now.
                  Or scroll down to tweak settings or run a fresh preview first.
                </p>
              </div>
              <div className="shrink-0">
                {showMissingAttachmentsConfirm ? (
                  <div className="space-y-2 text-right">
                    <p className="text-sm font-medium text-amber-700">
                      You haven't added attachments for{' '}
                      {topicsWithoutAttachments.length === 1
                        ? <strong>{topicsWithoutAttachments[0]}</strong>
                        : <strong>{topicsWithoutAttachments.length} topics</strong>
                      }
                      . Grade anyway?
                    </p>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={doGradeNewSubmissions}
                        disabled={startingNewSubmissions}
                        className="px-3 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {startingNewSubmissions ? 'Starting…' : 'Yes, grade now'}
                      </button>
                      <button
                        onClick={() => setShowMissingAttachmentsConfirm(false)}
                        className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50"
                      >
                        No, go back
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleGradeNewSubmissions}
                    disabled={startingNewSubmissions}
                    className="px-5 py-2.5 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 shadow-sm"
                  >
                    {startingNewSubmissions ? 'Starting…' : 'Continue with current settings →'}
                  </button>
                )}
              </div>
            </div>
            {useTopicAttachments && topicsWithoutAttachments.length > 0 && !showMissingAttachmentsConfirm && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>
                  {topicsWithoutAttachments.length === 1 ? (
                    <>A new topic (<strong>{topicsWithoutAttachments[0]}</strong>) has no attachments yet — the AI won't have reference files for it.</>
                  ) : (
                    <>{topicsWithoutAttachments.length} topics have no attachments yet — the AI won't have reference files for them.</>
                  )}
                  {' '}Scroll down to add files under <strong>Topic-specific attachments</strong>.
                </span>
              </div>
            )}
          </section>
        )}

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

          {/* ── Rubric ── */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <div>
                <p className="text-sm font-medium text-gray-700">Rubric</p>
                <p className="text-xs text-gray-400 mt-0.5">Changes here update the assignment rubric.</p>
              </div>
              {isRnM && (
                <LinkToggle
                  linked={sameRubric}
                  onToggle={setSameRubric}
                  linkedTip="Rubric is shared with moderations — click to use separate rubrics"
                  unlinkedTip="Using separate rubrics — click to share the same rubric for both"
                />
              )}
            </div>

            {!rubricLinked ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Resources</p>
                  <RubricBlock rubric={rubric} setRubric={setRubric} />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Moderations</p>
                  <RubricBlock rubric={moderationRubric} setRubric={setModerationRubric} />
                </div>
              </div>
            ) : (
              <RubricBlock rubric={rubric} setRubric={setRubric} />
            )}
          </div>

          {/* ── Additional Notes ── */}
          <div className="border-t border-gray-100 pt-4">
            {!notesLinked ? (
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <label className="text-sm font-medium text-gray-700">
                      Additional notes for AI
                      <span className="ml-1.5 font-normal text-gray-400 text-xs">— shared with the assignment</span>
                    </label>
                    <LinkToggle
                      linked={false}
                      onToggle={setSameNotes}
                      linkedTip=""
                      unlinkedTip="Using separate notes — click to share the same notes for both"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mb-1">Resources</p>
                  <textarea
                    rows={4}
                    className={inputCls}
                    placeholder="Extra context for grading resources."
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                    disabled={isRunning}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">&nbsp;</label>
                  <p className="text-xs text-gray-400 mb-1">Moderations</p>
                  <textarea
                    rows={4}
                    className={inputCls}
                    placeholder="Extra context for grading moderations."
                    value={moderationNotes}
                    onChange={(e) => setModerationNotes(e.target.value)}
                    disabled={isRunning}
                  />
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="text-sm font-medium text-gray-700">
                    Additional notes for AI
                    <span className="ml-1.5 font-normal text-gray-400 text-xs">— shared with the assignment</span>
                  </label>
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
                  disabled={isRunning}
                />
              </div>
            )}
          </div>

          {/* ── Topic Attachments ── */}
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
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Attachment instructions
                    <span className="ml-1 font-normal text-gray-400">— global rule for how the AI should use these files across all topics</span>
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

                <TopicAttachmentManager
                  classId={classId}
                  assignmentId={assignmentId}
                  globalInstruction={topicAttachmentInstructions}
                  overrides={topicInstructionOverrides}
                  onOverrideChange={setTopicInstructionOverrides}
                  onAttachmentsChange={isNewSubmissionsMode ? handleTopicAttachmentsChange : undefined}
                />
              </>
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

          {/* Output Format */}
          <div>
            <p className="text-xs font-normal text-gray-400 mb-1">
              <span className="text-sm font-medium text-gray-700">Output Format</span>
              <span className="ml-1.5">— shared with the assignment</span>
            </p>
            <FeedbackFormatPicker value={feedbackFormat} onChange={setFeedbackFormat} disabled={isRunning} />
          </div>
        </section>

        {/* ── Preview ── */}
        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800">Preview</h2>
              {markingMode === 'teacher_supervised_ai' && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Grades {sampleSize} sample submissions with the current settings. Extend to seek grade spread (up to 15 total).
                </p>
              )}
            </div>
            {markingMode === 'teacher_supervised_ai' && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {isRunning && (
                  <button
                    onClick={handleCancelPreview}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                )}
                {hasAnyResults && !isRunning && !running && !extending && (
                  <button
                    onClick={handleClearAllPreviews}
                    disabled={clearing}
                    className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                  >
                    {clearing ? 'Clearing…' : clearLabel}
                  </button>
                )}
                {/* Extend and Run buttons — hidden entirely while any grading is active */}
                {!isRunning && !running && !extending && (
                  <>
                    {hasResourceResults && !resourceExtended && !settingsChangedSincePreview && (
                      <button
                        onClick={() => handleExtendPreview('resource')}
                        title="Grade more resource samples seeking grade spread (up to 15 total)"
                        className="px-3 py-1.5 text-sm rounded-lg border transition-colors border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                      >
                        Extend Resource Preview
                      </button>
                    )}
                    {isRnM && hasModerationResults && !moderationExtended && !settingsChangedSincePreview && (
                      <button
                        onClick={() => handleExtendPreview('moderation')}
                        title="Grade more moderation samples seeking grade spread (up to 15 total)"
                        className="px-3 py-1.5 text-sm rounded-lg border transition-colors border-violet-300 text-violet-700 hover:bg-violet-50"
                      >
                        Extend Moderation Preview
                      </button>
                    )}
                    {(!hasResourceResults || settingsChangedSincePreview) && (
                      <button
                        onClick={() => handleRunPreview('resource')}
                        title="Grade 3 sample resource submissions"
                        className="px-3 py-1.5 text-sm rounded-lg border transition-colors bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700"
                      >
                        Run Resource Preview
                      </button>
                    )}
                    {isRnM && (!hasModerationResults || settingsChangedSincePreview) && (
                      <button
                        onClick={() => handleRunPreview('moderation')}
                        title="Grade 3 sample moderation submissions"
                        className="px-3 py-1.5 text-sm rounded-lg border transition-colors bg-violet-600 border-violet-600 text-white hover:bg-violet-700"
                      >
                        Run Moderation Preview
                      </button>
                    )}
                  </>
                )}
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
                    {displayTotal === 0
                      ? `Starting ${runningType === 'moderation' ? 'moderation' : 'resource'} preview…`
                      : `Grading ${runningType === 'moderation' ? 'moderations' : 'resources'}… ${previewJob.graded} / ${displayTotal}`}
                  </p>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${runningType === 'moderation' ? 'bg-violet-500' : 'bg-indigo-500'}`}
                      style={{ width: (status === 'queued' || previewJob.total === 0) ? '0%' : `${progressPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* No preview yet */}
              {!hasAnyResults && !isRunning && (
                <p className="text-sm text-gray-400">
                  Run a preview to see how the AI grades sample submissions with the current settings.
                </p>
              )}

              {/* Results — Resources / Moderations tab toggle + grade band grid */}
              {(hasAnyResults || (isRunning && allResults.length > 0)) && (
                <div className="space-y-4">
                  {/* Tab toggle — only shown for R&M assignments */}
                  {isRnM && (hasResourceResults || hasModerationResults) && (
                    <div className="flex gap-1 border-b border-gray-200 pb-0">
                      {[
                        { key: 'resource', label: 'Resources', has: hasResourceResults },
                        { key: 'moderation', label: 'Moderations', has: hasModerationResults },
                      ].map(({ key, label, has }) => (
                        <button
                          key={key}
                          onClick={() => has && handlePreviewTabChange(key)}
                          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                            previewTab === key
                              ? key === 'moderation'
                                ? 'border-violet-600 text-violet-700'
                                : 'border-indigo-600 text-indigo-700'
                              : has
                              ? 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                              : 'border-transparent text-gray-300 cursor-default'
                          }`}
                        >
                          {label}
                          {has && (
                            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                              previewTab === key
                                ? key === 'moderation' ? 'bg-violet-100 text-violet-700' : 'bg-indigo-100 text-indigo-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {key === 'resource' ? resourceResults.length : moderationResults.length}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Sample count line */}
                  {totalResources != null && previewTab === 'resource' && (
                    <p className="text-xs text-gray-400">
                      {resourceResults.length} of {totalResources} resource{totalResources !== 1 ? 's' : ''} sampled
                      {resourceResults.length >= totalResources && (
                        <span className="ml-1 text-amber-500">— all resources graded, no more available</span>
                      )}
                      {resourceResults.length < totalResources && resourceResults.length >= 15 && (
                        <span className="ml-1">— maximum sample size reached</span>
                      )}
                    </p>
                  )}

                  {/* No results for this tab yet */}
                  {activeResults.length === 0 && !isRunning && (
                    <p className="text-sm text-gray-400 italic">
                      No {previewTab === 'moderation' ? 'moderation' : 'resource'} samples yet — run the{' '}
                      {previewTab === 'moderation' ? 'Moderation' : 'Resource'} Preview above.
                    </p>
                  )}

                  {/* Grade band grid */}
                  {activeResults.length > 0 && levelOrder.length > 0 && (
                    <>
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
                                  ? previewTab === 'moderation'
                                    ? 'bg-violet-600 border-violet-600 text-white'
                                    : 'bg-indigo-600 border-indigo-600 text-white'
                                  : count > 0
                                  ? previewTab === 'moderation'
                                    ? 'border-gray-300 hover:border-violet-400 hover:bg-violet-50 cursor-pointer'
                                    : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer'
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
                          No samples at <strong>{activeGrade}</strong> yet — extend the preview to grade more samples.
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
                            rubric={activeRubric}
                            index={previewIdx}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {status === 'cancelled' && !hasAnyResults && (
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
                {settingsChangedSincePreview
                  ? 'Settings have changed — run a new preview before grading.'
                  : isComplete
                  ? 'Happy with the preview? Accept the current settings and grade all submissions.'
                  : 'Run a preview first to verify the AI output before grading everything.'}
              </p>
            </div>
            <button
              onClick={handleAcceptAndGradeAll}
              disabled={!isComplete || accepting || isRunning || settingsChangedSincePreview}
              className={`px-4 py-2 text-sm rounded-lg shrink-0 font-medium ${
                isComplete && !accepting && !isRunning && !settingsChangedSincePreview
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
