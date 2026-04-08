/**
 * Shared constants and components used by both AssignmentFormPage (create)
 * and AssignmentEditPage (edit). Editing this file affects both pages.
 */
import { useState, useEffect, useRef } from 'react'

function fmtDate(raw) {
  if (!raw) return null
  let d
  const iso = new Date(raw)
  if (!isNaN(iso)) {
    d = iso
  } else {
    const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
    if (!m) return raw
    const [, dd, mm, yyyy, hh = '0', min = '0'] = m
    d = new Date(+yyyy, +mm - 1, +dd, +hh, +min)
    if (isNaN(d)) return raw
  }
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const day = d.getDate()
  const suffix = (day % 100 >= 11 && day % 100 <= 13) ? 'th' : ['th','st','nd','rd'][Math.min(day % 10, 3)]
  const h = d.getHours()
  const min = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${MONTHS[d.getMonth()]} ${day}${suffix}, ${h12}:${min} ${ampm}`
}
import RubricIngestUploader from './RubricIngestUploader'
import RubricEditor from './RubricEditor'
import { api } from '../api/client'
import { useUpload, useTopicUploads } from '../contexts/UploadContext'

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
  const [savedCustomText, setSavedCustomText] = useState('')

  // Derive active preset by matching text against known presets
  const activePreset = FEEDBACK_FORMAT_PRESETS.find(
    (p) => p.value !== 'custom' && p.text === value
  )?.value ?? 'custom'

  function selectPreset(preset) {
    if (preset.value === 'custom') {
      // Already in custom mode (e.g. user typed into a preset) — do nothing
      if (activePreset === 'custom') return
      // Otherwise restore whatever the user had typed in Custom previously
      onChange(savedCustomText)
    } else {
      // Leaving custom — save what's there so it survives the switch
      if (activePreset === 'custom') {
        setSavedCustomText(value)
      }
      onChange(preset.text)
    }
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

export function RubricBlock({ rubric, setRubric, hasGrades = false }) {
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
        <RubricEditor rubric={rubric} onChange={setRubric} hasGrades={hasGrades} onDelete={() => setRubric(null)} />
      )}
    </div>
  )
}

/**
 * Per-topic attachment and instruction manager.
 * Only used on the edit page (assignment must already exist with an ID).
 * Shows when use_topic_attachments is enabled and topics have been imported.
 */
export function TopicAttachmentManager({ classId, assignmentId, globalInstruction, overrides, onOverrideChange, onAttachmentsChange, cutoffDates, onCutoffChange, showAttachments = true }) {
  const [topics, setTopics] = useState([])
  const [attachmentsByTopic, setAttachmentsByTopic] = useState({})
  const [expanded, setExpanded] = useState(null)
  const [error, setError] = useState(null)
  const { enqueueUpload, recentCompletions } = useUpload()
  const seenCompletionIds = useRef(new Set())

  useEffect(() => {
    if (!classId || !assignmentId) return
    api.getTopics(classId, assignmentId).then(setTopics).catch(() => {})
  }, [classId, assignmentId])

  // Apply completions from any page — ensures files that finished uploading
  // while this component wasn't mounted still appear in the loaded list.
  useEffect(() => {
    const relevant = recentCompletions.filter(
      (c) =>
        !seenCompletionIds.current.has(c.completionId) &&
        String(c.classId) === String(classId) &&
        String(c.assignmentId) === String(assignmentId)
    )
    if (relevant.length === 0) return
    relevant.forEach((c) => seenCompletionIds.current.add(c.completionId))
    setAttachmentsByTopic((prev) => {
      let next = prev
      for (const { topic: t, added } of relevant) {
        if (next[t] === undefined) continue // not yet fetched; will be fresh on expand
        if (next[t].some((a) => a.id === added.id)) continue // already present
        next = { ...next, [t]: [...next[t], added] }
      }
      return next
    })
  }, [recentCompletions, classId, assignmentId])

  function toggleExpand(topic) {
    const next = expanded === topic ? null : topic
    setExpanded(next)
    if (next && attachmentsByTopic[next] === undefined) {
      api.getTopicAttachments(classId, assignmentId, next)
        .then((atts) => setAttachmentsByTopic((prev) => ({ ...prev, [next]: atts })))
        .catch(() => setAttachmentsByTopic((prev) => ({ ...prev, [next]: [] })))
    }
  }

  function handleUpload(topic, file) {
    setError(null)
    enqueueUpload(classId, assignmentId, topic, file, (added) => {
      setAttachmentsByTopic((prev) => {
        const next = { ...prev, [topic]: [...(prev[topic] ?? []), added] }
        onAttachmentsChange?.(topic, next[topic])
        return next
      })
    })
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
      {topics.map(({ topic, resource_count }) => (
        <TopicRow
          key={topic}
          topic={topic}
          resourceCount={resource_count}
          isOpen={expanded === topic}
          atts={attachmentsByTopic[topic]}
          overridden={isOverridden(topic)}
          overrideValue={overrides[topic] ?? ''}
          globalInstruction={globalInstruction}
          classId={classId}
          assignmentId={assignmentId}
          cutoffDate={(cutoffDates || {})[topic] || ''}
          showAttachments={showAttachments}
          onToggle={() => toggleExpand(topic)}
          onOverrideChange={(val) => {
            if (val) {
              onOverrideChange({ ...overrides, [topic]: val })
            } else {
              const next = { ...overrides }
              delete next[topic]
              onOverrideChange(next)
            }
          }}
          onCutoffChange={(val) => {
            const next = { ...(cutoffDates || {}) }
            if (val) {
              next[topic] = val
            } else {
              delete next[topic]
            }
            onCutoffChange?.(next)
          }}
          onUpload={(file) => handleUpload(topic, file)}
          onDelete={(id) => handleDelete(topic, id)}
        />
      ))}
    </div>
  )
}

/** Converts DD-MM-YYYY or DD-MM-YYYY HH:MM to { date: 'YYYY-MM-DD', hour: '1'-'12', minute: '00'-'59', period: 'AM'|'PM', hasTime: bool } */
function parseCutoffValue(val) {
  if (!val) return { date: '', hour: '11', minute: '59', period: 'PM', hasTime: false }
  const m = val.match(/^(\d{1,2})-(\d{2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/)
  if (!m) return { date: '', hour: '11', minute: '59', period: 'PM', hasTime: false }
  const day = m[1].padStart(2, '0'), month = m[2], year = m[3]
  const date = `${year}-${month}-${day}`
  if (m[4] != null) {
    let h = parseInt(m[4], 10)
    const min = m[5]
    const period = h >= 12 ? 'PM' : 'AM'
    if (h === 0) h = 12
    else if (h > 12) h -= 12
    return { date, hour: String(h), minute: min, period, hasTime: true }
  }
  return { date, hour: '11', minute: '59', period: 'PM', hasTime: false }
}

/** Converts { date, hour, minute, period, hasTime } back to DD-MM-YYYY HH:MM */
function formatCutoffValue({ date, hour, minute, period, hasTime }) {
  if (!date) return ''
  const [y, m, d] = date.split('-')
  const base = `${parseInt(d, 10)}-${m}-${y}`
  if (!hasTime) return base
  let h = parseInt(hour, 10)
  if (period === 'AM' && h === 12) h = 0
  else if (period === 'PM' && h !== 12) h += 12
  return `${base} ${String(h).padStart(2, '0')}:${minute}`
}

function CutoffDatePicker({ value, onChange }) {
  const parsed = parseCutoffValue(value)
  const { date, hour, minute, period, hasTime } = parsed

  const update = (overrides) => {
    const next = { ...parsed, ...overrides }
    onChange(formatCutoffValue(next))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="date"
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={date}
          onChange={(e) => update({ date: e.target.value })}
        />
        {date && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs text-red-400 hover:text-red-600"
          >
            Clear
          </button>
        )}
      </div>
      {date && (
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={hasTime}
              onChange={(e) => update({ hasTime: e.target.checked })}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Set specific time
          </label>
          {hasTime && (
            <div className="flex items-center gap-1">
              <select
                value={hour}
                onChange={(e) => update({ hour: e.target.value })}
                className="border border-gray-300 rounded px-1.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                  <option key={h} value={String(h)}>{h}</option>
                ))}
              </select>
              <span className="text-gray-400">:</span>
              <select
                value={minute}
                onChange={(e) => update({ minute: e.target.value })}
                className="border border-gray-300 rounded px-1.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <select
                value={period}
                onChange={(e) => update({ period: e.target.value })}
                className="border border-gray-300 rounded px-1.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TopicRow({
  topic, resourceCount, isOpen, atts, overridden,
  overrideValue, globalInstruction, classId, assignmentId,
  cutoffDate, showAttachments,
  onToggle, onOverrideChange, onCutoffChange, onUpload, onDelete,
}) {
  const { abortUpload } = useUpload()
  const pendingUploads = useTopicUploads(classId, assignmentId, topic)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-sm font-medium text-gray-800">{topic}</span>
          <span className="text-xs text-gray-400">{resourceCount} resource{resourceCount !== 1 ? 's' : ''}</span>
          {atts && atts.length > 0 && (
            <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full">
              {atts.length} file{atts.length !== 1 ? 's' : ''}
            </span>
          )}
          {cutoffDate && (
            <span className="text-xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded-full">
              cutoff {fmtDate(cutoffDate)}
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
          {/* Cutoff date */}
          <div>
            <span className="block text-xs font-medium text-gray-600 mb-0.5">Last submitted date</span>
            <p className="text-xs text-gray-400 mb-1.5">Submissions after this date will be excluded from AI grading. Leave empty for no cutoff.</p>
            <CutoffDatePicker value={cutoffDate} onChange={onCutoffChange} />
          </div>

          {/* Per-topic instruction override */}
          {showAttachments && <>
          <div>
            <span className="block text-xs font-medium text-gray-600 mb-0.5">Topic-specific attachment instructions</span>
            <p className="text-xs text-gray-400 mb-1.5">Explain what the separate files for this topic represent and any specific instructions for the AI — e.g. lecture slides, case studies, or reference materials relevant to this topic only.</p>
            <textarea
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder={globalInstruction ? `Default: "${globalInstruction}"` : 'e.g. The attached file is the lecture for this topic — use it to assess topic-specific knowledge.'}
              value={overrideValue}
              onChange={(e) => onOverrideChange(e.target.value)}
            />
          </div>

          {/* Attachments */}
          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Files</p>
            {atts === undefined ? (
              <p className="text-xs text-gray-400">Loading…</p>
            ) : atts.length === 0 && pendingUploads.length === 0 ? (
              <p className="text-xs text-gray-400 mb-2">No files uploaded yet.</p>
            ) : (
              <ul className="space-y-1.5 mb-2">
                {(atts ?? []).map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-xs bg-white border border-gray-200 rounded px-3 py-1.5">
                    <span className="text-gray-700 truncate mr-3">{a.filename}</span>
                    <button
                      type="button"
                      onClick={() => onDelete(a.id)}
                      className="text-red-400 hover:text-red-600 shrink-0"
                    >
                      Remove
                    </button>
                  </li>
                ))}
                {pendingUploads.map((u) => (
                  <li key={u.id} className="flex items-center justify-between text-xs bg-white border border-gray-200 rounded px-3 py-1.5">
                    <div className="flex items-center gap-2 text-gray-400 min-w-0 mr-3">
                      <svg className="animate-spin h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      <span className="truncate">{u.filename}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => abortUpload(u.id)}
                      className="text-red-400 hover:text-red-600 shrink-0"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="inline-flex items-center gap-2 px-2.5 py-1 text-xs rounded-lg cursor-pointer bg-indigo-600 text-white hover:bg-indigo-700">
              Upload File
              <input
                type="file"
                accept=".pdf,.txt,.docx,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  e.target.value = ''
                  onUpload(file)
                }}
              />
            </label>
          </div>
          </>}
        </div>
      )}
    </div>
  )
}
