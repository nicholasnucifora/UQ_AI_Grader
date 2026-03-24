/**
 * Shared constants and components used by both AssignmentFormPage (create)
 * and AssignmentEditPage (edit). Editing this file affects both pages.
 */
import { useState, useEffect } from 'react'
import RubricIngestUploader from './RubricIngestUploader'
import RubricEditor from './RubricEditor'
import { api } from '../api/client'

// ── Constants ────────────────────────────────────────────────────────────────

export const MARKING_MODES = [
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

export const AI_MODELS = [
  { value: 'opus', label: 'Claude Opus', description: 'Smart, Expensive' },
  { value: 'sonnet', label: 'Claude Sonnet', description: 'Recommended' },
  { value: 'haiku', label: 'Claude Haiku', description: 'Fast, Cheap' },
]

export const FEEDBACK_FORMAT_PRESETS = [
  {
    value: 'action_oriented',
    label: 'Action Oriented',
    text: 'Provide 2–3 highly specific, actionable bullet points per criterion focused on how the student can improve. Be direct and concrete — reference specific parts of their submission and state exactly what to do differently.',
  },
  {
    value: 'supportive',
    label: 'Supportive & Conversational',
    text: 'Use a sandwich approach for each criterion: begin with a genuine positive observation about what the student did well, then offer constructive feedback with specific suggestions for improvement, then close with an encouraging statement. Keep the tone warm and accessible.',
  },
  {
    value: 'custom',
    label: 'Custom',
    text: '',
  },
]

// ── Components ────────────────────────────────────────────────────────────────

export function ButtonGroup({ label, options, value, onChange, disabled = false }) {
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
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={`flex-1 text-center px-2 py-2 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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

/**
 * Feedback format picker — preset selector + editable instruction textarea.
 * value: the full instruction text string
 * onChange: (newText) => void
 */
export function FeedbackFormatPicker({ value, onChange, disabled = false }) {
  // Derive active preset by matching text against known presets
  const activePreset = FEEDBACK_FORMAT_PRESETS.find(
    (p) => p.value !== 'custom' && p.text === value
  )?.value ?? 'custom'

  function selectPreset(preset) {
    if (preset.value !== 'custom') {
      onChange(preset.text)
    }
    // clicking Custom doesn't change the text — just lets them edit freely
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">Feedback Format</p>
      <div className="flex gap-2">
        {FEEDBACK_FORMAT_PRESETS.map((preset) => {
          const active = activePreset === preset.value
          return (
            <button
              key={preset.value}
              type="button"
              disabled={disabled}
              onClick={() => selectPreset(preset)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                active
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500'
                  : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'
              }`}
            >
              {preset.label}
            </button>
          )
        })}
      </div>
      <textarea
        rows={3}
        disabled={disabled}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-gray-50 resize-none"
        placeholder="Describe how the AI should format its feedback…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {activePreset === 'custom' && value.trim() && (
        <p className="text-xs text-gray-400">Custom instructions active.</p>
      )}
    </div>
  )
}

