import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { api } from '../api/client'
import {
  ButtonGroup,
  FeedbackFormatPicker,
  LinkToggle,
  RubricBlock,
  TopicAttachmentManager,
  MARKING_MODES,
  AI_MODELS,
} from '../components/AssignmentShared'

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
  const [rubric, setRubric] = useState(null)
  const [moderationRubric, setModerationRubric] = useState(null)
  const [rubricExists, setRubricExists] = useState(false)
  const [sameRubric, setSameRubric] = useState(true)
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [moderationNotes, setModerationNotes] = useState('')
  const [sameNotes, setSameNotes] = useState(true)
  const [markingMode, setMarkingMode] = useState('teacher_supervised_ai')
  const [aiModel, setAiModel] = useState('haiku')
  const [feedbackFormat, setFeedbackFormat] = useState('')
  const [useTopicAttachments, setUseTopicAttachments] = useState(false)
  const [topicAttachmentInstructions, setTopicAttachmentInstructions] = useState('')
  const [topicInstructionOverrides, setTopicInstructionOverrides] = useState({})

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
        setAdditionalNotes(assignment.additional_notes ?? '')
        setModerationNotes(assignment.moderation_additional_notes ?? '')
        setMarkingMode(assignment.marking_mode ?? 'teacher_supervised_ai')
        setAiModel(assignment.ai_model ?? 'haiku')
        setFeedbackFormat(assignment.feedback_format ?? '')
        setUseTopicAttachments(assignment.use_topic_attachments ?? false)
        setTopicAttachmentInstructions(assignment.topic_attachment_instructions ?? '')
        setTopicInstructionOverrides(assignment.topic_instruction_overrides ?? {})

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
  const rubricLinked = !isRnM || sameRubric
  const notesLinked = !isRnM || sameNotes

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
        additional_notes: additionalNotes.trim(),
        moderation_additional_notes: !notesLinked ? moderationNotes.trim() : null,
        same_rubric_for_moderation: rubricLinked,
        same_ai_options_for_moderation: notesLinked,
        marking_mode: markingMode,
        ai_model: aiModel,
        feedback_format: feedbackFormat.trim(),
        use_topic_attachments: useTopicAttachments,
        topic_attachment_instructions: topicAttachmentInstructions.trim(),
        topic_instruction_overrides: topicInstructionOverrides,
      })

      if (rubric) {
        const body = {
          rubric,
          moderation_rubric: !rubricLinked ? moderationRubric : null,
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
                onChange={(e) => {
                  setAssignmentType(e.target.value)
                  setSameRubric(true)
                  setSameNotes(true)
                }}
              >
                <option value="resources">Resources</option>
                <option value="resources_and_moderations">Resources &amp; Moderations</option>
              </select>
            </div>

            {/* ── Rubric ── */}
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <div className="flex items-center gap-2">
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
                      <label className="text-sm font-medium text-gray-700">Additional notes for AI</label>
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

            {/* ── Topic Attachments ── */}
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
                      onChange={(e) => setTopicAttachmentInstructions(e.target.value)}
                    />
                  </div>

                  <TopicAttachmentManager
                    classId={classId}
                    assignmentId={aid}
                    globalInstruction={topicAttachmentInstructions}
                    overrides={topicInstructionOverrides}
                    onOverrideChange={setTopicInstructionOverrides}
                  />
                </>
              )}
            </div>
          </section>

          {/* ── AI Settings ── */}
          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-gray-800">AI Settings</h2>
            <ButtonGroup label="Marking mode" options={MARKING_MODES} value={markingMode} onChange={setMarkingMode} />
            <ButtonGroup label="AI Model" options={AI_MODELS} value={aiModel} onChange={setAiModel} />
            <FeedbackFormatPicker value={feedbackFormat} onChange={setFeedbackFormat} />
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

          {/* ── Delete ── */}
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
