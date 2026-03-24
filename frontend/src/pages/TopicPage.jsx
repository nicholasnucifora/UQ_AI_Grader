import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api/client'
import { StudentGradeTable, TeacherGradingPanel } from '../components/Marking'

export default function TopicPage() {
  const { id: classId, aid: assignmentId, topic: topicEncoded } = useParams()
  const topic = decodeURIComponent(topicEncoded)
  const { user } = useAuth()

  const [assignment, setAssignment] = useState(null)
  const [rubricData, setRubricData] = useState(null)
  const [allResults, setAllResults] = useState(null)
  const [attachments, setAttachments] = useState([])
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)
  const [activeTab, setActiveTab] = useState('ai')
  const [saveError, setSaveError] = useState(null)
  const [startAtResultId, setStartAtResultId] = useState(null)

  function handleGradeNow(result) {
    setActiveTab('teacher')
    setStartAtResultId(result.id)
  }
  const [teacherResQueue, setTeacherResQueue] = useState([])
  const [teacherModQueue, setTeacherModQueue] = useState([])
  const [myMemberRole, setMyMemberRole] = useState(null)
  const [className, setClassName] = useState(null)

  useEffect(() => {
    api.getAssignment(classId, assignmentId).then(setAssignment).catch(() => {})
    api.getRubric(classId, assignmentId).then(setRubricData).catch(() => {})
    api.getGradeResults(classId, assignmentId)
      .then(setAllResults)
      .catch(() => setAllResults([]))
    api.getTopicAttachments(classId, assignmentId, topic)
      .then(setAttachments)
      .catch(() => {})
    api.getClass(classId).then((cls) => {
      setClassName(cls.name)
      const m = cls.members.find((mem) => mem.user_id === user?.user_id)
      setMyMemberRole(m?.role ?? 'student')
    }).catch(() => {})
  }, [classId, assignmentId, topic, user])

  const isTeacher = myMemberRole === 'teacher'

  // Filter results to this topic and build queues when results load
  const topicResults = (allResults ?? []).filter(
    (r) => r.status === 'complete' && (r.resource_topics ?? '').trim() === topic
  )
  const resourceResults = topicResults.filter((r) => r.result_type === 'resource')
  const moderationResults = topicResults.filter((r) => r.result_type === 'moderation')

  const isRnM = assignment?.assignment_type === 'resources_and_moderations'
  const resourceRubric = rubricData?.rubric ?? null
  const moderationRubric = rubricData?.moderation_rubric ?? null

  // Build teacher queues whenever results change
  useEffect(() => {
    const sorted = (arr) =>
      [...arr].sort((a, b) => {
        if (!a.teacher_graded_at && b.teacher_graded_at) return -1
        if (a.teacher_graded_at && !b.teacher_graded_at) return 1
        return 0
      })
    setTeacherResQueue(sorted(resourceResults))
    setTeacherModQueue(sorted(moderationResults))
  }, [allResults, topic])  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveTeacherGrade(resultId, criterionGrades) {
    setSaveError(null)
    try {
      const updated = await api.saveTeacherGrade(classId, assignmentId, resultId, {
        criterion_grades: criterionGrades,
      })
      const patch = (prev) => prev.map((r) => (r.id === resultId ? { ...r, ...updated } : r))
      setAllResults(patch)
      setTeacherResQueue(patch)
      setTeacherModQueue(patch)
    } catch (err) {
      setSaveError(err.message)
    }
  }

  async function handleEmailResult(resultId, toEmail) {
    return api.openGradeEmail(classId, assignmentId, resultId, toEmail)
  }

  async function handleEmailStudentAll(studentId, toEmail) {
    return api.openStudentGradeEmail(classId, assignmentId, studentId, { toEmail, topic })
  }

  async function handleEmailStudentTopic(studentId, topicName, toEmail) {
    return api.openStudentGradeEmail(classId, assignmentId, studentId, { toEmail, topic: topicName })
  }

  async function handleUploadAttachment(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    setUploadError(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const added = await api.uploadTopicAttachment(classId, assignmentId, topic, formData)
      setAttachments((prev) => [...prev, added])
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteAttachment(attachmentId) {
    try {
      await api.deleteTopicAttachment(classId, assignmentId, topic, attachmentId)
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
    } catch (err) {
      setUploadError(err.message)
    }
  }

  const resGradedCount = teacherResQueue.filter((r) => r.teacher_graded_at).length
  const modGradedCount = teacherModQueue.filter((r) => r.teacher_graded_at).length

  return (
    <Layout>
      <div className="max-w-screen-2xl mx-auto">
        {/* Breadcrumb */}
        <p className="text-sm text-gray-500 mb-1">
          <Link to="/" className="hover:underline">My Classes</Link>
          {' / '}
          <Link to={`/classes/${classId}`} className="hover:underline">{className ?? '…'}</Link>
          {' / '}
          <Link to={`/classes/${classId}/assignments/${assignmentId}`} className="hover:underline">
            {assignment?.title}
          </Link>
          {' /'}
        </p>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">{topic}</h1>

        {/* Attachments — teacher only, and only when use_topic_attachments is enabled */}
        {isTeacher && assignment?.use_topic_attachments && (
          <section className="bg-white border border-gray-200 rounded-xl mb-6 overflow-hidden">
            <button
              onClick={() => setAttachmentsOpen((o) => !o)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-gray-800">Topic Attachments</h2>
                {attachments.length > 0 && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {attachments.length}
                  </span>
                )}
              </div>
              <span className="text-gray-400 text-sm">{attachmentsOpen ? '▲' : '▼'}</span>
            </button>

            {attachmentsOpen && (
              <div className="px-5 pb-5 border-t border-gray-100 pt-4">
                <p className="text-sm text-gray-500 mb-4">
                  Upload lecture slides, transcripts, or other reference material relevant to this topic.
                  These will be included as context when the AI grades submissions for this topic.
                  {assignment.topic_attachment_instructions && (
                    <span className="block mt-1 text-gray-600 italic">"{assignment.topic_attachment_instructions}"</span>
                  )}
                </p>

                {uploadError && (
                  <p className="text-sm text-red-600 mb-3">{uploadError}</p>
                )}

                {attachments.length > 0 && (
                  <ul className="space-y-2 mb-4">
                    {attachments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                        <span className="text-gray-700 truncate mr-4">{a.filename}</span>
                        <button
                          onClick={() => handleDeleteAttachment(a.id)}
                          className="text-red-400 hover:text-red-600 shrink-0 text-xs"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <label className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg cursor-pointer ${
                  uploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}>
                  {uploading ? 'Uploading…' : 'Upload File'}
                  <input
                    type="file"
                    accept=".pdf,.txt,.docx,.png,.jpg,.jpeg"
                    className="hidden"
                    disabled={uploading}
                    onChange={handleUploadAttachment}
                  />
                </label>
              </div>
            )}
          </section>
        )}

        {/* Grading */}
        {allResults === null ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : topicResults.length === 0 ? (
          <p className="text-sm text-gray-400 mb-6">No completed grades for this topic yet.</p>
        ) : (
          <section className="bg-white border border-gray-200 rounded-xl mb-6 overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-gray-100">
              <TabButton active={activeTab === 'ai'} onClick={() => setActiveTab('ai')}>
                AI Grading
                <span className="ml-1.5 text-xs opacity-60">{topicResults.length}</span>
              </TabButton>
              {isTeacher && (
                <TabButton active={activeTab === 'teacher'} onClick={() => setActiveTab('teacher')}>
                  Teacher Marking
                  <span className="ml-1.5 text-xs opacity-60">
                    {resGradedCount}/{teacherResQueue.length}
                    {isRnM && teacherModQueue.length > 0 && ` · ${modGradedCount}/${teacherModQueue.length}`}
                  </span>
                </TabButton>
              )}
            </div>

            <div className="p-5">
              {saveError && (
                <div className="flex items-start justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">
                  <span>{saveError}</span>
                  <button onClick={() => setSaveError(null)} className="ml-3 text-red-400 hover:text-red-600 shrink-0">✕</button>
                </div>
              )}

              {activeTab === 'ai' && (
                <StudentGradeTable
                  results={topicResults}
                  emailDomain={user?.student_email_domain || ''}
                  onEmail={handleEmailResult}
                  onEmailAll={handleEmailStudentAll}
                  onEmailTopic={handleEmailStudentTopic}
                  onGradeNow={isTeacher ? handleGradeNow : undefined}
                  isSingleTopic
                  assignment={assignment}
                  resourceRubric={resourceRubric}
                  moderationRubric={moderationRubric}
                />
              )}

              {activeTab === 'teacher' && isTeacher && (
                <TeacherGradingPanel
                  resourceQueue={teacherResQueue}
                  moderationQueue={teacherModQueue}
                  resourceRubric={resourceRubric}
                  moderationRubric={moderationRubric}
                  onSave={handleSaveTeacherGrade}
                  isRnM={isRnM}
                  startAtResultId={startAtResultId}
                />
              )}
            </div>
          </section>
        )}
      </div>
    </Layout>
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