// Small inline toggle button placed next to a section heading.
// linked=true → indigo "Shared", linked=false → gray "Separate"
export function LinkToggle({ linked, onToggle, linkedTip, unlinkedTip }) {
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

export function GradeScaleFields({ max, onMax, rounding, onRounding, dp, onDp }) {
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

export function CombineTypeSection({ label, enabled, onToggle, maxN, onMaxN }) {
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

export function RubricBlock({ rubric, setRubric }) {
  return (
    <div className="space-y-3">
      {!rubric ? (
        <>
          <RubricIngestUploader onRubricExtracted={setRubric} />
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
      ) : (
        <RubricEditor rubric={rubric} onChange={setRubric} onDelete={() => setRubric(null)} />
      )}
    </div>
  )
}

/**
 * Per-topic attachment and instruction manager.
 * Only used on the edit page (assignment must already exist with an ID).
 * Shows when use_topic_attachments is enabled and topics have been imported.
 */
export function TopicAttachmentManager({ classId, assignmentId, globalInstruction, overrides, onOverrideChange, onAttachmentsChange }) {
  const [topics, setTopics] = useState([])
  const [attachmentsByTopic, setAttachmentsByTopic] = useState({})
  const [expanded, setExpanded] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!classId || !assignmentId) return
    api.getTopics(classId, assignmentId).then(setTopics).catch(() => {})
  }, [classId, assignmentId])

  function toggleExpand(topic) {
    const next = expanded === topic ? null : topic
    setExpanded(next)
    if (next && attachmentsByTopic[next] === undefined) {
      api.getTopicAttachments(classId, assignmentId, next)
        .then((atts) => setAttachmentsByTopic((prev) => ({ ...prev, [next]: atts })))
        .catch(() => setAttachmentsByTopic((prev) => ({ ...prev, [next]: [] })))
    }
  }

  async function handleUpload(topic, file) {
    setUploading(true)
    setError(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const added = await api.uploadTopicAttachment(classId, assignmentId, topic, formData)
      setAttachmentsByTopic((prev) => {
        const next = { ...prev, [topic]: [...(prev[topic] ?? []), added] }
        onAttachmentsChange?.(topic, next[topic])
        return next
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(topic, attachmentId) {
    setError(null)
    try {
      await api.deleteTopicAttachment(classId, assignmentId, topic, attachmentId)
      setAttachmentsByTopic((prev) => {
        const next = { ...prev, [topic]: (prev[topic] ?? []).filter((a) => a.id !== attachmentId) }
        onAttachmentsChange?.(topic, next[topic])
        return next
      })
    } catch (err) {
      setError(err.message)
    }
  }

  function isOverridden(topic) {
    return Object.prototype.hasOwnProperty.call(overrides, topic)
  }

  if (topics.length === 0) {
    return <p className="text-xs text-gray-400 mt-3 italic">No topics loaded yet — import a resource CSV to see topics here.</p>
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Topics</p>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {topics.map(({ topic, resource_count }) => {
        const isOpen = expanded === topic
        const atts = attachmentsByTopic[topic]
        const overridden = isOverridden(topic)
        return (
          <div key={topic} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => toggleExpand(topic)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-sm font-medium text-gray-800">{topic}</span>
                <span className="text-xs text-gray-400">{resource_count} resource{resource_count !== 1 ? 's' : ''}</span>
                {atts && atts.length > 0 && (
                  <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full">
                    {atts.length} file{atts.length !== 1 ? 's' : ''}
                  </span>
                )}
                {overridden && (
                  <span className="text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full">custom instructions</span>
                )}
              </div>
              <span className="text-gray-400 text-xs shrink-0 ml-2">{isOpen ? '▲' : '▼'}</span>
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 px-4 py-3 space-y-4 bg-gray-50/40">
                {/* Per-topic instruction override */}
                <div>
                  <span className="block text-xs font-medium text-gray-600 mb-0.5">Topic-specific attachment instructions</span>
                  <p className="text-xs text-gray-400 mb-1.5">Explain what the separate files for this topic represent and any specific instructions for the AI — e.g. lecture slides, case studies, or reference materials relevant to this topic only.</p>
                  <textarea
                    rows={3}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder={globalInstruction ? `Default: "${globalInstruction}"` : 'e.g. The attached file is the lecture for this topic — use it to assess topic-specific knowledge.'}
                    value={overrides[topic] ?? ''}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val) {
                        onOverrideChange({ ...overrides, [topic]: val })
                      } else {
                        const next = { ...overrides }
                        delete next[topic]
                        onOverrideChange(next)
                      }
                    }}
                  />
                </div>

                {/* Attachments */}
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">Files</p>
                  {atts === undefined ? (
                    <p className="text-xs text-gray-400">Loading…</p>
                  ) : atts.length === 0 ? (
                    <p className="text-xs text-gray-400 mb-2">No files uploaded yet.</p>
                  ) : (
                    <ul className="space-y-1.5 mb-2">
                      {atts.map((a) => (
                        <li key={a.id} className="flex items-center justify-between text-xs bg-white border border-gray-200 rounded px-3 py-1.5">
                          <span className="text-gray-700 truncate mr-3">{a.filename}</span>
                          <button
                            type="button"
                            onClick={() => handleDelete(topic, a.id)}
                            className="text-red-400 hover:text-red-600 shrink-0"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <label className={`inline-flex items-center gap-2 px-2.5 py-1 text-xs rounded-lg cursor-pointer ${
                    uploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}>
                    {uploading ? 'Uploading…' : 'Upload File'}
                    <input
                      type="file"
                      accept=".pdf,.txt,.docx,.png,.jpg,.jpeg"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        e.target.value = ''
                        handleUpload(topic, file)
                      }}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
