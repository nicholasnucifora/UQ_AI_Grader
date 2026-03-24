import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import SubmitAssignmentModal from '../components/SubmitAssignmentModal'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api/client'
import { StudentGradeTable, TeacherGradingPanel } from '../components/Marking'

export default function AssignmentPage() {
  const { id: classId, aid: assignmentId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [assignment, setAssignment] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [loadingAssignment, setLoadingAssignment] = useState(true)
  const [loadingSubmissions, setLoadingSubmissions] = useState(true)
  const [showSubmit, setShowSubmit] = useState(false)
  const [myMemberRole, setMyMemberRole] = useState(null)
  const [rippleStats, setRippleStats] = useState(null)
  const [rippleImporting, setRippleImporting] = useState(false)
  const [rippleMessage, setRippleMessage] = useState(null)
  const [rippleSkippedDetails, setRippleSkippedDetails] = useState([])
  const [showSkippedDetails, setShowSkippedDetails] = useState(false)
  const [clearingAiGrades, setClearingAiGrades] = useState(false)
  const [gradeJob, setGradeJob] = useState(null)
  const [gradeResults, setGradeResults] = useState(null)
  const [gradeReport, setGradeReport] = useState(null)
  const [gradingError, setGradingError] = useState(null)
  const [startingGrading, setStartingGrading] = useState(false)
  const [rubricData, setRubricData] = useState(null)
  // Teacher grading queues — one per result type, idx managed inside the panel
  const [teacherResQueue, setTeacherResQueue] = useState([])
  const [teacherModQueue, setTeacherModQueue] = useState([])
  // Topics
  const [topics, setTopics] = useState([])
  const [className, setClassName] = useState(null)

  useEffect(() => {
    let cancelled = false

    // Reset stale state from previous assignment immediately
    setAssignment(null)
    setSubmissions([])
    setRippleStats(null)
    setRubricData(null)
    setTopics([])
    setGradeJob(null)
    setGradeResults(null)
    setGradeReport(null)
    setClassName(null)
    setMyMemberRole(null)
    setLoadingAssignment(true)
    setLoadingSubmissions(true)

    api.getClass(classId).then((cls) => {
      if (cancelled) return
      setClassName(cls.name)
      const m = cls.members.find((mem) => mem.user_id === user?.user_id)
      const role = m?.role ?? 'student'
      setMyMemberRole(role)
      if (role === 'teacher') {
        api.getRippleStats(classId, assignmentId).then((d) => { if (!cancelled) setRippleStats(d) }).catch(() => {})
        api.getRubric(classId, assignmentId).then((d) => { if (!cancelled) setRubricData(d) }).catch(() => {})
        api.getTopics(classId, assignmentId).then((d) => { if (!cancelled) setTopics(d) }).catch(() => {})
        api.getGradeStatus(classId, assignmentId)
          .then((job) => {
            if (cancelled) return
            setGradeJob(job ?? null)
            if (job?.status === 'complete') {
              api.getGradeResults(classId, assignmentId).then((d) => { if (!cancelled) setGradeResults(d) }).catch(() => {})
              api.getGradeReport(classId, assignmentId).then((d) => { if (!cancelled) setGradeReport(d) }).catch(() => {})
            }
          })
          .catch(() => {})
      }
    })

    api.getAssignment(classId, assignmentId)
      .then((d) => { if (!cancelled) setAssignment(d) })
      .finally(() => { if (!cancelled) setLoadingAssignment(false) })

    api.listSubmissions(classId, assignmentId)
      .then((d) => { if (!cancelled) setSubmissions(d) })
      .finally(() => { if (!cancelled) setLoadingSubmissions(false) })

    return () => { cancelled = true }
  }, [classId, assignmentId, user])

  async function handleClearRippleData() {
    if (!window.confirm('This will permanently delete all RiPPLE data (resources and moderations) and any AI grading and teacher marking for this assignment. Continue?')) return
    setRippleImporting(true)
    setRippleMessage(null)
    try {
      await api.clearRippleData(classId, assignmentId)
      // Also wipe grading if there is any
      if (gradeJob) {
        await api.deleteGrading(classId, assignmentId).catch(() => {})
        setGradeJob(null)
        setGradeResults(null)
        setGradeReport(null)
        setTeacherResQueue([])
        setTeacherModQueue([])
      }
      setRippleStats({ resources: 0, moderations: 0 })
      setTopics([])
      setRippleMessage({ ok: true, text: 'RiPPLE data, AI grading, and teacher marking cleared.' })
    } catch (err) {
      setRippleMessage({ ok: false, text: err.message })
    } finally {
      setRippleImporting(false)
    }
  }

  async function handleClearAiGrades() {
    if (!window.confirm('This will remove all AI grades for this assignment. Teacher marks will be preserved. Continue?')) return
    setClearingAiGrades(true)
    setRippleMessage(null)
    try {
      await api.clearAiGrades(classId, assignmentId)
      setGradeJob(null)
      setGradeResults(null)
      setGradeReport(null)
      setTeacherResQueue([])
      setTeacherModQueue([])
      setRippleMessage({ ok: true, text: 'AI grades cleared. Teacher marks were preserved.' })
    } catch (err) {
      setRippleMessage({ ok: false, text: err.message })
    } finally {
      setClearingAiGrades(false)
    }
  }

  async function handleRippleCsvUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setRippleImporting(true)
    setRippleMessage(null)
    setRippleSkippedDetails([])
    setShowSkippedDetails(false)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const result = await api.importRippleCsv(classId, assignmentId, formData)
      if (result.type === 'moderation' && assignment?.assignment_type === 'resources') {
        setRippleMessage({ ok: false, text: 'This assignment only accepts resources. To use moderation data, edit the assignment and change the type to "Resources & Moderations".' })
      } else {
        const label = result.type === 'resource' ? 'Resource' : 'Moderation'
        setRippleMessage({ ok: true, text: `${label} export — ${result.imported} new records added`, skipped: result.skipped })
        setRippleSkippedDetails(result.skipped_details || [])
        api.getRippleStats(classId, assignmentId).then(setRippleStats).catch(() => {})
        api.getTopics(classId, assignmentId).then(setTopics).catch(() => {})
      }
    } catch (err) {
      setRippleMessage({ ok: false, text: err.message })
    } finally {
      setRippleImporting(false)
    }
  }

  // Poll for grading status when a full (non-preview) job is active
  useEffect(() => {
    if (!gradeJob || gradeJob.is_preview) return
    const active = gradeJob.status === 'queued' || gradeJob.status === 'running'
    if (!active) {
      if (gradeJob.status === 'complete') {
        api.getGradeResults(classId, assignmentId).then(setGradeResults).catch(() => {})
        api.getGradeReport(classId, assignmentId).then(setGradeReport).catch(() => {})
      }
      return
    }
    const interval = setInterval(() => {
      api.getGradeStatus(classId, assignmentId)
        .then((job) => {
          setGradeJob(job ?? null)
          if (job && job.status === 'complete') {
            api.getGradeResults(classId, assignmentId).then(setGradeResults).catch(() => {})
            api.getGradeReport(classId, assignmentId).then(setGradeReport).catch(() => {})
          }
        })
        .catch(() => {})
    }, 3000)
    return () => clearInterval(interval)
  }, [gradeJob?.status, classId, assignmentId])

  async function handleStartGrading() {
    setGradingError(null)
    setStartingGrading(true)
    try {
      const job = await api.startGrading(classId, assignmentId)
      setGradeJob(job)
      setGradeResults(null)
      setGradeReport(null)
    } catch (err) {
      setGradingError(err.message)
    } finally {
      setStartingGrading(false)
    }
  }

  async function handleCancelGrading() {
    setGradingError(null)
    try {
      const job = await api.cancelGrading(classId, assignmentId)
      setGradeJob(job)
    } catch (err) {
      setGradingError(err.message)
    }
  }

  async function handleDeleteGrading() {
    setGradingError(null)
    try {
      await api.deleteGrading(classId, assignmentId)
      setGradeJob(null)
      setGradeResults(null)
      setGradeReport(null)
      setTeacherResQueue([])
      setTeacherModQueue([])
    } catch (err) {
      setGradingError(err.message)
    }
  }

  function buildTeacherQueues(results) {
    const sorted = (arr) =>
      [...arr].sort((a, b) => {
        if (!a.teacher_graded_at && b.teacher_graded_at) return -1
        if (a.teacher_graded_at && !b.teacher_graded_at) return 1
        return 0
      })
    return {
      resource: sorted((results ?? []).filter((r) => r.result_type === 'resource' && r.status === 'complete')),
      moderation: sorted((results ?? []).filter((r) => r.result_type === 'moderation' && r.status === 'complete')),
    }
  }

  function handleOpenTeacherTab(results) {
    const { resource, moderation } = buildTeacherQueues(results ?? gradeResults)
    setTeacherResQueue(resource)
    setTeacherModQueue(moderation)
  }

  async function handleEmailResult(resultId, toEmail) {
    return api.openGradeEmail(classId, assignmentId, resultId, toEmail)
  }

  async function handleEmailStudentAll(studentId, toEmail) {
    return api.openStudentGradeEmail(classId, assignmentId, studentId, { toEmail })
  }

  async function handleEmailStudentTopic(studentId, topic, toEmail) {
    return api.openStudentGradeEmail(classId, assignmentId, studentId, { toEmail, topic })
  }

  async function handleSaveTeacherGrade(resultId, criterionGrades) {
    setGradingError(null)
    try {
      const updated = await api.saveTeacherGrade(classId, assignmentId, resultId, {
        criterion_grades: criterionGrades,
      })
      const patch = (prev) => prev.map((r) => (r.id === resultId ? { ...r, ...updated } : r))
      setGradeResults(patch)
      setTeacherResQueue(patch)
      setTeacherModQueue(patch)
    } catch (err) {
      setGradingError(err.message)
    }
  }

  if (loadingAssignment) return <Layout><p className="text-gray-500">Loading…</p></Layout>
  if (!assignment) return <Layout><p className="text-red-600">Assignment not found.</p></Layout>

  const isTeacher = myMemberRole === 'teacher'
  const mySubmission = submissions.find((s) => s.student_user_id === user?.user_id)

  function handleSubmitted(submission) {
    setSubmissions((prev) => [...prev, submission])
    setShowSubmit(false)
  }

  return (
    <Layout>
      <div className="max-w-screen-2xl mx-auto">
        {/* Breadcrumb */}
        <p className="text-sm text-gray-500 mb-1">
          <Link to="/" className="hover:underline">My Classes</Link>
          {' / '}
          <Link to={`/classes/${classId}`} className="hover:underline">{className ?? '…'}</Link>
          {' /'}
        </p>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-gray-900">{assignment.title}</h1>
            </div>
            {assignment.description && (
              <p className="text-gray-600 mt-1">{assignment.description}</p>
            )}
          </div>
          {isTeacher && (
            <button
              onClick={() => navigate(`/classes/${classId}/assignments/${assignmentId}/edit`)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 shrink-0"
            >
              Edit
            </button>
          )}
        </div>

        {/* Marking criteria */}
        {assignment.marking_criteria && (
          <section className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
            <h2 className="font-semibold text-gray-800 mb-2">Marking Criteria</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{assignment.marking_criteria}</p>
          </section>
        )}

        {/* RiPPLE Data — teacher only */}
        {isTeacher && (
          <section className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800">RiPPLE Data</h2>
                {rippleStats && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    Resources: {rippleStats.resources} rows
                    {assignment?.assignment_type !== 'resources' && (
                      <> · Moderations: {rippleStats.moderations} rows</>
                    )}
                  </p>
                )}
                {rippleMessage && (
                  <div className="mt-1">
                    <p className={`text-sm ${rippleMessage.ok ? 'text-green-600' : 'text-red-600'}`}>
                      {rippleMessage.ok ? '✓ ' : ''}{rippleMessage.text}
                      {rippleMessage.ok && rippleMessage.skipped > 0 && (
                        <button
                          onClick={() => setShowSkippedDetails(v => !v)}
                          className="ml-1 underline decoration-dotted cursor-pointer"
                        >
                          ({rippleMessage.skipped} skipped {showSkippedDetails ? '▲' : '▼'})
                        </button>
                      )}
                    </p>
                    {showSkippedDetails && rippleSkippedDetails.length > 0 && (
                      <ul className="mt-1 text-xs text-gray-500 border border-gray-200 rounded p-2 space-y-0.5 max-h-48 overflow-y-auto">
                        {rippleSkippedDetails.map((row, i) => (
                          <li key={i}>
                            <span className="font-mono text-gray-700">{row.resource_id}</span>
                            {' — '}{row.reason}
                            {row.detail ? <span className="text-gray-400"> ({row.detail})</span> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {gradeJob && !gradeJob.is_preview && (
                  <button
                    onClick={handleClearAiGrades}
                    disabled={clearingAiGrades || rippleImporting}
                    className={`px-3 py-1.5 text-sm rounded-lg border ${
                      clearingAiGrades || rippleImporting
                        ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                        : 'border-amber-300 text-amber-700 hover:bg-amber-50'
                    }`}
                  >
                    {clearingAiGrades ? 'Clearing…' : 'Clear AI Grades'}
                  </button>
                )}
                {rippleStats && (rippleStats.resources > 0 || rippleStats.moderations > 0) && (
                  <button
                    onClick={handleClearRippleData}
                    disabled={rippleImporting}
                    className={`px-3 py-1.5 text-sm rounded-lg border ${
                      rippleImporting
                        ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                        : 'border-red-300 text-red-600 hover:bg-red-50'
                    }`}
                  >
                    Clear Data
                  </button>
                )}
                <label className={`px-3 py-1.5 text-sm rounded-lg cursor-pointer ${
                  rippleImporting
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}>
                  {rippleImporting ? 'Importing…' : 'Import CSV'}
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    disabled={rippleImporting}
                    onChange={handleRippleCsvUpload}
                  />
                </label>
              </div>
            </div>
          </section>
        )}

        {/* Grading — teacher only */}
        {isTeacher && (
          <GradingSection
            classId={classId}
            assignmentId={assignmentId}
            rippleStats={rippleStats}
            assignment={assignment}
            gradeJob={gradeJob && !gradeJob.is_preview ? gradeJob : null}
            gradeResults={gradeResults}
            gradeReport={gradeReport}
            gradingError={gradingError}
            setGradingError={setGradingError}
            startingGrading={startingGrading}
            rubricData={rubricData}
            teacherResQueue={teacherResQueue}
            teacherModQueue={teacherModQueue}
            onStart={handleStartGrading}
            onCancel={handleCancelGrading}
            onDelete={handleDeleteGrading}
            onOpenTeacherTab={handleOpenTeacherTab}
            onSaveTeacherGrade={handleSaveTeacherGrade}
            onEmailResult={handleEmailResult}
            onEmailStudentAll={handleEmailStudentAll}
            onEmailStudentTopic={handleEmailStudentTopic}
            emailDomain={user?.student_email_domain || ''}
          />
        )}

        {/* Topics — teacher only */}
        {isTeacher && topics.length > 0 && (
          <section className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
            <h2 className="font-semibold text-gray-800 mb-4">Topics</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {topics.map(({ topic, resource_count, moderation_count }) => (
                <Link
                  key={topic}
                  to={`/classes/${classId}/assignments/${assignmentId}/topics/${encodeURIComponent(topic)}`}
                  className="flex flex-col gap-1 p-3 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors group"
                >
                  <span className="text-sm font-medium text-gray-800 group-hover:text-indigo-700 leading-snug">{topic}</span>
                  <span className="text-xs text-gray-400">
                    {resource_count} resource{resource_count !== 1 ? 's' : ''}
                    {moderation_count > 0 && `, ${moderation_count} moderation${moderation_count !== 1 ? 's' : ''}`}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Submissions section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">
              {isTeacher ? `Submissions (${submissions.length})` : 'My Submission'}
            </h2>
            {!isTeacher && !mySubmission && (
              <button
                onClick={() => setShowSubmit(true)}
                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
              >
                Submit
              </button>
            )}
          </div>

          {loadingSubmissions ? (
            <p className="text-sm text-gray-500">Loading submissions…</p>
          ) : isTeacher ? (
            <TeacherSubmissionsTable submissions={submissions} />
          ) : mySubmission ? (
            <StudentSubmissionView submission={mySubmission} />
          ) : (
            <p className="text-sm text-gray-500">You haven't submitted yet.</p>
          )}
        </section>
      </div>

      {showSubmit && (
        <SubmitAssignmentModal
          classId={classId}
          assignmentId={assignmentId}
          onClose={() => setShowSubmit(false)}
          onSubmitted={handleSubmitted}
        />
      )}
    </Layout>
  )
}

function TeacherSubmissionsTable({ submissions }) {
  if (submissions.length === 0) {
    return <p className="text-sm text-gray-500">No submissions yet.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
        <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
          <tr>
            <th className="px-4 py-3 text-left">Student</th>
            <th className="px-4 py-3 text-left">Submitted</th>
            <th className="px-4 py-3 text-left">Preview</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {submissions.map((s) => (
            <tr key={s.id} className="bg-white hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-800">{s.student_user_id}</td>
              <td className="px-4 py-3 text-gray-500">
                {new Date(s.submitted_at).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-gray-600 truncate max-w-xs">{s.content}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StudentSubmissionView({ submission }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-xs text-gray-500 mb-3">
        Submitted {new Date(submission.submitted_at).toLocaleString()}
      </p>
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{submission.content}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grading section — tabbed: AI Grading | Teacher Marking
// ---------------------------------------------------------------------------

function GradingSection({
  classId,
  assignmentId,
  rippleStats,
  assignment,
  gradeJob,
  gradeResults,
  gradeReport,
  gradingError,
  setGradingError,
  startingGrading,
  rubricData,
  teacherResQueue,
  teacherModQueue,
  onStart,
  onCancel,
  onDelete,
  onOpenTeacherTab,
  onSaveTeacherGrade,
  onEmailResult,
  onEmailStudentAll,
  onEmailStudentTopic,
  emailDomain,
}) {
  const navigate = useNavigate()
  const [sectionOpen, setSectionOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('ai') // 'ai' | 'teacher'
  const [startAtResultId, setStartAtResultId] = useState(null)

  function handleGradeNow(result) {
    onOpenTeacherTab()
    setActiveTab('teacher')
    setStartAtResultId(result.id)
  }

  const hasResources = rippleStats && rippleStats.resources > 0
  const status = gradeJob?.status
  const isRnM = assignment.assignment_type === 'resources_and_moderations'
  const isComplete = status === 'complete' && gradeResults && gradeResults.length > 0

  const progressPct =
    gradeJob && gradeJob.total > 0
      ? Math.round((gradeJob.graded / gradeJob.total) * 100)
      : 0

  const resourceResults = gradeResults?.filter((r) => r.result_type === 'resource') ?? []
  const moderationResults = gradeResults?.filter((r) => r.result_type === 'moderation') ?? []
  const resGradedCount = teacherResQueue.filter((r) => r.teacher_graded_at).length
  const modGradedCount = teacherModQueue.filter((r) => r.teacher_graded_at).length

  const resourceRubric = rubricData?.rubric ?? null
  const moderationRubric = rubricData?.moderation_rubric ?? null

  function switchToTeacherTab() {
    onOpenTeacherTab()
    setActiveTab('teacher')
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl mb-6 overflow-hidden">
      {/* Section header — click to expand/collapse */}
      <button
        onClick={() => setSectionOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-gray-800">Overall Grading</h2>
          {gradeJob && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              status === 'complete' ? 'bg-green-100 text-green-700' :
              status === 'running' ? 'bg-indigo-100 text-indigo-700' :
              status === 'queued' ? 'bg-yellow-100 text-yellow-700' :
              'bg-gray-100 text-gray-500'
            }`}>
              {status === 'complete'
                ? isRnM
                  ? `${resourceResults.length} resources · ${moderationResults.length} moderations`
                  : `${gradeJob.graded} graded`
                : status}
            </span>
          )}
        </div>
        <span className="text-gray-400 text-sm">{sectionOpen ? '▲' : '▼'}</span>
      </button>

      {sectionOpen && (
        <>
      {/* Tab bar — only shown when complete */}
      {isComplete && (
        <div className="flex border-b border-gray-100">
          <TabButton active={activeTab === 'ai'} onClick={() => setActiveTab('ai')}>
            AI Grading
            <span className="ml-1.5 text-xs opacity-60">
              {isRnM
                ? `${resourceResults.length} res · ${moderationResults.length} mod`
                : gradeJob.graded}
            </span>
          </TabButton>
          <TabButton
            active={activeTab === 'teacher'}
            onClick={switchToTeacherTab}
          >
            Teacher Marking
            <span className="ml-1.5 text-xs opacity-60">
              {resGradedCount}/{teacherResQueue.length}
              {isRnM && teacherModQueue.length > 0 && ` · ${modGradedCount}/${teacherModQueue.length}`}
            </span>
          </TabButton>
        </div>
      )}

      <div className="p-5">
        {/* Inline error */}
        {gradingError && (
          <div className="flex items-start justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">
            <span>{gradingError}</span>
            <button onClick={() => setGradingError(null)} className="ml-3 text-red-400 hover:text-red-600 shrink-0">✕</button>
          </div>
        )}

        {/* ── AI tab (or pre-complete state) ── */}
        {(!isComplete || activeTab === 'ai') && (
          <div>
            {/* No job yet */}
            {!gradeJob && (
              <div className="flex items-center gap-3">
                {assignment.marking_mode === 'teacher_supervised_ai' ? (
                  <button
                    onClick={() => navigate(`/classes/${classId}/assignments/${assignmentId}/grading-setup`)}
                    disabled={!hasResources}
                    className={`px-3 py-1.5 text-sm rounded-lg ${
                      hasResources
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    Setup AI Grading
                  </button>
                ) : (
                  <button
                    onClick={onStart}
                    disabled={startingGrading || !hasResources}
                    className={`px-3 py-1.5 text-sm rounded-lg ${
                      hasResources && !startingGrading
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {startingGrading ? 'Starting…' : 'Start AI Grading'}
                  </button>
                )}
                {!hasResources && (
                  <span className="text-sm text-gray-400">
                    {rippleStats ? 'Upload a RiPPLE resource CSV first' : 'Loading…'}
                  </span>
                )}
              </div>
            )}

            {/* Queued */}
            {status === 'queued' && (
              <p className="text-sm text-gray-500">Queued — worker will pick this up shortly…</p>
            )}

            {/* Running */}
            {status === 'running' && (() => {
              const resTotal = rippleStats?.resources ?? 0
              const modTotal = rippleStats?.moderations ?? 0
              // Incremental re-run: job.total only counts pending items (starts at 0)
              const isIncremental = (resTotal + modTotal) > 0 && gradeJob.total < (resTotal + modTotal)
              const pct = gradeJob.total > 0 ? Math.round((gradeJob.graded / gradeJob.total) * 100) : 0
              const inPhase2 = !isIncremental && isRnM && resTotal > 0 && gradeJob.graded >= resTotal
              const phaseGraded = inPhase2 ? gradeJob.graded - resTotal : gradeJob.graded
              const phaseTotal = inPhase2 ? modTotal : (resTotal || gradeJob.total)
              const phasePct = phaseTotal > 0 ? Math.round((phaseGraded / phaseTotal) * 100) : 0
              return (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm text-gray-700">
                      {isIncremental ? (
                        <span>Grading new submissions <span className="font-medium">{gradeJob.graded} / {gradeJob.total}</span></span>
                      ) : isRnM ? (
                        inPhase2 ? (
                          <span>
                            <span className="text-emerald-600 font-medium">Resources done</span>
                            {' — grading moderations '}
                            <span className="font-medium">{phaseGraded} / {modTotal}</span>
                          </span>
                        ) : (
                          <span>
                            Grading resources{' '}
                            <span className="font-medium">{phaseGraded} / {resTotal}</span>
                            {modTotal > 0 && <span className="text-gray-400"> · then {modTotal} moderations</span>}
                          </span>
                        )
                      ) : (
                        <span>Grading… <span className="font-medium">{gradeJob.graded} / {gradeJob.total}</span></span>
                      )}
                    </div>
                    <button
                      onClick={onCancel}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-indigo-500 h-2 rounded-full transition-all"
                      style={{ width: `${isIncremental ? pct : phasePct}%` }}
                    />
                  </div>
                </div>
              )
            })()}

            {/* Cancelled / Error */}
            {(status === 'cancelled' || status === 'error') && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500 capitalize">{status}</span>
                <button
                  onClick={onDelete}
                  className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                >
                  Delete Grading
                </button>
              </div>
            )}

            {/* Complete — re-run for new data */}
            {isComplete && (
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-500">
                  Imported new CSV data? Re-run to grade ungraded submissions.
                </span>
                <button
                  onClick={() => navigate(`/classes/${classId}/assignments/${assignmentId}/grading-setup?mode=new_submissions`)}
                  disabled={!hasResources}
                  className={`px-3 py-1.5 text-sm rounded-lg shrink-0 ml-4 ${
                    hasResources
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  Grade New Submissions
                </button>
              </div>
            )}

            {/* Complete — results */}
            {isComplete && (
              <>
                <StudentGradeTable
                  results={gradeResults}
                  emailDomain={emailDomain}
                  onEmail={onEmailResult}
                  onEmailAll={onEmailStudentAll}
                  onEmailTopic={onEmailStudentTopic}
                  onGradeNow={handleGradeNow}
                  assignment={assignment}
                  resourceRubric={resourceRubric}
                  moderationRubric={moderationRubric}
                />
                {gradeReport && (
                  <div className="mt-6 space-y-6">
                    <CriterionDifficultyChart data={gradeReport.criterion_difficulty} />
                    <TopicBreakdownTable data={gradeReport.topic_breakdown} />
                    {gradeReport.moderation_criterion_difficulty?.length > 0 && (
                      <CriterionDifficultyChart data={gradeReport.moderation_criterion_difficulty} />
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Teacher Marking tab ── */}
        {isComplete && activeTab === 'teacher' && (
          <TeacherGradingPanel
            resourceQueue={teacherResQueue}
            moderationQueue={teacherModQueue}
            resourceRubric={resourceRubric}
            moderationRubric={moderationRubric}
            onSave={onSaveTeacherGrade}
            isRnM={isRnM}
            startAtResultId={startAtResultId}
          />
        )}
      </div>
        </>
      )}
    </section>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Analytics helpers
// ---------------------------------------------------------------------------

function PctBar({ pct, colour = 'bg-indigo-500' }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div className={`${colour} h-2 rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-9 text-right">{pct}%</span>
    </div>
  )
}

function CriterionDifficultyChart({ data }) {
  if (!data || data.length === 0) return null
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 mb-3">
        Criterion Difficulty <span className="font-normal text-gray-400">(hardest → easiest)</span>
      </h4>
      <div className="space-y-3">
        {data.map((c) => {
          const colour = c.avg_pct < 50 ? 'bg-red-400' : c.avg_pct < 75 ? 'bg-yellow-400' : 'bg-green-400'
          return (
            <div key={c.criterion_id}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-gray-700">{c.criterion_name}</span>
                <span className="text-gray-500">avg {c.avg_points} / {c.max_points} pts</span>
              </div>
              <PctBar pct={c.avg_pct} colour={colour} />
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-400">
                {Object.entries(c.level_distribution)
                  .sort((a, b) => b[1] - a[1])
                  .map(([lvl, count]) => (
                    <span key={lvl}>{lvl}: {count}</span>
                  ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TopicBreakdownTable({ data }) {
  if (!data || data.length === 0) return null
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 mb-3">Performance by Topic</h4>
      <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
        <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
          <tr>
            <th className="px-4 py-2 text-left">Topic</th>
            <th className="px-4 py-2 text-left">Resources</th>
            <th className="px-4 py-2 text-left">Avg score</th>
            <th className="px-4 py-2 text-left w-40">Avg %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((t) => {
            const colour = t.avg_pct < 50 ? 'bg-red-400' : t.avg_pct < 75 ? 'bg-yellow-400' : 'bg-green-400'
            return (
              <tr key={t.topic} className="bg-white">
                <td className="px-4 py-2 text-gray-700">{t.topic}</td>
                <td className="px-4 py-2 text-gray-500">{t.count}</td>
                <td className="px-4 py-2 text-gray-700">{t.avg_score}</td>
                <td className="px-4 py-2 w-40">
                  <PctBar pct={t.avg_pct} colour={colour} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
