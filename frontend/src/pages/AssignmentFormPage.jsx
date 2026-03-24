import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { api } from '../api/client'
import {
  ButtonGroup,
  FeedbackFormatPicker,
  LinkToggle,
  RubricBlock,
  GradeScaleFields,
  CombineTypeSection,
  MARKING_MODES,
  AI_MODELS,
} from '../components/AssignmentShared'

export default function AssignmentFormPage() {
  const { id: classId } = useParams()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignmentType, setAssignmentType] = useState('')
  const [rubric, setRubric] = useState(null)
  const [moderationRubric, setModerationRubric] = useState(null)
  const [sameRubric, setSameRubric] = useState(true)
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [moderationNotes, setModerationNotes] = useState('')
  const [sameNotes, setSameNotes] = useState(true)
  const [markingMode, setMarkingMode] = useState('teacher_supervised_ai')
  const [aiModel, setAiModel] = useState('haiku')
  const [feedbackFormat, setFeedbackFormat] = useState('')
  const [useTopicAttachments, setUseTopicAttachments] = useState(false)
  const [topicAttachmentInstructions, setTopicAttachmentInstructions] = useState('')
  // Grade output
  const [customizeGradeOutput, setCustomizeGradeOutput] = useState(false)
  const [sameGradeOutput, setSameGradeOutput] = useState(true)
  const [gradeScaleMax, setGradeScaleMax] = useState('')
  const [gradeRounding, setGradeRounding] = useState('none')
  const [gradeDecimalPlaces, setGradeDecimalPlaces] = useState(2)
  const [combineResourceGrades, setCombineResourceGrades] = useState(false)
  const [combineResourceMaxN, setCombineResourceMaxN] = useState('')
  const [moderationGradeScaleMax, setModerationGradeScaleMax] = useState('')
  const [moderationGradeRounding, setModerationGradeRounding] = useState('none')
  const [moderationGradeDecimalPlaces, setModerationGradeDecimalPlaces] = useState(2)
  const [combineModerationGrades, setCombineModerationGrades] = useState(false)
  const [combineModerationMaxN, setCombineModerationMaxN] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const isRnM = assignmentType === 'resources_and_moderations'
  const rubricLinked = !isRnM || sameRubric
  const notesLinked = !isRnM || sameNotes

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim()) return setError('Title is required.')
    if (!assignmentType) return setError('Please select an Assignment Type before creating.')
    setSaving(true)
    setError('')
    try {
      const scaledMax = gradeScaleMax !== '' ? parseFloat(gradeScaleMax) : null
      const assignment = await api.createAssignment(classId, {
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
        grade_scale_enabled: scaledMax !== null,
        grade_scale_max: scaledMax,
        grade_rounding: gradeRounding,
        grade_decimal_places: gradeDecimalPlaces,
        combine_resource_grades: combineResourceGrades,
        combine_resource_max_n: combineResourceGrades && combineResourceMaxN !== '' ? parseInt(combineResourceMaxN, 10) : null,
        separate_moderation_grade_scale: isRnM && !sameGradeOutput,
        moderation_grade_scale_max: isRnM && !sameGradeOutput && moderationGradeScaleMax !== '' ? parseFloat(moderationGradeScaleMax) : null,
        moderation_grade_rounding: moderationGradeRounding,
        moderation_grade_decimal_places: moderationGradeDecimalPlaces,
        combine_moderation_grades: isRnM && combineModerationGrades,
        combine_moderation_max_n: isRnM && combineModerationGrades && combineModerationMaxN !== '' ? parseInt(combineModerationMaxN, 10) : null,
      })
      if (rubric) {
        await api.saveRubric(classId, assignment.id, {
          rubric,
          moderation_rubric: !rubricLinked ? moderationRubric : null,
        })
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
                onChange={(e) => {
                  setAssignmentType(e.target.value)
                  setSameRubric(true)
                  setSameNotes(true)
                }}
              >
                <option value="" disabled>-- Select assignment type --</option>
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
                      className={inputCls}
                      rows={4}
                      placeholder="Extra context for grading resources."
                      value={additionalNotes}
                      onChange={(e) => setAdditionalNotes(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">&nbsp;</label>
                    <p className="text-xs text-gray-400 mb-1">Moderations</p>
                    <textarea
                      className={inputCls}
                      rows={4}
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
                    className={inputCls}
                    rows={4}
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
            <FeedbackFormatPicker value={feedbackFormat} onChange={setFeedbackFormat} />
          </section>

          {/* ── Grade Output ── */}
          <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-gray-800">Grade Output</h2>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                checked={customizeGradeOutput}
                onChange={(e) => setCustomizeGradeOutput(e.target.checked)}
              />
              <span className="text-sm text-gray-700">Customize grade output from rubric</span>
            </label>

            {customizeGradeOutput && (
              <div className="space-y-4">
                {isRnM && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      checked={sameGradeOutput}
                      onChange={(e) => setSameGradeOutput(e.target.checked)}
                    />
                    <span className="text-sm text-gray-700">Same grade output for resources and moderations</span>
                  </label>
                )}

                {(!isRnM || sameGradeOutput) ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Overall</p>
                    <GradeScaleFields
                      max={gradeScaleMax} onMax={setGradeScaleMax}
                      rounding={gradeRounding} onRounding={setGradeRounding}
                      dp={gradeDecimalPlaces} onDp={setGradeDecimalPlaces}
                    />
                    <CombineTypeSection
                      label={isRnM ? 'Combine grades' : 'Combine resource grades'}
                      enabled={combineResourceGrades}
                      onToggle={(v) => { setCombineResourceGrades(v); if (isRnM) setCombineModerationGrades(v) }}
                      maxN={combineResourceMaxN}
                      onMaxN={(v) => { setCombineResourceMaxN(v); if (isRnM) setCombineModerationMaxN(v) }}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Resources</p>
                      <GradeScaleFields
                        max={gradeScaleMax} onMax={setGradeScaleMax}
                        rounding={gradeRounding} onRounding={setGradeRounding}
                        dp={gradeDecimalPlaces} onDp={setGradeDecimalPlaces}
                      />
                      <CombineTypeSection
                        label="Combine resource grades"
                        enabled={combineResourceGrades} onToggle={setCombineResourceGrades}
                        maxN={combineResourceMaxN} onMaxN={setCombineResourceMaxN}
                      />
                    </div>
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Moderations</p>
                      <GradeScaleFields
                        max={moderationGradeScaleMax} onMax={setModerationGradeScaleMax}
                        rounding={moderationGradeRounding} onRounding={setModerationGradeRounding}
                        dp={moderationGradeDecimalPlaces} onDp={setModerationGradeDecimalPlaces}
                      />
                      <CombineTypeSection
                        label="Combine moderation grades"
                        enabled={combineModerationGrades} onToggle={setCombineModerationGrades}
                        maxN={combineModerationMaxN} onMaxN={setCombineModerationMaxN}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
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
