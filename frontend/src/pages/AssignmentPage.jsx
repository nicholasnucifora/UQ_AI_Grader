import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import SubmitAssignmentModal from '../components/SubmitAssignmentModal'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api/client'
import { StudentOverviewTable, TeacherGradingPanel, computeMaxPoints, computeStudentCombined, applyScaling, getEffectiveAssignment } from '../components/Marking'

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
  const newCsvKey = `hasNewCsvData:${classId}:${assignmentId}`
  const [hasNewCsvData, setHasNewCsvData] = useState(() => localStorage.getItem(newCsvKey) === 'true')
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
  const [exportSortOrder, setExportSortOrder] = useState('surname_asc')
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef(null)
  // Tab + filter state
  const [activeMainTab, setActiveMainTab] = useState('grades') // 'grades' | 'marking' | 'statistics'
  const [topicFilter, setTopicFilter] = useState(null)
  const [startAtResultId, setStartAtResultId] = useState(null)

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
            if (job) {
              api.getGradeResults(classId, assignmentId).then((d) => { if (!cancelled) setGradeResults(d) }).catch(() => {})
              if (job.status === 'complete') {
                api.getGradeReport(classId, assignmentId).then((d) => { if (!cancelled) setGradeReport(d) }).catch(() => {})
              }
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

  function handleExportAiGrades() {
    if (!gradeResults || gradeResults.length === 0) return
    const resourceRubric = rubricData?.rubric ?? null
    const moderationRubric = rubricData?.moderation_rubric ?? null
    const maxPossibleResource = computeMaxPoints(resourceRubric)
    const maxPossibleModeration = computeMaxPoints(moderationRubric ?? resourceRubric)
    const isRnM = assignment?.assignment_type === 'resources_and_moderations'

    // Build per-student data
    const studentMap = new Map()
    for (const r of gradeResults) {
      if (r.result_type === 'resource' && r.primary_author_id) {
        if (!studentMap.has(r.primary_author_id))
          studentMap.set(r.primary_author_id, { id: r.primary_author_id, name: r.primary_author_name, resources: [], moderations: [] })
        studentMap.get(r.primary_author_id).resources.push(r)
      }
      if (r.result_type === 'moderation' && r.moderation_user_id) {
        if (!studentMap.has(r.moderation_user_id))
          studentMap.set(r.moderation_user_id, { id: r.moderation_user_id, name: r.moderation_user_name || null, resources: [], moderations: [] })
        studentMap.get(r.moderation_user_id).moderations.push(r)
      }
    }

    let rows = [...studentMap.values()].map((s) => {
      const resAi = computeStudentCombined(s.resources, assignment?.combine_resource_max_n ?? null, maxPossibleResource, assignment, false, 'resource')
      const resTeacher = computeStudentCombined(s.resources, assignment?.combine_resource_max_n ?? null, maxPossibleResource, assignment, true, 'resource')
      const modAi = isRnM ? computeStudentCombined(s.moderations, assignment?.combine_moderation_max_n ?? null, maxPossibleModeration, assignment, false, 'moderation') : null
      const modTeacher = isRnM ? computeStudentCombined(s.moderations, assignment?.combine_moderation_max_n ?? null, maxPossibleModeration, assignment, true, 'moderation') : null
      const resAiGrade = resAi?.grade ?? null
      const modAiGrade = modAi?.grade ?? null
      // Overall = sum of available AI grades (null treated as absent, not 0)
      const overallAiGrade = resAiGrade !== null || modAiGrade !== null
        ? (resAiGrade ?? 0) + (modAiGrade ?? 0)
        : null
      return {
        ...s,
        resAiGrade,
        resTeacherGrade: resTeacher?.grade ?? null,
        modAiGrade,
        modTeacherGrade: modTeacher?.grade ?? null,
        overallAiGrade,
      }
    })

    function getSurname(name) {
      if (!name) return ''
      const parts = name.trim().split(/\s+/)
      return parts[parts.length - 1].toLowerCase()
    }

    switch (exportSortOrder) {
      case 'surname_asc':
        rows.sort((a, b) => getSurname(a.name).localeCompare(getSurname(b.name)))
        break
      case 'surname_desc':
        rows.sort((a, b) => getSurname(b.name).localeCompare(getSurname(a.name)))
        break
      case 'student_id_asc':
        rows.sort((a, b) => (a.id || '').localeCompare(b.id || ''))
        break
      case 'overall_desc':
        rows.sort((a, b) => (b.overallAiGrade ?? -Infinity) - (a.overallAiGrade ?? -Infinity))
        break
      case 'overall_asc':
        rows.sort((a, b) => (a.overallAiGrade ?? Infinity) - (b.overallAiGrade ?? Infinity))
        break
    }

    const headers = ['Student Name', 'Student ID', 'Overall AI Grade', 'Resource AI Grade']
    if (isRnM) headers.push('Moderation AI Grade')
    headers.push('Resource Teacher Grade')
    if (isRnM) headers.push('Moderation Teacher Grade')

    const csvRows = [headers, ...rows.map((s) => {
      const row = [
        s.name || s.id || '',
        s.id || '',
        s.overallAiGrade !== null ? s.overallAiGrade : '',
        s.resAiGrade !== null ? s.resAiGrade : '',
      ]
      if (isRnM) row.push(s.modAiGrade !== null ? s.modAiGrade : '')
      row.push(s.resTeacherGrade !== null ? s.resTeacherGrade : '')
      if (isRnM) row.push(s.modTeacherGrade !== null ? s.modTeacherGrade : '')
      return row
    })]

    const csvContent = csvRows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ai_grades_${(assignment?.name || 'export').replace(/[^a-z0-9]/gi, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
        if (result.imported > 0) { localStorage.setItem(newCsvKey, 'true'); setHasNewCsvData(true) }
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
        localStorage.removeItem(newCsvKey)
        setHasNewCsvData(false)
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
            localStorage.removeItem(newCsvKey)
            setHasNewCsvData(false)
          } else if (job && job.status === 'running') {
            api.getGradeResults(classId, assignmentId).then(setGradeResults).catch(() => {})
          }
        })
        .catch(() => {})
    }, 3000)
    return () => clearInterval(interval)
  }, [gradeJob?.status, classId, assignmentId])

  async function handleStartGrading() {
    setGradingError(null)
    setStartingGrading(true)
    localStorage.removeItem(newCsvKey)
    setHasNewCsvData(false)
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
      setGradeReport(null)
      // Only results from the cancelled run were deleted on the backend;
      // refetch to show any remaining results from previous completed runs.
      const remaining = await api.getGradeResults(classId, assignmentId).catch(() => [])
      const remArr = remaining ?? []
      setGradeResults(remArr.length > 0 ? remArr : null)
      const { resource, moderation } = buildTeacherQueues(remArr)
      setTeacherResQueue(resource)
      setTeacherModQueue(moderation)
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

  function handleGradeNow(result) {
    handleOpenTeacherTab()
    setActiveMainTab('marking')
    setStartAtResultId(result.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

  // Non-preview grading job
  const activeGradeJob = gradeJob && !gradeJob.is_preview ? gradeJob : null
  const status = activeGradeJob?.status
  const isRnM = assignment.assignment_type === 'resources_and_moderations'
  const isComplete = status === 'complete' && gradeResults && gradeResults.length > 0
  const hasResources = rippleStats && rippleStats.resources > 0
  const resourceResults = gradeResults?.filter((r) => r.result_type === 'resource') ?? []
  const moderationResults = gradeResults?.filter((r) => r.result_type === 'moderation') ?? []
  const resGradedCount = teacherResQueue.filter((r) => r.teacher_graded_at).length
  const modGradedCount = teacherModQueue.filter((r) => r.teacher_graded_at).length

  // Topic-filtered results for Grades tab
  const filteredResults = topicFilter && gradeResults
    ? gradeResults.filter((r) => (r.resource_topics ?? '').trim() === topicFilter)
    : gradeResults

  // Topic-filtered marking queues
  const filteredTeacherResQueue = topicFilter
    ? teacherResQueue.filter((r) => (r.resource_topics ?? '').trim() === topicFilter)
    : teacherResQueue
  const filteredTeacherModQueue = topicFilter
    ? teacherModQueue.filter((r) => (r.resource_topics ?? '').trim() === topicFilter)
    : teacherModQueue

  // Topic-filtered breakdown for Statistics tab
  const filteredTopicBreakdown = topicFilter && gradeReport?.topic_breakdown
    ? gradeReport.topic_breakdown.filter((t) => t.topic === topicFilter)
    : gradeReport?.topic_breakdown

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
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
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
                {gradingError && (
                  <div className="flex items-start justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3 mt-2 text-sm text-red-700">
                    <span>{gradingError}</span>
                    <button onClick={() => setGradingError(null)} className="ml-3 text-red-400 hover:text-red-600 shrink-0">✕</button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                {activeGradeJob && (
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
                {gradeResults && gradeResults.length > 0 && (
                  <div className="relative" ref={exportMenuRef}>
                    <button
                      onClick={() => setExportMenuOpen((o) => !o)}
                      className="px-3 py-1.5 text-sm rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5"
                    >
                      Export AI Grades
                      <span className="text-xs opacity-60">{exportMenuOpen ? '▲' : '▼'}</span>
                    </button>
                    {exportMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setExportMenuOpen(false)} />
                        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-20 w-52">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sort order</p>
                          <div className="space-y-1.5 mb-3">
                            {[
                              { value: 'surname_asc', label: 'Surname A→Z' },
                              { value: 'surname_desc', label: 'Surname Z→A' },
                              { value: 'student_id_asc', label: 'Student ID A→Z' },
                              { value: 'overall_desc', label: 'Overall Grade High→Low' },
                              { value: 'overall_asc', label: 'Overall Grade Low→High' },
                            ].map((opt) => (
                              <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                <input
                                  type="radio"
                                  name="exportSort"
                                  value={opt.value}
                                  checked={exportSortOrder === opt.value}
                                  onChange={() => setExportSortOrder(opt.value)}
                                  className="accent-emerald-600"
                                />
                                {opt.label}
                              </label>
                            ))}
                          </div>
                          <button
                            onClick={() => { handleExportAiGrades(); setExportMenuOpen(false) }}
                            className="w-full px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            Export
                          </button>
                        </div>
                      </>
                    )}
                  </div>
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
                {/* Grade with AI — shown when no active job */}
                {!activeGradeJob && (
                  assignment.marking_mode === 'teacher_supervised_ai' ? (
                    <button
                      onClick={() => navigate(`/classes/${classId}/assignments/${assignmentId}/grading-setup`)}
                      disabled={!hasResources || rippleImporting}
                      className={`px-3 py-1.5 text-sm rounded-lg font-medium ${
                        hasResources && !rippleImporting
                          ? 'bg-violet-600 text-white hover:bg-violet-700'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      Grade with AI
                    </button>
                  ) : (
                    <button
                      onClick={handleStartGrading}
                      disabled={startingGrading || !hasResources || rippleImporting}
                      className={`px-3 py-1.5 text-sm rounded-lg font-medium ${
                        hasResources && !startingGrading && !rippleImporting
                          ? 'bg-violet-600 text-white hover:bg-violet-700'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {startingGrading ? 'Starting…' : 'Grade with AI'}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Grade New Submissions banner */}
            {isComplete && hasNewCsvData && (
              <div className="flex items-center justify-between mt-4 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg">
                <span className="text-sm text-indigo-700 font-medium">
                  New CSV data uploaded — grade new submissions whenever you're ready.
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

            {/* Queued */}
            {status === 'queued' && (
              <p className="text-sm text-gray-500 mt-3">Queued — worker will pick this up shortly…</p>
            )}

            {/* Running — progress bar */}
            {status === 'running' && (() => {
              const resTotal = rippleStats?.resources ?? 0
              const modTotal = rippleStats?.moderations ?? 0
              const isIncremental = (resTotal + modTotal) > 0 && activeGradeJob.total < (resTotal + modTotal)
              const pct = activeGradeJob.total > 0 ? Math.round((activeGradeJob.graded / activeGradeJob.total) * 100) : 0
              const inPhase2 = !isIncremental && isRnM && resTotal > 0 && activeGradeJob.graded >= resTotal
              const phaseGraded = inPhase2 ? activeGradeJob.graded - resTotal : activeGradeJob.graded
              const phaseTotal = inPhase2 ? modTotal : (resTotal || activeGradeJob.total)
              const phasePct = phaseTotal > 0 ? Math.round((phaseGraded / phaseTotal) * 100) : 0
              return (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm text-gray-700">
                      {isIncremental ? (
                        <span>Grading new submissions <span className="font-medium">{activeGradeJob.graded} / {activeGradeJob.total}</span></span>
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
                        <span>Grading… <span className="font-medium">{activeGradeJob.graded} / {activeGradeJob.total}</span></span>
                      )}
                    </div>
                    <button
                      onClick={handleCancelGrading}
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
              <div className="flex items-center gap-3 mt-3">
                <span className="text-sm text-gray-500 capitalize">{status}</span>
                <button
                  onClick={handleDeleteGrading}
                  className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                >
                  Remove New Grades
                </button>
              </div>
            )}
          </section>
        )}

        {/* Main grading tabs — teacher only */}
        {isTeacher && (
          <section className="bg-white border border-gray-200 rounded-xl mb-6 overflow-hidden">
            {gradeResults && gradeResults.length > 0 ? (
              <>
                {/* Tab bar with topic filter on the right */}
                <div className="flex items-center justify-between border-b border-gray-100 pr-4">
                  <div className="flex">
                    <TabButton active={activeMainTab === 'grades'} onClick={() => setActiveMainTab('grades')}>
                      Grades
                      {activeGradeJob && (
                        <span className="ml-1.5 text-xs opacity-60">
                          {isRnM
                            ? `${resourceResults.length} res · ${moderationResults.length} mod`
                            : activeGradeJob.graded}
                        </span>
                      )}
                    </TabButton>
                    <TabButton
                      active={activeMainTab === 'marking'}
                      onClick={() => { handleOpenTeacherTab(); setActiveMainTab('marking') }}
                    >
                      Marking
                      <span className="ml-1.5 text-xs opacity-60">
                        {resGradedCount}/{teacherResQueue.length}
                        {isRnM && teacherModQueue.length > 0 && ` · ${modGradedCount}/${teacherModQueue.length}`}
                      </span>
                    </TabButton>
                    <TabButton active={activeMainTab === 'statistics'} onClick={() => setActiveMainTab('statistics')}>
                      Statistics
                    </TabButton>
                  </div>
                  {topics.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">Topic:</span>
                      <button
                        onClick={() => setTopicFilter(null)}
                        className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                          !topicFilter
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-gray-300 text-gray-500 hover:border-gray-400 hover:bg-gray-50'
                        }`}
                      >
                        All
                      </button>
                      {topics.map(({ topic }) => (
                        <button
                          key={topic}
                          onClick={() => setTopicFilter(topic)}
                          className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                            topicFilter === topic
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'border-gray-300 text-gray-500 hover:border-gray-400 hover:bg-gray-50'
                          }`}
                        >
                          {topic}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-5">
                  {/* Grades tab — always mounted to preserve table scroll/expand state */}
                  <div className={activeMainTab !== 'grades' ? 'hidden' : ''}>
                    <StudentOverviewTable
                      results={filteredResults}
                      emailDomain={user?.student_email_domain || ''}
                      onEmail={handleEmailResult}
                      onEmailAll={handleEmailStudentAll}
                      onEmailTopic={handleEmailStudentTopic}
                      onGradeNow={handleGradeNow}
                      assignment={assignment}
                      resourceRubric={rubricData?.rubric ?? null}
                      moderationRubric={rubricData?.moderation_rubric ?? null}
                      topicFilter={topicFilter}
                    />
                  </div>

                  {/* Marking tab — always mounted to preserve marking position */}
                  <div className={activeMainTab !== 'marking' ? 'hidden' : ''}>
                    <TeacherGradingPanel
                      resourceQueue={filteredTeacherResQueue}
                      moderationQueue={filteredTeacherModQueue}
                      resourceRubric={rubricData?.rubric ?? null}
                      moderationRubric={rubricData?.moderation_rubric ?? null}
                      onSave={handleSaveTeacherGrade}
                      isRnM={isRnM}
                      startAtResultId={startAtResultId}
                    />
                  </div>

                  {/* Statistics tab — always mounted */}
                  <div className={activeMainTab !== 'statistics' ? 'hidden' : ''}>
                    {gradeReport ? (
                      <div className="space-y-6">
                        <GradeDistributionChart
                          results={filteredResults}
                          assignment={assignment}
                          resourceRubric={rubricData?.rubric ?? null}
                          moderationRubric={rubricData?.moderation_rubric ?? null}
                        />
                        <CriterionDistributionChart
                          results={filteredResults}
                          assignment={assignment}
                          resourceRubric={rubricData?.rubric ?? null}
                          moderationRubric={rubricData?.moderation_rubric ?? null}
                        />
                        <TopicBreakdownTable data={filteredTopicBreakdown} />
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Statistics will appear after grading completes.</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-5">
                <p className="text-sm text-gray-400 italic">No grades yet — import a CSV and run AI grading above.</p>
              </div>
            )}
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

// ---------------------------------------------------------------------------
// Shared histogram renderer + bin builders
// ---------------------------------------------------------------------------

// Pure renderer — caller pre-computes bins
function DistributionHistogram({ bins, binLabels, binMidPcts, xLeft = '0%', xMid = '50%', xRight = '100%', countLabel = 'result' }) {
  const maxCount = Math.max(...bins, 1)
  return (
    <>
      <div className="flex items-end gap-1 h-32">
        {bins.map((count, i) => {
          const heightPct = (count / maxCount) * 100
          const midPct = binMidPcts[i]
          const colour = midPct < 50 ? 'bg-red-400' : midPct < 75 ? 'bg-yellow-400' : 'bg-green-400'
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-0.5 h-full group relative">
              <span className="text-xs text-gray-500 leading-none">{count > 0 ? count : ''}</span>
              <div
                className={`w-full rounded-t-sm ${colour} transition-all`}
                style={{ height: `${heightPct}%`, minHeight: count > 0 ? '3px' : '0' }}
              />
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 shadow">
                {binLabels[i]}: {count} {countLabel}{count !== 1 ? 's' : ''}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex mt-1.5">
        <span className="text-xs text-gray-400 flex-1 text-left">{xLeft}</span>
        <span className="text-xs text-gray-400 flex-1 text-center">{xMid}</span>
        <span className="text-xs text-gray-400 flex-1 text-right">{xRight}</span>
      </div>
    </>
  )
}

function buildPctBins(percentages) {
  const bins = Array(10).fill(0)
  for (const pct of percentages) bins[Math.min(9, Math.floor(pct / 10))]++
  return {
    bins,
    binLabels: ['0–10%', '10–20%', '20–30%', '30–40%', '40–50%', '50–60%', '60–70%', '70–80%', '80–90%', '90–100%'],
    binMidPcts: [5, 15, 25, 35, 45, 55, 65, 75, 85, 95],
    xLeft: '0%', xMid: '50%', xRight: '100%',
  }
}

// Builds bins keyed to the actual rubric levels for a criterion (sorted ascending by points).
// Matches each result's criterion_grade to a level by level_id → level_title → closest points.
function buildLevelBins(relevantResults, criterionId, rubricCriteria) {
  if (!rubricCriteria || !criterionId) return null
  const criterion = rubricCriteria.find((c) => c.id === criterionId)
  if (!criterion) return null
  const levels = [...(criterion.levels ?? [])].sort((a, b) => a.points - b.points)
  if (levels.length === 0) return null

  const bins = new Array(levels.length).fill(0)
  let matched = 0
  for (const r of relevantResults) {
    const cg = (r.criterion_grades ?? []).find((g) => g.criterion_id === criterionId)
    if (!cg) continue
    let idx = levels.findIndex((l) => String(l.id) === String(cg.level_id))
    if (idx < 0) idx = levels.findIndex((l) => l.title === cg.level_title)
    if (idx < 0) {
      // Fallback: closest points value
      const pts = cg.points_awarded ?? 0
      let bestDist = Infinity
      levels.forEach((l, i) => {
        const d = Math.abs(l.points - pts)
        if (d < bestDist) { bestDist = d; idx = i }
      })
    }
    if (idx >= 0) { bins[idx]++; matched++ }
  }
  if (matched === 0) return null

  const maxPts = levels[levels.length - 1].points
  const midIdx = Math.floor((levels.length - 1) / 2)
  return {
    bins,
    binLabels: levels.map((l) => l.title),
    binMidPcts: levels.map((l) => (maxPts > 0 ? (l.points / maxPts) * 100 : 0)),
    xLeft: `${levels[0].points} pts`,
    xMid: `${levels[midIdx].points} pts`,
    xRight: `${maxPts} pts`,
    count: matched,
  }
}

// Returns grade-based bin data or null if not applicable (no scale / too many bins)
function buildGradeBins(gradeValues, effAssignment) {
  if (!effAssignment?.grade_scale_enabled || !effAssignment?.grade_scale_max) return null
  let step, displayDp
  switch (effAssignment.grade_rounding ?? 'none') {
    case 'half': step = 0.5; displayDp = 1; break
    case 'round': case 'round_up': case 'round_down': {
      const dp = effAssignment.grade_decimal_places ?? 2
      step = 1 / Math.pow(10, dp)
      displayDp = dp
      break
    }
    default: return null
  }
  const scaleMax = Number(effAssignment.grade_scale_max)
  const numBins = Math.round(scaleMax / step) + 1
  if (numBins > 50) return null
  // Build bin values avoiding float drift
  const binValues = Array.from({ length: numBins }, (_, i) => Math.round(i * step * 1e9) / 1e9)
  const bins = new Array(numBins).fill(0)
  for (const g of gradeValues) {
    const idx = binValues.findIndex((bv) => Math.abs(bv - g) < step * 0.5)
    if (idx >= 0) bins[idx]++
  }
  const fmt = (v) => v.toFixed(displayDp)
  const midBin = Math.floor(numBins / 2)
  return {
    bins,
    binLabels: binValues.map(fmt),
    binMidPcts: binValues.map((v) => (v / scaleMax) * 100),
    xLeft: fmt(0), xMid: fmt(binValues[midBin]), xRight: fmt(scaleMax),
  }
}

// ---------------------------------------------------------------------------
// Grade distribution histogram
// ---------------------------------------------------------------------------

function GradeDistributionChart({ results, assignment, resourceRubric, moderationRubric }) {
  const isRnM = assignment?.assignment_type === 'resources_and_moderations'
  const [typeFilter, setTypeFilter] = useState('overall')
  const maxPossibleResource = computeMaxPoints(resourceRubric)
  const maxPossibleModeration = computeMaxPoints(moderationRubric ?? resourceRubric)

  const studentData = useMemo(() => {
    const map = new Map()
    for (const r of results ?? []) {
      if (r.result_type === 'resource' && r.primary_author_id) {
        if (!map.has(r.primary_author_id)) map.set(r.primary_author_id, { resources: [], moderations: [] })
        map.get(r.primary_author_id).resources.push(r)
      }
      if (r.result_type === 'moderation' && r.moderation_user_id) {
        if (!map.has(r.moderation_user_id)) map.set(r.moderation_user_id, { resources: [], moderations: [] })
        map.get(r.moderation_user_id).moderations.push(r)
      }
    }
    return [...map.values()]
  }, [results])

  // Compute per-student grade values plus an effective assignment for binning.
  const { gradeValues, effAssForBins } = useMemo(() => {
    const gradeValues = []
    let effAssForBins = null

    for (const student of studentData) {
      const resInfo = computeStudentCombined(student.resources, assignment?.combine_resource_max_n ?? null, maxPossibleResource, assignment, false, 'resource')
      const modInfo = isRnM ? computeStudentCombined(student.moderations, assignment?.combine_moderation_max_n ?? null, maxPossibleModeration, assignment, false, 'moderation') : null
      let grade = null

      if (typeFilter === 'resource' || (!isRnM && typeFilter === 'overall')) {
        if (resInfo?.grade != null) {
          grade = resInfo.grade
          if (!effAssForBins) effAssForBins = resInfo.effectiveAssignment
        }
      } else if (typeFilter === 'moderation') {
        if (modInfo?.grade != null) {
          grade = modInfo.grade
          if (!effAssForBins) effAssForBins = modInfo.effectiveAssignment
        }
      } else {
        // R&M overall — combine resource + moderation grades; combine their scale maxes too
        const r = resInfo?.grade ?? null
        const m = modInfo?.grade ?? null
        if (r !== null || m !== null) {
          grade = (r ?? 0) + (m ?? 0)
          if (!effAssForBins) {
            const resEff = resInfo?.effectiveAssignment
            const modEff = modInfo?.effectiveAssignment
            const resMax = resEff?.grade_scale_enabled && resEff?.grade_scale_max ? Number(resEff.grade_scale_max) : maxPossibleResource
            const modMax = modEff?.grade_scale_enabled && modEff?.grade_scale_max ? Number(modEff.grade_scale_max) : maxPossibleModeration
            // Build a synthetic effAss covering the combined scale
            const bothScaled = (resEff?.grade_scale_enabled && modEff?.grade_scale_enabled) ||
              (!isRnM && resEff?.grade_scale_enabled)
            effAssForBins = {
              ...(resEff ?? assignment),
              grade_scale_enabled: bothScaled,
              grade_scale_max: resMax + modMax,
            }
          }
        }
      }

      if (grade != null) gradeValues.push(grade)
    }
    return { gradeValues, effAssForBins }
  }, [studentData, typeFilter, isRnM, assignment, maxPossibleResource, maxPossibleModeration])

  const binData = useMemo(() => {
    if (gradeValues.length === 0) return null
    if (effAssForBins?.grade_scale_enabled && effAssForBins?.grade_scale_max) {
      const gradeBins = buildGradeBins(gradeValues, effAssForBins)
      if (gradeBins) return { ...gradeBins, count: gradeValues.length }
      // Too many discrete bins — fall back to % within the grade range
      const scaleMax = Number(effAssForBins.grade_scale_max)
      const pcts = gradeValues.map((g) => Math.min(100, Math.max(0, (g / scaleMax) * 100)))
      return { ...buildPctBins(pcts), count: pcts.length }
    }
    // No grade scale — express as % of max raw points
    const maxPossible = typeFilter === 'moderation' ? maxPossibleModeration :
      typeFilter === 'overall' && isRnM ? maxPossibleResource + maxPossibleModeration : maxPossibleResource
    const pcts = gradeValues.map((g) => Math.min(100, Math.max(0, maxPossible > 0 ? (g / maxPossible) * 100 : 0)))
    return { ...buildPctBins(pcts), count: pcts.length }
  }, [gradeValues, effAssForBins, typeFilter, isRnM, maxPossibleResource, maxPossibleModeration])

  if (gradeValues.length === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700">
          Grade Distribution
          <span className="ml-2 font-normal text-gray-400 text-xs">{gradeValues.length} student{gradeValues.length !== 1 ? 's' : ''}</span>
        </h4>
        {isRnM && (
          <div className="flex gap-1">
            {[['overall', 'Overall'], ['resource', 'Resources'], ['moderation', 'Moderations']].map(([val, label]) => (
              <button key={val} onClick={() => setTypeFilter(val)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${typeFilter === val ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 text-gray-500 hover:border-gray-400 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* key=bins.length triggers a remount (and fade-in) when bar count changes */}
      <div key={binData?.bins?.length ?? 0} style={{ animation: 'gradeHistFadeIn 0.18s ease' }}>
        <style>{`@keyframes gradeHistFadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
        <DistributionHistogram {...binData} countLabel="student" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Criterion distribution histogram
// ---------------------------------------------------------------------------

function CriterionDistributionChart({ results, assignment, resourceRubric, moderationRubric }) {
  const isRnM = assignment?.assignment_type === 'resources_and_moderations'
  const [typeFilter, setTypeFilter] = useState('overall')
  const [selectedCriterionId, setSelectedCriterionId] = useState(null)

  // For R&M with no separate mod rubric, fall back to resource rubric for moderations
  const effectiveModRubric = (isRnM && moderationRubric) ? moderationRubric : (isRnM ? resourceRubric : null)

  // Disable 'Overall' pill when resource and moderation rubrics have different criteria
  const rubricsDiffer = useMemo(() => {
    if (!isRnM || !effectiveModRubric) return false
    const resIds = (resourceRubric?.criteria ?? []).map((c) => c.id)
    const modIds = (effectiveModRubric?.criteria ?? []).map((c) => c.id)
    return resIds.length !== modIds.length || resIds.some((id, i) => id !== modIds[i])
  }, [isRnM, resourceRubric, effectiveModRubric])

  // Auto-reset to 'resource' if 'overall' becomes unavailable
  useEffect(() => {
    if (rubricsDiffer && typeFilter === 'overall') setTypeFilter('resource')
  }, [rubricsDiffer, typeFilter])

  const criteriaOptions = useMemo(() => {
    const fromRubric = (rubric) =>
      (rubric?.criteria ?? []).map((c) => ({ id: c.id, name: c.name ?? c.title ?? c.id }))
    if (!isRnM || typeFilter === 'resource') return fromRubric(resourceRubric)
    if (typeFilter === 'moderation') return fromRubric(effectiveModRubric)
    // overall: merge (rubrics are the same when overall is enabled)
    const seen = new Set()
    const merged = []
    for (const c of [...fromRubric(resourceRubric), ...fromRubric(effectiveModRubric)]) {
      if (!seen.has(c.id)) { seen.add(c.id); merged.push(c) }
    }
    return merged
  }, [resourceRubric, effectiveModRubric, isRnM, typeFilter])

  const effectiveCriterionId = (selectedCriterionId && criteriaOptions.some((c) => c.id === selectedCriterionId))
    ? selectedCriterionId : (criteriaOptions[0]?.id ?? null)

  const relevantResults = useMemo(() => {
    if (!isRnM || typeFilter === 'overall') return results ?? []
    const want = typeFilter === 'resource' ? 'resource' : 'moderation'
    return (results ?? []).filter((r) => r.result_type === want)
  }, [results, isRnM, typeFilter])

  const binData = useMemo(() => {
    if (!effectiveCriterionId) return null
    // Use the rubric that matches the current view to get level definitions
    const rubricForView = typeFilter === 'moderation' ? effectiveModRubric : resourceRubric
    return buildLevelBins(relevantResults, effectiveCriterionId, rubricForView?.criteria ?? [])
  }, [relevantResults, effectiveCriterionId, typeFilter, resourceRubric, effectiveModRubric])

  if (criteriaOptions.length === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700">
          Criterion Distribution
          {binData && (
            <span className="ml-2 font-normal text-gray-400 text-xs">{binData.count} result{binData.count !== 1 ? 's' : ''}</span>
          )}
        </h4>
        {isRnM && (
          <div className="flex gap-1">
            {[['overall', 'Overall'], ['resource', 'Resources'], ['moderation', 'Moderations']].map(([val, label]) => {
              const disabled = val === 'overall' && rubricsDiffer
              return (
                <button key={val}
                  onClick={() => !disabled && setTypeFilter(val)}
                  title={disabled ? 'Overall unavailable when resource and moderation rubrics differ' : undefined}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    typeFilter === val
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : disabled
                        ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                        : 'border-gray-300 text-gray-500 hover:border-gray-400 hover:bg-gray-50'
                  }`}>
                  {label}
                </button>
              )
            })}
          </div>
        )}
      </div>
      {/* Criterion pills */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {criteriaOptions.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCriterionId(c.id)}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              effectiveCriterionId === c.id
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'border-gray-300 text-gray-500 hover:border-gray-400 hover:bg-gray-50'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
      {!binData ? (
        <p className="text-sm text-gray-400 italic">No data for this criterion.</p>
      ) : (
        <DistributionHistogram {...binData} countLabel="result" />
      )}
    </div>
  )
}
