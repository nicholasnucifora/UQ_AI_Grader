import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

// Format a date string (ISO or RiPPLE CSV DD-MM-YYYY HH:MM) → "March 3rd, 6:32 pm"
function formatSubmissionDate(raw) {
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

// Format seconds late into the most appropriate unit (days / hours / minutes)
function formatLateness(seconds) {
  const days = Math.floor(seconds / 86400)
  if (days > 0) return `${days} day${days !== 1 ? 's' : ''}`
  const hours = Math.floor(seconds / 3600)
  if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}`
  const minutes = Math.max(1, Math.floor(seconds / 60))
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`
}

// Minimal markdown → HTML for AI feedback (bold, numbered lists, bullets, paragraphs).
// Text is HTML-escaped first, so this is safe to use with dangerouslySetInnerHTML.
function renderMarkdown(text) {
  if (!text) return ''
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Process **bold** before *bold* so double-asterisk doesn't get partially matched
  const inline = (s) =>
    escape(s)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')

  // Detect inline numbered lists: "...intro: (1) first item (2) second item (3) third item"
  // Returns { prefix, items } if found, null otherwise.
  function splitInlineList(line) {
    if (!line.includes('(1)')) return null
    const firstIdx = line.indexOf('(1)')
    const prefix = line.slice(0, firstIdx).trim()
    const listPart = line.slice(firstIdx)
    // Split on every "(n) " marker
    const items = listPart.split(/\s*\(\d+\)\s+/).filter(Boolean)
    // Only treat as a list if at least two items found (avoids false positives)
    if (items.length < 2) return null
    return { prefix, items: items.map((s) => s.trim()) }
  }

  const lines = text.split('\n')
  const parts = []
  let listType = null
  let listItems = []

  const flushList = () => {
    if (listType) {
      const cls = listType === 'ol' ? 'list-decimal' : 'list-disc'
      parts.push(`<${listType} class="${cls} pl-5 mb-3 space-y-1">${listItems.join('')}</${listType}>`)
      listType = null
      listItems = []
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    // Inline numbered list embedded in a paragraph, e.g. "To improve: (1) ... (2) ... (3) ..."
    const inlineList = splitInlineList(line)
    if (inlineList) {
      flushList()
      if (inlineList.prefix) {
        parts.push(`<p class="mb-2">${inline(inlineList.prefix)}</p>`)
      }
      const itemsHtml = inlineList.items.map((item) => `<li>${inline(item)}</li>`).join('')
      parts.push(`<ol class="list-decimal pl-5 mb-3 space-y-1">${itemsHtml}</ol>`)
      continue
    }

    // Numbered list on its own line: "1. item" or "(1) item"
    const olMatch = line.match(/^\d+\.\s+(.+)/) || line.match(/^\(\d+\)\s+(.+)/)
    // Bullet: "- item" or "* item" (requires space after marker)
    const ulMatch = line.match(/^[-*]\s+(.+)/)

    if (olMatch) {
      if (listType === 'ul') flushList()
      listType = 'ol'
      listItems.push(`<li>${inline(olMatch[1])}</li>`)
    } else if (ulMatch) {
      if (listType === 'ol') flushList()
      listType = 'ul'
      listItems.push(`<li>${inline(ulMatch[1])}</li>`)
    } else {
      flushList()
      if (line.trim()) parts.push(`<p class="mb-2 last:mb-0">${inline(line.trim())}</p>`)
    }
  }
  flushList()
  return parts.join('')
}

export const HTML_PROSE =
  'text-sm text-gray-700 leading-relaxed [&_p]:mb-3 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_em]:italic [&_a]:text-blue-600 [&_a]:underline [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_li]:mb-1 [&_hr]:border-gray-200 [&_hr]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:italic'

// ---------------------------------------------------------------------------
// Grade scaling helpers
// ---------------------------------------------------------------------------

export function computeMaxPoints(rubric) {
  if (!rubric) return 0
  return (rubric.criteria ?? []).reduce((sum, c) => {
    const levels = c.levels ?? []
    return sum + (levels.length > 0 ? Math.max(...levels.map((l) => l.points)) : 0)
  }, 0)
}

export function applyScaling(rawScore, maxPossible, assignment) {
  if (!assignment?.grade_scale_enabled || !assignment?.grade_scale_max || maxPossible <= 0) return null
  const scaled = (rawScore / maxPossible) * assignment.grade_scale_max
  const dp = assignment.grade_decimal_places ?? 2
  switch (assignment.grade_rounding ?? 'none') {
    case 'round': {
      const f = Math.pow(10, dp)
      return Math.round(scaled * f) / f
    }
    case 'round_up': {
      const f = Math.pow(10, dp)
      return Math.ceil(scaled * f) / f
    }
    case 'round_down': {
      const f = Math.pow(10, dp)
      return Math.floor(scaled * f) / f
    }
    case 'half':
      return Math.round(scaled * 2) / 2
    default:
      return parseFloat(scaled.toFixed(dp))
  }
}

function formatScaled(scaled, assignment) {
  if (scaled === null) return null
  const dp = assignment.grade_rounding === 'half' ? 1 : (assignment.grade_decimal_places ?? 2)
  return `${scaled.toFixed(dp)} / ${assignment.grade_scale_max}`
}

// Returns an assignment-like object with the correct scale settings for the given result type.
// For moderation results where separate_moderation_grade_scale is enabled, substitutes the
// moderation-specific fields so applyScaling/formatScaled use the right values.
export function getEffectiveAssignment(assignment, resultType) {
  if (
    resultType === 'moderation' &&
    assignment?.separate_moderation_grade_scale &&
    assignment?.moderation_grade_scale_max
  ) {
    return {
      ...assignment,
      grade_scale_max: assignment.moderation_grade_scale_max,
      grade_rounding: assignment.moderation_grade_rounding ?? 'none',
      grade_decimal_places: assignment.moderation_grade_decimal_places ?? 2,
    }
  }
  return assignment
}

// Compute combined grade for a set of submissions of one type (AI or teacher separately).
// Returns { grade, graded, total, isComplete } or null if the feature is disabled.
//
// Mode logic:
//   maxN set   → Expected N submissions. Take best min(submitted, N) scores, divide by N.
//               Missing submissions count as 0. Submitting more only helps (best taken).
//   maxN null  → No limit. Simple average of all submitted.
//
// isComplete = all submitted submissions are graded (we only show the final grade when fully done).
export function computeStudentCombined(submissions, maxN, maxPossible, assignment, useTeacher, resultType) {
  const effectiveAssignment = getEffectiveAssignment(assignment, resultType)
  // Exclude dismissed late submissions from grade calculations
  const eligible = submissions.filter((r) => r.status !== 'excluded')
  const total = eligible.length
  if (total === 0) return null

  const gradedSubs = useTeacher
    ? eligible.filter((r) => r.teacher_criterion_grades && r.teacher_criterion_grades.length > 0)
    : eligible.filter((r) => r.status === 'complete')

  const graded = gradedSubs.length
  const isComplete = graded === total

  const rawScores = gradedSubs
    .map((r) => {
      const grades = useTeacher ? (r.teacher_criterion_grades ?? []) : (r.criterion_grades ?? [])
      const rawScore = grades.reduce((s, g) => s + (g.points_awarded || 0), 0)
      // Renormalize to current maxPossible scale if this result was graded under a different rubric
      if (!useTeacher && r.rubric_max_points_json && maxPossible > 0) {
        const storedMax = Object.values(r.rubric_max_points_json).reduce((s, v) => s + v, 0)
        if (storedMax > 0 && storedMax !== maxPossible) {
          return (rawScore / storedMax) * maxPossible
        }
      }
      return rawScore
    })
    .sort((a, b) => b - a) // descending so slice(0, maxN) gives best N

  let grade = null
  if (isComplete && graded > 0) {
    let combinedRaw
    if (maxN && maxN > 0) {
      const bestN = rawScores.slice(0, maxN)
      combinedRaw = bestN.reduce((a, b) => a + b, 0) / maxN
    } else {
      combinedRaw = rawScores.reduce((a, b) => a + b, 0) / rawScores.length
    }
    const scaled = applyScaling(combinedRaw, maxPossible, effectiveAssignment)
    grade = scaled !== null ? scaled : combinedRaw
  }

  return { grade, graded, total, isComplete, maxPossible, effectiveAssignment }
}

function formatCombinedGrade(info) {
  if (!info || info.grade === null) return null
  const eff = info.effectiveAssignment
  const isScaling = eff?.grade_scale_enabled && eff?.grade_scale_max
  if (isScaling) return formatScaled(info.grade, eff)
  const dp = Math.max(eff?.grade_decimal_places ?? 1, 1)
  return `${info.grade.toFixed(dp)} / ${info.maxPossible.toFixed(dp)}`
}

// ---------------------------------------------------------------------------
// Student-centric grade view — accordion: Student → Topics → Submissions
// ---------------------------------------------------------------------------

// Inline SVG icon helpers
function IconEye() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function IconMail() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  )
}

function IconUndo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
  )
}

function IconChevron({ open }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  )
}

function SubmissionRow({ result: r, onEmailIndividual, onGradeNow, onGrantExtension, onAcknowledgeLate, onUndoDismiss, onRevokeExtension, assignment, maxPossible, indent }) {
  const aiRaw = (r.criterion_grades ?? []).reduce((s, g) => s + (g.points_awarded || 0), 0)
  const teacherRaw = r.teacher_criterion_grades
    ? r.teacher_criterion_grades.reduce((s, g) => s + (g.points_awarded || 0), 0)
    : null

  const effectiveAssignment = getEffectiveAssignment(assignment, r.result_type)
  const aiMaxPossible = r.rubric_max_points_json
    ? Object.values(r.rubric_max_points_json).reduce((s, v) => s + v, 0) || maxPossible
    : maxPossible
  const scaledAi = applyScaling(aiRaw, aiMaxPossible, effectiveAssignment)
  const scaledTeacher = teacherRaw !== null ? applyScaling(teacherRaw, maxPossible, effectiveAssignment) : null
  const isScaling = effectiveAssignment?.grade_scale_enabled && effectiveAssignment?.grade_scale_max

  const needsModeration = r.resource_status === 'Needs Moderation'
  const isRemoved = r.resource_status === 'Removed'

  return (
    <tr className="hover:bg-gray-50/60 transition-colors">
      <td className={`font-mono text-sm ${indent ? 'pl-4 pr-3 py-2.5' : 'px-3 py-2.5'} text-gray-700`}>
        {needsModeration ? (
          <button onClick={() => onGradeNow?.(r)} className="bg-amber-100 text-amber-800 rounded px-1 hover:bg-amber-200 transition-colors" title="Resource needs moderation">
            {r.resource_id}
          </button>
        ) : isRemoved ? (
          <span className="bg-red-100 text-red-700 rounded px-1 cursor-default" title="Resource has been removed">
            {r.resource_id}
          </span>
        ) : (
          <button onClick={() => onGradeNow?.(r)} className="hover:underline" title="Open in marking panel">
            {r.resource_id}
          </button>
        )}
      </td>
      <td className="px-2 py-2.5 text-sm text-center">
        <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded ${
          r.result_type === 'moderation'
            ? 'bg-amber-50 text-amber-700'
            : 'bg-slate-100 text-slate-600'
        }`}>
          {r.result_type === 'moderation' ? 'Moderation' : 'Resource'}
        </span>
      </td>
      <td className="px-2 py-2.5 text-xs text-center whitespace-nowrap">
        {(r.is_late || r.status === 'excluded') && !r.has_extension ? (
          <span className={r.status === 'excluded' ? 'text-gray-400 italic' : 'text-orange-600 font-medium'}>
            {r.submission_date ? formatSubmissionDate(r.submission_date) : null}
            {r.seconds_late != null
              ? <span className="block text-xs font-normal">({formatLateness(r.seconds_late)} late)</span>
              : <span className="block">Late</span>}
          </span>
        ) : (
          <span className="text-gray-500">
            {r.submission_date ? formatSubmissionDate(r.submission_date) : <span className="text-gray-400">No date</span>}
            {r.has_extension && <span className="ml-1 text-xs bg-green-50 text-green-600 px-1 py-0.5 rounded">Extension</span>}
          </span>
        )}
      </td>
      <td className="px-2 py-2.5 text-sm tabular-nums text-center">
        {(r.criterion_grades ?? []).length === 0 ? (
          <span className="text-gray-300">—</span>
        ) : r.status === 'excluded' ? (
          <span className="line-through text-gray-400">
            {isScaling ? formatScaled(scaledAi, assignment) : aiRaw.toFixed(1)}
          </span>
        ) : isScaling ? (
          <span className="text-gray-800">{formatScaled(scaledAi, assignment)}</span>
        ) : (
          <span className="text-gray-800">{aiRaw.toFixed(1)}</span>
        )}
      </td>
      <td className="px-2 py-2.5 text-sm tabular-nums text-center">
        {teacherRaw !== null ? (
          <span className="text-gray-900 font-medium">
            {isScaling ? formatScaled(scaledTeacher, assignment) : teacherRaw.toFixed(1)}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-2 py-2.5">
        <div className="flex items-center justify-center gap-1">
          {/* Eye icon — always available */}
          {onGradeNow && (
            <button
              onClick={() => onGradeNow(r)}
              title="View submission"
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <IconEye />
            </button>
          )}

          {r.status === 'excluded' ? (
            /* Dismissed — show undo arrow */
            <button
              onClick={() => onUndoDismiss?.(r)}
              title="Undo dismissal"
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <IconUndo />
            </button>
          ) : r.has_extension ? (
            /* Has extension — show grade status + undo arrow */
            <>
              {(r.criterion_grades ?? []).length > 0 ? (
                <button
                  onClick={() => onEmailIndividual(r)}
                  disabled={r.status !== 'complete'}
                  title="Email grade"
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <IconMail />
                </button>
              ) : (
                <span className="text-xs text-amber-600 font-medium whitespace-nowrap">No AI grade</span>
              )}
              <button
                onClick={() => onRevokeExtension?.(r)}
                title="Revoke extension"
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <IconUndo />
              </button>
            </>
          ) : r.is_late && (r.criterion_grades ?? []).length === 0 ? (
            /* Late + ungraded — show Extension / Dismiss buttons */
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onGrantExtension?.(r)}
                title="Grant extension — allow AI grading"
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap"
              >
                Extension
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => onAcknowledgeLate?.(r)}
                title="Dismiss — no extension will be given"
                className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap"
              >
                Dismiss
              </button>
            </div>
          ) : r.is_late ? (
            /* Late but has AI grade — show warning + email */
            <>
              <span
                title="This was submitted after the cutoff date"
                className="text-red-500 font-bold text-sm cursor-default"
              >!</span>
              <button
                onClick={() => onEmailIndividual(r)}
                disabled={r.status !== 'complete'}
                title="Email grade"
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <IconMail />
              </button>
            </>
          ) : (r.criterion_grades ?? []).length === 0 ? (
            /* Not late, no AI grade */
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-amber-600 font-medium whitespace-nowrap">No AI grade</span>
            </div>
          ) : (
            /* Normal — email icon */
            <button
              onClick={() => onEmailIndividual(r)}
              disabled={r.status !== 'complete'}
              title="Email grade"
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <IconMail />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

function SectionHeaderRow({ label, combined, colSpan, colorClass }) {
  const aiGrade = combined?.ai?.isComplete && combined.ai.grade !== null ? formatCombinedGrade(combined.ai) : null
  const teacherGrade = combined?.teacher?.isComplete && combined.teacher.grade !== null ? formatCombinedGrade(combined.teacher) : null
  return (
    <tr>
      <td colSpan={colSpan} className={`px-4 py-1.5 ${colorClass}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
          {aiGrade && (
            <span className="text-xs font-medium opacity-80">
              &nbsp;|&nbsp; Overall Grade {aiGrade}
            </span>
          )}
          {teacherGrade && (
            <span className="text-xs font-medium text-emerald-700">
              &nbsp;&middot;&nbsp; {teacherGrade} <span className="opacity-60 font-normal">teacher</span>
            </span>
          )}
        </div>
      </td>
    </tr>
  )
}

export function StudentGradeTable({ results, emailDomain, onEmail, onEmailAll, onEmailTopic, onGradeNow, onGrantExtension, onAcknowledgeLate, onUndoDismiss, onRevokeExtension, isSingleTopic = false, assignment, resourceRubric, moderationRubric }) {
  const [expandedStudentId, setExpandedStudentId] = useState(null)
  const maxPossibleResource = computeMaxPoints(resourceRubric)
  const maxPossibleModeration = computeMaxPoints(moderationRubric ?? resourceRubric)
  const [emailingAll, setEmailingAll] = useState({})
  const [emailingTopic, setEmailingTopic] = useState({})
  const [emailError, setEmailError] = useState(null)      // red — actual failure
  const [emailInfo, setEmailInfo] = useState(null)        // blue — clipboard fallback notice

  const students = useMemo(() => {
    const map = new Map()
    for (const r of results) {
      if (r.result_type === 'resource' && r.primary_author_id) {
        if (!map.has(r.primary_author_id))
          map.set(r.primary_author_id, { id: r.primary_author_id, name: r.primary_author_name })
      }
      if (r.result_type === 'moderation' && r.moderation_user_id) {
        if (!map.has(r.moderation_user_id))
          map.set(r.moderation_user_id, { id: r.moderation_user_id, name: r.moderation_user_name || null })
      }
    }
    return [...map.values()].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
  }, [results])

  function getStudentResults(studentId) {
    return results.filter((r) =>
      (r.result_type === 'resource' && r.primary_author_id === studentId) ||
      (r.result_type === 'moderation' && r.moderation_user_id === studentId)
    )
  }

  function groupByTopic(studentResults) {
    const topicMap = new Map()
    for (const r of studentResults) {
      const topic = (r.resource_topics ?? '').trim() || 'No Topic'
      if (!topicMap.has(topic)) topicMap.set(topic, { resources: [], moderations: [] })
      if (r.result_type === 'resource') topicMap.get(topic).resources.push(r)
      else topicMap.get(topic).moderations.push(r)
    }
    return [...topicMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([topic, data]) => ({ topic, ...data }))
  }

  // Compute both AI and teacher combined grades for a set of submissions of one type
  function getCombined(subs, maxN, maxPossible, resultType) {
    return {
      ai: computeStudentCombined(subs, maxN, maxPossible, assignment, false, resultType),
      teacher: computeStudentCombined(subs, maxN, maxPossible, assignment, true, resultType),
    }
  }

  function resolvedEmail(studentId) {
    return emailDomain ? `${studentId}@${emailDomain}` : undefined
  }

  async function handleEmailAll(studentId) {
    if (!onEmailAll) return
    setEmailError(null)
    setEmailInfo(null)
    setEmailingAll((p) => ({ ...p, [studentId]: true }))
    try {
      const result = await onEmailAll(studentId, resolvedEmail(studentId))
      if (result?.clipboardFallback) {
        setEmailInfo('Email body copied to clipboard — paste it into the email that just opened.')
      }
    } catch (err) { setEmailError(err?.message || 'Failed to open email') }
    setEmailingAll((p) => ({ ...p, [studentId]: false }))
  }

  async function handleEmailTopic(studentId, topic) {
    if (!onEmailTopic) return
    setEmailError(null)
    setEmailInfo(null)
    const key = `${studentId}:${topic}`
    setEmailingTopic((p) => ({ ...p, [key]: true }))
    try {
      const result = await onEmailTopic(studentId, topic, resolvedEmail(studentId))
      if (result?.clipboardFallback) {
        setEmailInfo('Email body copied to clipboard — paste it into the email that just opened.')
      }
    } catch (err) { setEmailError(err?.message || 'Failed to open email') }
    setEmailingTopic((p) => ({ ...p, [key]: false }))
  }

  function handleEmailIndividual(r) {
    const userId = r.result_type === 'resource' ? r.primary_author_id : r.moderation_user_id
    const toEmail = emailDomain && userId ? `${userId}@${emailDomain}` : undefined
    try { onEmail(r.id, toEmail) } catch {}
  }

  const sortRows = (arr) =>
    [...arr].sort((a, b) => Number(a.resource_id) - Number(b.resource_id) || String(a.resource_id).localeCompare(String(b.resource_id)))

  if (students.length === 0) {
    return <p className="text-sm text-gray-400 italic">No results yet.</p>
  }

  return (
    <div>
      {emailError && (
        <div className="flex items-start justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 mb-3 text-sm text-red-700">
          <span>{emailError}</span>
          <button onClick={() => setEmailError(null)} className="ml-3 text-red-400 hover:text-red-600 shrink-0">✕</button>
        </div>
      )}
      {emailInfo && (
        <div className="flex items-start justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 mb-3 text-sm text-blue-700">
          <span>{emailInfo}</span>
          <button onClick={() => setEmailInfo(null)} className="ml-3 text-blue-400 hover:text-blue-600 shrink-0">✕</button>
        </div>
      )}
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {students.map((student, si) => {
        const isExpanded = expandedStudentId === student.id
        const studentResults = getStudentResults(student.id)
        const topicGroups = groupByTopic(studentResults)
        const hasComplete = studentResults.some((r) => r.status === 'complete')
        const hasPendingLate = studentResults.some((r) => r.is_late && !r.has_extension && r.status !== 'excluded')
        const totalCount = studentResults.length

        return (
          <div key={student.id} className={si > 0 ? 'border-t border-gray-200' : ''}>
            {/* Student row */}
            <div
              className={`flex items-center justify-between px-5 py-3.5 cursor-pointer select-none transition-colors ${
                isExpanded ? 'bg-gray-50' : 'bg-white hover:bg-gray-50/70'
              }`}
              onClick={() => setExpandedStudentId(isExpanded ? null : student.id)}
            >
              <div className="flex items-center gap-3 min-w-0 flex-wrap">
                <span className={`text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'text-gray-600' : ''}`}>
                  <IconChevron open={isExpanded} />
                </span>
                <div className="min-w-0">
                  <span className="font-medium text-gray-900 text-sm">{student.name || student.id}</span>
                  {student.name && (
                    <span className="ml-2 text-xs text-gray-400 font-mono">{student.id}</span>
                  )}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{totalCount} submission{totalCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex-shrink-0 ml-4 flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
                {hasPendingLate && (
                  <span className="text-xs text-orange-600 font-medium whitespace-nowrap">Resolve late submission</span>
                )}
                {onEmailAll && (
                  <button
                    onClick={() => handleEmailAll(student.id)}
                    disabled={emailingAll[student.id] || !hasComplete || hasPendingLate}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 bg-white hover:border-gray-400 hover:text-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <IconMail />
                    {emailingAll[student.id] ? 'Sending…' : isSingleTopic ? 'Email Topic Results' : 'Email All Grades'}
                  </button>
                )}
              </div>
            </div>

            {/* Expanded panel */}
            {isExpanded && (
              <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-4 space-y-3">
                {topicGroups.map(({ topic, resources, moderations }) => {
                  const topicKey = `${student.id}:${topic}`
                  const topicHasComplete = [...resources, ...moderations].some((r) => r.status === 'complete')
                  const topicHasPendingLate = [...resources, ...moderations].some((r) => r.is_late && !r.has_extension && r.status !== 'excluded')

                  return (
                    <div key={topic} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      {/* Topic section header — hidden on topic-specific pages */}
                      {!isSingleTopic && (
                        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-gray-700 tracking-wide uppercase">{topic}</span>
                          </div>
                          {onEmailTopic && (
                            topicHasPendingLate ? (
                              <span className="text-xs text-orange-600 font-medium whitespace-nowrap">Resolve late submission</span>
                            ) : (
                            <button
                              onClick={() => handleEmailTopic(student.id, topic)}
                              disabled={emailingTopic[topicKey] || !topicHasComplete}
                              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-gray-300 text-gray-600 bg-white hover:border-gray-400 hover:text-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              <IconMail />
                              {emailingTopic[topicKey] ? 'Sending…' : `Email ${topic}`}
                            </button>
                            )
                          )}
                        </div>
                      )}

                      {/* Submission table — no vertical dividers */}
                      <table className="w-full text-sm table-fixed">
                        <colgroup>
                          <col style={{width: '22%'}} />
                          <col style={{width: '13%'}} />
                          <col style={{width: '17%'}} />
                          <col style={{width: '16%'}} />
                          <col style={{width: '16%'}} />
                          <col style={{width: '16%'}} />
                        </colgroup>
                        <thead>
                          <tr className="border-b border-gray-100">
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                            <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                            <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                            <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">AI Score</th>
                            <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Teacher Score</th>
                            <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {sortRows(resources).map((r) => (
                            <SubmissionRow key={r.id} result={r} onEmailIndividual={handleEmailIndividual} onGradeNow={onGradeNow} onGrantExtension={onGrantExtension} onAcknowledgeLate={onAcknowledgeLate} onUndoDismiss={onUndoDismiss} onRevokeExtension={onRevokeExtension} assignment={assignment} maxPossible={maxPossibleResource} />
                          ))}
                          {sortRows(moderations).map((r) => (
                            <SubmissionRow key={r.id} result={r} onEmailIndividual={handleEmailIndividual} onGradeNow={onGradeNow} onGrantExtension={onGrantExtension} onAcknowledgeLate={onAcknowledgeLate} onUndoDismiss={onUndoDismiss} onRevokeExtension={onRevokeExtension} assignment={assignment} maxPossible={maxPossibleModeration} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Student overview table — sortable summary row per student, expandable detail
// ---------------------------------------------------------------------------

function SortableHeader({ col, label, sortCol, sortDir, onSort, align = 'left' }) {
  const active = sortCol === col
  return (
    <th
      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors ${
        align === 'center' ? 'text-center' : 'text-left'
      } ${active ? 'text-indigo-700 bg-indigo-50/60' : 'text-gray-600 bg-gray-50'}`}
      onClick={() => onSort(col)}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'center' ? 'justify-center w-full' : ''}`}>
        {label}
        <span className={`text-xs ${active ? 'opacity-80' : 'opacity-30'}`}>
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </span>
    </th>
  )
}

export function StudentOverviewTable({
  results,
  allTopics = [],
  emailDomain,
  onEmail,
  onEmailAll,
  onEmailTopic,
  onGradeNow,
  onGrantExtension,
  onAcknowledgeLate,
  onUndoDismiss,
  onRevokeExtension,
  assignment,
  resourceRubric,
  moderationRubric,
  topicFilter,
}) {
  const [sortCol, setSortCol] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [expandedStudentId, setExpandedStudentId] = useState(null)
  const [emailingAll, setEmailingAll] = useState({})
  const [emailingTopic, setEmailingTopic] = useState({})
  const [emailError, setEmailError] = useState(null)
  const [emailInfo, setEmailInfo] = useState(null)

  const maxPossibleResource = computeMaxPoints(resourceRubric)
  const maxPossibleModeration = computeMaxPoints(moderationRubric ?? resourceRubric)
  const isRnM = assignment?.assignment_type === 'resources_and_moderations'
  const topicNames = useMemo(() => {
    const names = (allTopics || []).map((t) => typeof t === 'string' ? t : t?.topic).filter(Boolean)
    return [...new Set(names)]
  }, [allTopics])

  const students = useMemo(() => {
    const map = new Map()
    for (const r of results) {
      if (r.result_type === 'resource' && r.primary_author_id) {
        if (!map.has(r.primary_author_id))
          map.set(r.primary_author_id, { id: r.primary_author_id, name: r.primary_author_name, resources: [], moderations: [] })
        map.get(r.primary_author_id).resources.push(r)
      }
      if (r.result_type === 'moderation' && r.moderation_user_id) {
        if (!map.has(r.moderation_user_id))
          map.set(r.moderation_user_id, { id: r.moderation_user_id, name: r.moderation_user_name || null, resources: [], moderations: [] })
        map.get(r.moderation_user_id).moderations.push(r)
      }
    }
    return [...map.values()]
  }, [results])

  function getGrades(student) {
    const resInfo = computeStudentCombined(student.resources, assignment?.combine_resource_max_n ?? null, maxPossibleResource, assignment, false, 'resource')
    const resTeacher = computeStudentCombined(student.resources, assignment?.combine_resource_max_n ?? null, maxPossibleResource, assignment, true, 'resource')
    const modInfo = isRnM ? computeStudentCombined(student.moderations, assignment?.combine_moderation_max_n ?? null, maxPossibleModeration, assignment, false, 'moderation') : null
    const modTeacher = isRnM ? computeStudentCombined(student.moderations, assignment?.combine_moderation_max_n ?? null, maxPossibleModeration, assignment, true, 'moderation') : null
    return { resInfo, resTeacher, modInfo, modTeacher }
  }

  function getConfiguredDisplayInfo(resultType) {
    const eff = getEffectiveAssignment(assignment, resultType)
    const rawMax = resultType === 'moderation' ? maxPossibleModeration : maxPossibleResource
    return {
      max: eff?.grade_scale_enabled && eff?.grade_scale_max ? Number(eff.grade_scale_max) : rawMax,
      dp: Math.max(eff?.grade_decimal_places ?? 1, 1),
    }
  }

  function topicOverallBundle(resInfo, modInfo) {
    const r = resInfo?.grade ?? null
    const m = modInfo?.grade ?? null
    if (r === null && m === null) return null

    const resCfg = getConfiguredDisplayInfo('resource')
    const modCfg = getConfiguredDisplayInfo('moderation')

    if (!isRnM) {
      return {
        value: r ?? 0,
        max: resCfg.max,
        dp: Math.max(resInfo?.effectiveAssignment?.grade_decimal_places ?? resCfg.dp, 1),
      }
    }

    return {
      value: (r ?? 0) + (m ?? 0),
      max: resCfg.max + modCfg.max,
      dp: Math.max(
        resInfo?.effectiveAssignment?.grade_decimal_places ?? resCfg.dp,
        modInfo?.effectiveAssignment?.grade_decimal_places ?? modCfg.dp,
        1,
      ),
    }
  }

  function zeroOverallBundle() {
    const resCfg = getConfiguredDisplayInfo('resource')
    if (!isRnM) {
      return { value: 0, max: resCfg.max, dp: resCfg.dp }
    }
    const modCfg = getConfiguredDisplayInfo('moderation')
    return {
      value: 0,
      max: resCfg.max + modCfg.max,
      dp: Math.max(resCfg.dp, modCfg.dp, 1),
    }
  }

  function getAggregateOverall(student, useTeacher = false) {
    if (topicFilter) {
      const grades = getGrades(student)
      return topicOverallBundle(useTeacher ? grades.resTeacher : grades.resInfo, useTeacher ? grades.modTeacher : grades.modInfo)
    }

    const names = topicNames.length > 0
      ? topicNames
      : groupByTopicLocal([...student.resources, ...student.moderations]).map((g) => g.topic)

    if (names.length === 0) return null

    let totalValue = 0
    let totalMax = 0
    let dp = 1
    for (const topic of names) {
      const resources = student.resources.filter((r) => ((r.resource_topics ?? '').trim() || 'No Topic') === topic)
      const moderations = student.moderations.filter((r) => ((r.resource_topics ?? '').trim() || 'No Topic') === topic)
      if (resources.length === 0 && moderations.length === 0) {
        const bundle = zeroOverallBundle()
        totalValue += bundle.value
        totalMax += bundle.max
        dp = Math.max(dp, bundle.dp ?? 1)
        continue
      }
      const resInfo = computeStudentCombined(resources, assignment?.combine_resource_max_n ?? null, maxPossibleResource, assignment, useTeacher, 'resource')
      const modInfo = isRnM ? computeStudentCombined(moderations, assignment?.combine_moderation_max_n ?? null, maxPossibleModeration, assignment, useTeacher, 'moderation') : null
      const bundle = topicOverallBundle(resInfo, modInfo)
      if (!bundle) return null
      totalValue += bundle.value
      totalMax += bundle.max
      dp = Math.max(dp, bundle.dp ?? 1)
    }
    return { value: totalValue, max: totalMax, dp }
  }

  function formatOverallBundle(bundle) {
    if (!bundle) return '—'
    const dp = bundle.dp ?? 1
    const fmt = (n) => Number(n.toFixed(dp)).toString()
    return `${fmt(bundle.value)} / ${fmt(bundle.max)}`
  }

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const sortedStudents = useMemo(() => {
    function getSurname(name) {
      if (!name) return ''
      const parts = name.trim().split(/\s+/)
      return parts[parts.length - 1].toLowerCase()
    }
    return [...students].sort((a, b) => {
      let cmp = 0
      if (sortCol === 'name') {
        cmp = getSurname(a.name || a.id).localeCompare(getSurname(b.name || b.id))
      } else if (sortCol === 'id') {
        cmp = (a.id || '').localeCompare(b.id || '')
      } else if (sortCol === 'aiGrade') {
        cmp = (getAggregateOverall(a, false)?.value ?? -Infinity) - (getAggregateOverall(b, false)?.value ?? -Infinity)
      } else if (sortCol === 'teacherGrade') {
        cmp = (getAggregateOverall(a, true)?.value ?? -Infinity) - (getAggregateOverall(b, true)?.value ?? -Infinity)
      } else if (sortCol === 'submissions') {
        cmp = (a.resources.length + a.moderations.length) - (b.resources.length + b.moderations.length)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [students, sortCol, sortDir, assignment, maxPossibleResource, maxPossibleModeration, isRnM])

  function resolvedEmail(studentId) {
    return emailDomain ? `${studentId}@${emailDomain}` : undefined
  }

  async function handleEmailRow(student) {
    setEmailError(null)
    setEmailInfo(null)
    setEmailingAll((p) => ({ ...p, [student.id]: true }))
    try {
      const result = topicFilter
        ? await onEmailTopic(student.id, topicFilter, resolvedEmail(student.id))
        : await onEmailAll(student.id, resolvedEmail(student.id))
      if (result?.clipboardFallback) setEmailInfo('Email body copied to clipboard — paste it into the email that just opened.')
    } catch (err) {
      setEmailError(err?.message || 'Failed to open email')
    }
    setEmailingAll((p) => ({ ...p, [student.id]: false }))
  }

  async function handleEmailTopicBtn(studentId, topic) {
    setEmailError(null)
    setEmailInfo(null)
    const key = `${studentId}:${topic}`
    setEmailingTopic((p) => ({ ...p, [key]: true }))
    try {
      const result = await onEmailTopic(studentId, topic, resolvedEmail(studentId))
      if (result?.clipboardFallback) setEmailInfo('Email body copied to clipboard — paste it into the email that just opened.')
    } catch (err) {
      setEmailError(err?.message || 'Failed to open email')
    }
    setEmailingTopic((p) => ({ ...p, [key]: false }))
  }

  function handleEmailIndividual(r) {
    const userId = r.result_type === 'resource' ? r.primary_author_id : r.moderation_user_id
    const toEmail = emailDomain && userId ? `${userId}@${emailDomain}` : undefined
    try { onEmail(r.id, toEmail) } catch {}
  }

  function groupByTopicLocal(studentResults) {
    const topicMap = new Map()
    for (const r of studentResults) {
      const topic = (r.resource_topics ?? '').trim() || 'No Topic'
      if (!topicMap.has(topic)) topicMap.set(topic, { resources: [], moderations: [] })
      if (r.result_type === 'resource') topicMap.get(topic).resources.push(r)
      else topicMap.get(topic).moderations.push(r)
    }
    return [...topicMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([topic, data]) => ({ topic, ...data }))
  }

  const sortRows = (arr) =>
    [...arr].sort((a, b) => Number(a.resource_id) - Number(b.resource_id) || String(a.resource_id).localeCompare(String(b.resource_id)))

  function getCombinedLocal(subs, maxN, maxPossible, resultType) {
    return {
      ai: computeStudentCombined(subs, maxN, maxPossible, assignment, false, resultType),
      teacher: computeStudentCombined(subs, maxN, maxPossible, assignment, true, resultType),
    }
  }

  if (students.length === 0) {
    return <p className="text-sm text-gray-400 italic">No results yet.</p>
  }

  return (
    <div>
      {emailError && (
        <div className="flex items-start justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 mb-3 text-sm text-red-700">
          <span>{emailError}</span>
          <button onClick={() => setEmailError(null)} className="ml-3 text-red-400 hover:text-red-600 shrink-0">✕</button>
        </div>
      )}
      {emailInfo && (
        <div className="flex items-start justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 mb-3 text-sm text-blue-700">
          <span>{emailInfo}</span>
          <button onClick={() => setEmailInfo(null)} className="ml-3 text-blue-400 hover:text-blue-600 shrink-0">✕</button>
        </div>
      )}
      <div className="max-h-[65vh] overflow-y-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col style={{width: '22%'}} />
            <col style={{width: '13%'}} />
            <col style={{width: '17%'}} />
            <col style={{width: '17%'}} />
            <col style={{width: '11%'}} />
            <col style={{width: '20%'}} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr className="border-b border-gray-200">
              <SortableHeader col="name" label="Student Name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader col="id" label="Student ID" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader col="aiGrade" label="Overall AI Grade" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="center" />
              <SortableHeader col="teacherGrade" label="Overall Teacher Grade" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="center" />
              <SortableHeader col="submissions" label="Submissions" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="center" />
              <th className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600 text-center whitespace-nowrap bg-gray-50`}>
                {topicFilter ? `Email ${topicFilter}` : 'Email All Grades'}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedStudents.map((student) => {
              const isExpanded = expandedStudentId === student.id
              const hasComplete = [...student.resources, ...student.moderations].some((r) => r.status === 'complete')
              const hasUngraded = [...student.resources, ...student.moderations].some((r) => (r.criterion_grades ?? []).length === 0 && r.status !== 'error' && r.status !== 'excluded' && !(r.is_late && r.has_extension))
              const hasError = [...student.resources, ...student.moderations].some((r) => r.status === 'error')
              const hasPendingLate = [...student.resources, ...student.moderations].some((r) => r.is_late && !r.has_extension && r.status !== 'excluded')
              const totalSubs = student.resources.length + student.moderations.length
              const overallAi = getAggregateOverall(student, false)
              const overallTeacher = getAggregateOverall(student, true)

              return (
                <Fragment key={student.id}>
                  <tr
                    className={`cursor-pointer select-none border-t border-gray-100 transition-colors ${
                      isExpanded ? 'bg-indigo-50/40' : 'bg-white hover:bg-gray-50/70'
                    }`}
                    onClick={() => setExpandedStudentId(isExpanded ? null : student.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`flex-shrink-0 transition-transform ${isExpanded ? 'text-indigo-600' : 'text-gray-400'}`}>
                          <IconChevron open={isExpanded} />
                        </span>
                        <span className="font-medium text-gray-900">{student.name || student.id}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{student.name ? student.id : '—'}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-gray-800">
                      {formatOverallBundle(overallAi)}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-emerald-700 font-medium">
                      {formatOverallBundle(overallTeacher)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">{totalSubs}</td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      {onEmailAll && (
                        <div className="flex flex-col items-center gap-1">
                          {hasPendingLate && (
                            <span className="text-xs text-orange-600 font-medium whitespace-nowrap">Resolve late submission</span>
                          )}
                          {hasUngraded && (
                            <span className="text-xs text-amber-600 font-medium whitespace-nowrap">AI grade missing</span>
                          )}
                          {hasError && (
                            <span className="text-xs text-red-600 font-medium whitespace-nowrap">AI grade error</span>
                          )}
                          <button
                            onClick={() => handleEmailRow(student)}
                            disabled={emailingAll[student.id] || !hasComplete || hasPendingLate || hasUngraded || hasError}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 bg-white hover:border-gray-400 hover:text-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <IconMail />
                            {emailingAll[student.id] ? 'Sending…' : (topicFilter ? `Email ${topicFilter}` : 'Email All')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="border-t border-gray-100">
                      <td colSpan={6} className="px-5 py-4 bg-gray-50/50">
                        <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
                          <table className="w-full text-sm table-fixed">
                            <colgroup>
                              <col style={{width: '22%'}} />
                              <col style={{width: '13%'}} />
                              <col style={{width: '17%'}} />
                              <col style={{width: '16%'}} />
                              <col style={{width: '16%'}} />
                              <col style={{width: '16%'}} />
                            </colgroup>
                            <thead>
                              <tr className="border-b border-gray-200 bg-gray-50">
                                <th className="pl-4 pr-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">ID</th>
                                <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                                <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                                <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">AI Score</th>
                                <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Teacher Score</th>
                                <th className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {groupByTopicLocal([...student.resources, ...student.moderations]).map(({ topic, resources, moderations }, topicIdx) => {
                                const topicKey = `${student.id}:${topic}`
                                const topicHasComplete = [...resources, ...moderations].some((r) => r.status === 'complete')
                                const topicHasUngraded = [...resources, ...moderations].some((r) => (r.criterion_grades ?? []).length === 0 && r.status !== 'error' && r.status !== 'excluded' && !(r.is_late && r.has_extension))
                                const topicHasError = [...resources, ...moderations].some((r) => r.status === 'error')
                                const topicHasPendingLate = [...resources, ...moderations].some((r) => r.is_late && !r.has_extension && r.status !== 'excluded')
                                const resSectionCombined = getCombinedLocal(resources, assignment?.combine_resource_max_n ?? null, maxPossibleResource, 'resource')
                                const modSectionCombined = getCombinedLocal(moderations, assignment?.combine_moderation_max_n ?? null, maxPossibleModeration, 'moderation')
                                return (
                                  <Fragment key={topic}>
                                    {/* Topic header row */}
                                    <tr className={`bg-indigo-50/60 border-b border-gray-300 ${topicIdx > 0 ? 'border-t-2 border-gray-300' : ''}`}>
                                      <td colSpan={5} className="px-4 py-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-xs font-semibold text-indigo-800 uppercase tracking-wide">{topic}</span>
                                          {topicHasUngraded && (
                                            <span className="text-xs font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">AI grade missing</span>
                                          )}

                                          {(() => {
                                            const combinedAi = topicOverallBundle(resSectionCombined?.ai, modSectionCombined?.ai)
                                            const combinedTeacher = topicOverallBundle(resSectionCombined?.teacher, modSectionCombined?.teacher)
                                            const resAi = formatCombinedGrade(resSectionCombined?.ai)
                                            const modAi = formatCombinedGrade(modSectionCombined?.ai)
                                            const resTeacher = formatCombinedGrade(resSectionCombined?.teacher)
                                            const modTeacher = formatCombinedGrade(modSectionCombined?.teacher)
                                            const dot = <span className="text-indigo-300 mx-0.5">·</span>
                                            return (
                                              <>
                                                {combinedAi && <>{dot}<span className="text-xs text-indigo-700 font-semibold">Combined {formatOverallBundle(combinedAi)}</span></>}
                                                {!isRnM && resAi && <>{dot}<span className="text-xs text-indigo-600 font-medium">AI {resAi}</span></>}
                                                {isRnM && resAi && <>{dot}<span className="text-xs text-indigo-600 font-medium">Resource {resAi}</span></>}
                                                {isRnM && modAi && <>{dot}<span className="text-xs text-indigo-600 font-medium">Moderation {modAi}</span></>}
                                                {combinedTeacher && <>{dot}<span className="text-xs text-emerald-700 font-semibold">Teacher {formatOverallBundle(combinedTeacher)}</span></>}
                                                {!isRnM && resTeacher && <>{dot}<span className="text-xs text-emerald-700 font-medium">Teacher {resTeacher}</span></>}
                                                {isRnM && resTeacher && <>{dot}<span className="text-xs text-emerald-700 font-medium">Res Teacher {resTeacher}</span></>}
                                                {isRnM && modTeacher && <>{dot}<span className="text-xs text-emerald-700 font-medium">Mod Teacher {modTeacher}</span></>}
                                              </>
                                            )
                                          })()}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        {onEmailTopic && (
                                          topicHasPendingLate ? (
                                            <span className="text-xs text-orange-600 font-medium whitespace-nowrap">Resolve late submission</span>
                                          ) : topicHasUngraded || topicHasError ? (
                                            <span className="text-xs text-amber-600 font-medium whitespace-nowrap">Resolve AI issue</span>
                                          ) : (
                                            <button
                                              onClick={() => handleEmailTopicBtn(student.id, topic)}
                                              disabled={emailingTopic[topicKey] || !topicHasComplete}
                                              title={`Email ${topic}`}
                                              className="inline-flex items-center justify-center p-2 rounded-md text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            >
                                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                                              </svg>
                                            </button>
                                          )
                                        )}
                                      </td>
                                    </tr>

                                    {/* Resource rows */}
                                    {sortRows(resources).map((r) => (
                                      <SubmissionRow key={r.id} result={r} onEmailIndividual={handleEmailIndividual} onGradeNow={onGradeNow} onGrantExtension={onGrantExtension} onAcknowledgeLate={onAcknowledgeLate} onUndoDismiss={onUndoDismiss} onRevokeExtension={onRevokeExtension} assignment={assignment} maxPossible={maxPossibleResource} indent />
                                    ))}

                                    {/* Moderation rows */}
                                    {sortRows(moderations).map((r) => (
                                      <SubmissionRow key={r.id} result={r} onEmailIndividual={handleEmailIndividual} onGradeNow={onGradeNow} onGrantExtension={onGrantExtension} onAcknowledgeLate={onAcknowledgeLate} onUndoDismiss={onUndoDismiss} onRevokeExtension={onRevokeExtension} assignment={assignment} maxPossible={maxPossibleModeration} indent />
                                    ))}
                                  </Fragment>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grade results table — AI Score + Teacher Score
// ---------------------------------------------------------------------------

export function GradeResultsTable({ results, type, expandedResult, setExpandedResult, onEmail, emailDomain, onGradeNow }) {
  const isMod = type === 'moderation'
  const [emailError, setEmailError] = useState({}) // resultId → error string
  const colSpan = onEmail ? 5 : 4

  async function handleEmail(e, r) {
    e.stopPropagation()
    const studentId = isMod ? r.moderation_user_id : r.primary_author_id
    const toEmail = (emailDomain && studentId) ? `${studentId}@${emailDomain}` : undefined
    try {
      setEmailError((prev) => ({ ...prev, [r.id]: null }))
      await onEmail(r.id, toEmail)
    } catch (err) {
      setEmailError((prev) => ({ ...prev, [r.id]: err.message }))
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
        <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
          <tr>
            <th className="px-4 py-3 text-left">Resource</th>
            <th className="px-4 py-3 text-left">{isMod ? 'Moderator' : 'Author'}</th>
            <th className="px-4 py-3 text-left">AI Score</th>
            <th className="px-4 py-3 text-left">Teacher Score</th>
            {onEmail && <th className="px-4 py-3 text-left w-32">Email</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {[...results].sort((a, b) => Number(b.resource_id) - Number(a.resource_id) || String(b.resource_id).localeCompare(String(a.resource_id))).map((r) => {
            const aiScore = (r.criterion_grades ?? []).reduce((s, g) => s + (g.points_awarded || 0), 0)
            const teacherScore = r.teacher_criterion_grades
              ? r.teacher_criterion_grades.reduce((s, g) => s + (g.points_awarded || 0), 0)
              : null
            const isExpanded = expandedResult === r.id
            return [
              <tr
                key={r.id}
                className="bg-white hover:bg-gray-50 cursor-pointer"
                onClick={() => setExpandedResult(isExpanded ? null : r.id)}
              >
                <td className="px-4 py-3 font-mono text-gray-700">
                  <span>{r.resource_id}</span>
                  {r.resource_status && r.resource_status !== 'Approved' && (
                    <span className={`ml-2 text-xs font-sans font-medium px-1.5 py-0.5 rounded-full ${
                      r.resource_status === 'Needs Moderation'
                        ? 'bg-amber-100 text-amber-700'
                        : r.resource_status === 'Removed'
                        ? 'bg-red-100 text-red-600'
                        : 'bg-gray-100 text-gray-500'
                    }`}>{r.resource_status}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {isMod ? (
                    <span>
                      {r.moderation_user_name || r.moderation_user_id || '—'}
                      {r.moderation_user_name && r.moderation_user_id && (
                        <span className="ml-1.5 text-xs text-gray-400 font-mono">({r.moderation_user_id})</span>
                      )}
                    </span>
                  ) : (
                    <span>
                      {r.primary_author_name || '—'}
                      {r.primary_author_id && (
                        <span className="ml-1.5 text-xs text-gray-400 font-mono">({r.primary_author_id})</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-800 font-medium">
                  {(r.criterion_grades ?? []).length === 0 ? (
                    <span className="text-gray-300">—</span>
                  ) : (
                    aiScore.toFixed(1)
                  )}
                </td>
                <td className="px-4 py-3">
                  {teacherScore !== null ? (
                    <span className="text-emerald-700 font-medium">{teacherScore.toFixed(1)}</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                {onEmail && (
                  <td className="px-4 py-3 w-32" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-col gap-1">
                      {(r.criterion_grades ?? []).length === 0 && r.status !== 'error' ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-amber-600 font-medium whitespace-nowrap">No AI grade</span>
                          {onGradeNow && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onGradeNow(r) }}
                              className="text-xs text-amber-700 underline hover:no-underline whitespace-nowrap"
                            >
                              Redo
                            </button>
                          )}
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={(e) => handleEmail(e, r)}
                            disabled={r.status !== 'complete'}
                            className="px-2.5 py-1 text-xs rounded-lg border border-indigo-300 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            Email Student
                          </button>
                          {emailError[r.id] && (
                            <span className="text-xs text-red-500 leading-tight">{emailError[r.id]}</span>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>,
              isExpanded && (
                <tr key={`${r.id}-detail`} className="bg-gray-50">
                  <td colSpan={colSpan} className="px-4 py-4">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <div className="text-xs font-semibold text-indigo-700 mb-2 uppercase tracking-wide">AI Grade</div>
                        {r.criterion_grades?.length > 0 ? (
                          <div className="space-y-3">
                            {r.criterion_grades.map((g, i) => (
                              <div key={i}>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-700 text-xs">{g.criterion_name}</span>
                                  <span className="text-indigo-700 font-semibold text-xs">{g.level_title} ({g.points_awarded} pts)</span>
                                </div>
                                {g.feedback && <div className="text-gray-500 text-xs pl-1 mt-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:list-disc [&_ul]:pl-4 [&_strong]:font-semibold" dangerouslySetInnerHTML={{ __html: renderMarkdown(g.feedback) }} />}
                              </div>
                            ))}
                          </div>
                        ) : r.status === 'error' ? (
                          <p className="text-xs text-red-500">{r.error_message || 'Grading failed.'}</p>
                        ) : (
                          <p className="text-xs text-gray-400">No criteria</p>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-emerald-700 mb-2 uppercase tracking-wide">Teacher Grade</div>
                        {r.teacher_criterion_grades?.length > 0 ? (
                          <div className="space-y-3">
                            {r.teacher_criterion_grades.map((g, i) => (
                              <div key={i}>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-700 text-xs">{g.criterion_name}</span>
                                  <span className="text-emerald-700 font-semibold text-xs">{g.level_title} ({g.points_awarded} pts)</span>
                                </div>
                                {g.feedback && <div className="text-gray-500 text-xs pl-1 mt-0.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:list-disc [&_ul]:pl-4 [&_strong]:font-semibold" dangerouslySetInnerHTML={{ __html: renderMarkdown(g.feedback) }} />}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <p className="text-xs text-gray-400 italic">Not yet graded by teacher</p>
                            {onGradeNow && (
                              <button
                                onClick={() => onGradeNow(r)}
                                className="px-2.5 py-1 text-xs rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 whitespace-nowrap"
                              >
                                Mark this submission
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ),
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Teacher grading panel — resources and moderations, one at a time
// ---------------------------------------------------------------------------

export function TeacherGradingPanel({ resourceQueue, moderationQueue, resourceRubric, moderationRubric, onSave, onRedoGrade, isRnM, startAtResultId }) {
  const [activeType, setActiveType] = useState('resource')
  const [resourceIdx, setResourceIdx] = useState(() =>
    Math.max(0, resourceQueue.findIndex((r) => !r.teacher_graded_at))
  )
  const [moderationIdx, setModerationIdx] = useState(() =>
    Math.max(0, moderationQueue.findIndex((r) => !r.teacher_graded_at))
  )
  const [selectedLevels, setSelectedLevels] = useState({})
  const [criterionFeedback, setCriterionFeedback] = useState({})
  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const [hideAi, setHideAi] = useState(() => localStorage.getItem('teacher_hide_ai_grade') === 'true')
  const [hideFeedback, setHideFeedback] = useState(() => localStorage.getItem('teacher_hide_ai_feedback') === 'true')
  const [redoOpen, setRedoOpen] = useState(false)
  const [redoAmendment, setRedoAmendment] = useState('')
  const [redoing, setRedoing] = useState(false)
  // Tracks the result ID that should open the redo panel on load (set when Fix is clicked)
  const openRedoPanelForId = useRef(null)

  function toggleHideAi() {
    setHideAi((prev) => {
      const next = !prev
      localStorage.setItem('teacher_hide_ai_grade', String(next))
      return next
    })
  }

  function toggleHideFeedback() {
    setHideFeedback((prev) => {
      const next = !prev
      localStorage.setItem('teacher_hide_ai_feedback', String(next))
      return next
    })
  }

  // When startAtResultId changes, jump to that result in the queue
  useEffect(() => {
    if (!startAtResultId) return
    const targetId = startAtResultId.id
    const resIdx = resourceQueue.findIndex((r) => r.id === targetId)
    if (resIdx >= 0) {
      const target = resourceQueue[resIdx]
      if ((target.criterion_grades ?? []).length === 0) {
        openRedoPanelForId.current = targetId
      }
      setActiveType('resource')
      setResourceIdx(resIdx)
      return
    }
    const modIdx = moderationQueue.findIndex((r) => r.id === targetId)
    if (modIdx >= 0) {
      const target = moderationQueue[modIdx]
      if ((target.criterion_grades ?? []).length === 0) {
        openRedoPanelForId.current = targetId
      }
      setActiveType('moderation')
      setModerationIdx(modIdx)
    }
  }, [startAtResultId]) // eslint-disable-line react-hooks/exhaustive-deps

  const queue = activeType === 'resource' ? resourceQueue : moderationQueue
  const currentIdx = activeType === 'resource' ? resourceIdx : moderationIdx
  const setCurrentIdx = activeType === 'resource' ? setResourceIdx : setModerationIdx
  const rubric = activeType === 'resource' ? resourceRubric : (moderationRubric ?? resourceRubric)
  const current = queue[currentIdx]

  useEffect(() => {
    if (!current) return
    let cancelled = false
    if (current.teacher_criterion_grades?.length) {
      const levels = {}
      const feedbacks = {}
      current.teacher_criterion_grades.forEach((g) => {
        levels[g.criterion_id] = g.level_id
        feedbacks[g.criterion_id] = g.feedback ?? ''
      })
      setSelectedLevels(levels)
      setCriterionFeedback(feedbacks)
    } else {
      setSelectedLevels({})
      setCriterionFeedback({})
    }
    setShowOriginal(false)
    setIsDirty(false)
    setRedoAmendment('')
    const noGrades = (current.criterion_grades ?? []).length === 0
    const isFixJump = openRedoPanelForId.current === current.id
    if (isFixJump) openRedoPanelForId.current = null
    if ((isFixJump && noGrades) || current.status === 'error') {
      // Came from Fix button, or AI errored — open redo panel so teacher can add context
      setRedoOpen(true)
    } else {
      setRedoOpen(false)
      // Auto-trigger AI grading when this result has no AI grade (normal navigation)
      if (noGrades && onRedoGrade) {
        setRedoing(true)
        onRedoGrade(current.id, null).catch(() => {}).finally(() => { if (!cancelled) setRedoing(false) })
      }
    }
    return () => { cancelled = true }
  }, [current?.id, activeType]) // eslint-disable-line react-hooks/exhaustive-deps

  const aiGradeMap = {}
  ;(current?.criterion_grades ?? []).forEach((g) => { aiGradeMap[g.criterion_id] = g })

  const gradedCount = queue.filter((r) => r.teacher_graded_at).length
  const resGraded = resourceQueue.filter((r) => r.teacher_graded_at).length
  const modGraded = moderationQueue.filter((r) => r.teacher_graded_at).length

  function buildCriterionGrades() {
    if (!rubric?.criteria) return []
    return rubric.criteria.map((criterion) => {
      const levelId = selectedLevels[criterion.id]
      const level = criterion.levels.find((l) => l.id === levelId) ?? null
      return {
        criterion_id: criterion.id,
        criterion_name: criterion.name,
        level_id: level?.id ?? '',
        level_title: level?.title ?? '',
        points_awarded: level?.points ?? 0,
        feedback: criterionFeedback[criterion.id] ?? '',
      }
    })
  }

  async function handleSave() {
    setSaving(true)
    await onSave(current.id, buildCriterionGrades())
    setSaving(false)
    const nextIdx = currentIdx + 1
    if (nextIdx < queue.length) setCurrentIdx(nextIdx)
  }

  function handleSkip() {
    if (isDirty && !window.confirm('You have unsaved changes. Skip without saving?')) return
    const nextIdx = currentIdx + 1
    if (nextIdx < queue.length) setCurrentIdx(nextIdx)
  }

  function handlePrev() {
    if (isDirty && !window.confirm('You have unsaved changes. Go back without saving?')) return
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1)
  }

  function handleNext() {
    if (isDirty && !window.confirm('You have unsaved changes. Continue without saving?')) return
    if (currentIdx + 1 < queue.length) setCurrentIdx(currentIdx + 1)
  }

  function handleSwitchType(type) {
    if (isDirty && !window.confirm('You have unsaved changes. Switch without saving?')) return
    setActiveType(type)
  }

  const isLast = currentIdx + 1 >= queue.length

  if (resourceQueue.length === 0 && moderationQueue.length === 0) {
    return <p className="text-sm text-gray-500">No graded items to mark yet.</p>
  }

  return (
    <div>
      {/* Resource / Moderation toggle */}
      {isRnM && (resourceQueue.length > 0 || moderationQueue.length > 0) && (
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => handleSwitchType('resource')}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              activeType === 'resource' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            Resources
            <span className="ml-1.5 text-xs opacity-60">{resGraded}/{resourceQueue.length}</span>
          </button>
          <button
            onClick={() => handleSwitchType('moderation')}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              activeType === 'moderation' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            Moderations
            <span className="ml-1.5 text-xs opacity-60">{modGraded}/{moderationQueue.length}</span>
          </button>
        </div>
      )}

      {!current && (
        <div className="text-center py-8">
          <p className="text-green-700 font-medium mb-1">
            All {gradedCount} {activeType === 'resource' ? 'resources' : 'moderations'} marked!
          </p>
          <p className="text-sm text-gray-500">Switch to the Grades tab to review results.</p>
        </div>
      )}

      {current && (
        <>
          <div className="flex items-center justify-between mb-4 text-sm">
            <span className="text-gray-600">
              {activeType === 'resource' ? 'Resource' : 'Moderation'}{' '}
              <span className="font-semibold">{currentIdx + 1}</span> of {queue.length}
              <span className="ml-2 text-gray-400">({gradedCount} graded)</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrev}
                disabled={currentIdx === 0}
                title="Previous"
                className="p-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={handleNext}
                disabled={currentIdx + 1 >= queue.length}
                title="Next"
                className="p-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {activeType === 'resource' ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-5">
              <div className="flex items-center gap-4 mb-3 text-sm">
                <span className="font-mono font-medium text-gray-800">{current.resource_id}</span>
                <span className="text-gray-500">
                  Author: {current.primary_author_name || '—'}
                  {current.primary_author_id && (
                    <span className="ml-1 font-mono text-gray-400">({current.primary_author_id})</span>
                  )}
                </span>
                {current.teacher_graded_at && (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Already marked</span>
                )}
              </div>
              {current.resource_sections?.length > 0 ? (
                <div className="space-y-3">
                  {current.resource_sections.map((section, i) => (
                    <div key={i} className={HTML_PROSE} dangerouslySetInnerHTML={{ __html: section }} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No content available</p>
              )}
            </div>
          ) : (
            <div className="mb-5 space-y-3">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-4 mb-3 text-sm">
                  <span className="font-mono font-medium text-gray-800">{current.resource_id}</span>
                  <span className="text-gray-500">
                    Moderator: {current.moderation_user_name || current.moderation_user_id || '—'}
                    {current.moderation_user_name && current.moderation_user_id && (
                      <span className="ml-1 font-mono text-gray-400">({current.moderation_user_id})</span>
                    )}
                  </span>
                  {current.teacher_graded_at && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Already marked</span>
                  )}
                </div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Moderation Comment</p>
                {current.moderation_comment ? (
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{current.moderation_comment}</p>
                ) : (
                  <p className="text-sm text-amber-600 italic">Moderation comment not available</p>
                )}
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowOriginal((o) => !o)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <span>Original Resource (context)</span>
                  <span className="text-gray-400 text-xs">{showOriginal ? '▲ Hide' : '▼ Show'}</span>
                </button>
                {showOriginal && (
                  <div className="p-4 border-t border-gray-200">
                    {current.resource_sections?.length > 0 ? (
                      <div className="space-y-3">
                        {current.resource_sections.map((section, i) => (
                          <div key={i} className={HTML_PROSE} dangerouslySetInnerHTML={{ __html: section }} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-amber-600 italic">Original resource content not available</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {rubric?.criteria ? (
            <div className="mb-5">
              <div className="flex items-center justify-end gap-2 mb-2">
                {/* Redo AI grade — always shown when feature is available */}
                {onRedoGrade && (
                  <button
                    onClick={() => { setRedoOpen((o) => !o); setRedoAmendment('') }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                      redoOpen
                        ? 'bg-amber-100 border-amber-300 text-amber-800'
                        : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    {redoing ? (
                      <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                      </svg>
                    )}
                    Redo AI grade
                  </button>
                )}

                {/* Hide AI feedback — disabled when grade is already hidden */}
                {(current?.criterion_grades ?? []).length > 0 && (
                  <button
                    onClick={toggleHideFeedback}
                    disabled={hideAi}
                    title={hideAi ? 'AI grade is already hidden' : undefined}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                      hideAi
                        ? 'border-gray-200 text-gray-300 cursor-not-allowed bg-white'
                        : hideFeedback
                        ? 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200'
                        : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                    </svg>
                    {hideFeedback || hideAi ? 'Feedback hidden' : 'Hide AI feedback'}
                  </button>
                )}

                {/* Hide AI grade */}
                {(current?.criterion_grades ?? []).length > 0 && (
                  <button
                    onClick={toggleHideAi}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                      hideAi
                        ? 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200'
                        : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5">
                      {hideAi
                        ? <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        : <><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>
                      }
                    </svg>
                    {hideAi ? 'AI grade hidden' : 'Hide AI grade'}
                  </button>
                )}
              </div>

              {/* Redo AI grade panel */}
              {redoOpen && (
                <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs font-medium text-amber-800 mb-1.5">What did the AI get wrong? <span className="font-normal text-amber-600">(optional — leave blank to simply retry)</span></p>
                  <textarea
                    value={redoAmendment}
                    onChange={(e) => setRedoAmendment(e.target.value)}
                    placeholder="e.g. The student clearly referenced the required theory but the AI missed it…"
                    className="w-full text-sm border border-amber-200 rounded-lg p-2 mb-2 bg-white resize-none h-16 focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        setRedoing(true)
                        try {
                          await onRedoGrade(current.id, redoAmendment)
                          setRedoOpen(false)
                          setRedoAmendment('')
                        } finally {
                          setRedoing(false)
                        }
                      }}
                      disabled={redoing}
                      className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                    >
                      {redoing ? 'Regrading…' : 'Redo AI grade'}
                    </button>
                    <button
                      onClick={() => { setRedoOpen(false); setRedoing(false) }}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

<RubricMarkingGrid
                rubric={rubric}
                selectedLevels={selectedLevels}
                onSelectLevel={(criterionId, levelId) => {
                  setSelectedLevels((prev) => ({ ...prev, [criterionId]: levelId }))
                  setIsDirty(true)
                }}
                aiGradeMap={aiGradeMap}
                criterionFeedback={criterionFeedback}
                onCriterionFeedbackChange={(criterionId, value) => {
                  setCriterionFeedback((prev) => ({ ...prev, [criterionId]: value }))
                  setIsDirty(true)
                }}
                hideAi={hideAi}
                hideFeedback={hideFeedback}
              />
            </div>
          ) : (
            <p className="text-sm text-amber-600 mb-5">No rubric defined — save the rubric in assignment settings first.</p>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || (rubric?.criteria?.length > 0 && rubric.criteria.some((c) => !selectedLevels[c.id]))}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : isLast ? 'Save & Finish' : 'Save & Next'}
            </button>
            <button
              onClick={handleSkip}
              className="px-4 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
            >
              Skip
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rubric marking grid helpers
// ---------------------------------------------------------------------------

function getLevelSignature(criterion) {
  return [...criterion.levels]
    .sort((a, b) => b.points - a.points)
    .map((l) => l.title)
    .join('||')
}

function groupCriteriaForMarking(criteria) {
  const groups = []
  const sigMap = new Map()
  for (const criterion of criteria) {
    const sig = getLevelSignature(criterion)
    if (sigMap.has(sig)) {
      groups[sigMap.get(sig)].criteria.push(criterion)
    } else {
      sigMap.set(sig, groups.length)
      groups.push({
        sig,
        headerLevels: [...criterion.levels].sort((a, b) => b.points - a.points),
        criteria: [criterion],
      })
    }
  }
  return groups
}

export function RubricMarkingGrid({ rubric, selectedLevels, onSelectLevel, aiGradeMap, criterionFeedback, onCriterionFeedbackChange, hideAi = false, hideFeedback = false }) {
  const groups = groupCriteriaForMarking(rubric.criteria)
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <MarkingGroup
          key={group.sig}
          group={group}
          selectedLevels={selectedLevels}
          onSelectLevel={onSelectLevel}
          aiGradeMap={aiGradeMap}
          criterionFeedback={criterionFeedback}
          onCriterionFeedbackChange={onCriterionFeedbackChange}
          hideAi={hideAi}
          hideFeedback={hideFeedback}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Read-only version of the marking grid — for AI preview results
// Shows the AI-selected level highlighted green and feedback as plain text.
// ---------------------------------------------------------------------------

export function ReadOnlyMarkingGrid({ rubric, criterionGrades }) {
  // Build lookup by both ID and name — the AI may return fabricated IDs if the
  // rubric markdown it received didn't include the real IDs, so name is the fallback.
  const aiGradeMap = {}
  ;(criterionGrades ?? []).forEach((g) => {
    if (g.criterion_id) aiGradeMap[g.criterion_id] = g
    if (g.criterion_name) aiGradeMap[g.criterion_name] = g
  })

  const selectedLevels = {}
  ;(criterionGrades ?? []).forEach((g) => {
    if (g.criterion_id) selectedLevels[g.criterion_id] = g.level_id
    if (g.criterion_name) selectedLevels[g.criterion_name] = g.level_id
  })

  const groups = groupCriteriaForMarking(rubric.criteria)
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <ReadOnlyMarkingGroup
          key={group.sig}
          group={group}
          selectedLevels={selectedLevels}
          aiGradeMap={aiGradeMap}
        />
      ))}
    </div>
  )
}

function ReadOnlyMarkingGroup({ group, selectedLevels, aiGradeMap }) {
  const { headerLevels, criteria } = group
  const colTemplate = `minmax(0, 1.5fr) repeat(${headerLevels.length}, minmax(0, 1fr))`

  return (
    <div className="border border-gray-200 rounded-lg">
      <div className="grid w-full" style={{ gridTemplateColumns: colTemplate }}>
        {/* Column headers */}
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-0">
          Criterion
        </div>
        {headerLevels.map((level) => (
          <div key={level.id} className="px-3 py-2 bg-gray-50 border-b border-l border-gray-200 min-w-0">
            <div className="text-xs font-semibold text-gray-800 truncate">{level.title}</div>
            <div className="text-xs text-gray-400">{level.points} pts</div>
          </div>
        ))}

        {criteria.map((criterion, rowIdx) => {
          const isLastCriterion = rowIdx === criteria.length - 1
          const sortedLevels = [...criterion.levels].sort((a, b) => b.points - a.points)
          const aiGrade = aiGradeMap?.[criterion.id] ?? aiGradeMap?.[criterion.name]
          const selectedLevelId = selectedLevels[criterion.id] ?? selectedLevels[criterion.name]
          // Show feedback row whenever the AI has graded this criterion
          const hasFeedbackRow = !!aiGrade
          const cellBorderB = !hasFeedbackRow && !isLastCriterion ? 'border-b border-gray-200' : ''

          return (
            <Fragment key={criterion.id}>
              {/* Criterion name cell */}
              <div className={`px-3 py-3 min-w-0 ${cellBorderB}`}>
                <div className="font-semibold text-xs text-gray-800 break-words">{criterion.name}</div>
                <div className="text-xs text-gray-400">{criterion.weight_percentage}%</div>
              </div>

              {/* Level cells — non-interactive */}
              {sortedLevels.map((level) => {
                // Match by ID first, fall back to title in case the AI returns a name instead of UUID
                const isSelected =
                  (selectedLevelId !== undefined && selectedLevelId !== '' && selectedLevelId === level.id) ||
                  (aiGrade && aiGrade.level_title === level.title)
                return (
                  <div
                    key={level.id}
                    className={`px-3 py-3 border-l border-gray-200 ${cellBorderB} min-w-0 ${
                      isSelected ? 'bg-emerald-100 ring-2 ring-inset ring-emerald-400' : ''
                    }`}
                  >
                    <p className="text-xs text-gray-600 leading-relaxed break-words">
                      {level.description || <span className="italic text-gray-300">—</span>}
                    </p>
                    {isSelected && (
                      <span className="text-xs font-semibold text-emerald-700 mt-1 block">✓ AI selected</span>
                    )}
                  </div>
                )
              })}

              {/* Feedback row — plain text, no textarea */}
              {hasFeedbackRow && (
                <div
                  style={{ gridColumn: '1 / -1' }}
                  className={`px-5 py-3 bg-emerald-50 border-t border-emerald-200 ${!isLastCriterion ? 'border-b border-gray-200' : ''}`}
                >
                  <p className="text-xs font-semibold text-emerald-700 mb-1">
                    AI reasoning — {criterion.name}
                  </p>
                  {aiGrade?.feedback ? (
                    <div className="text-sm text-gray-700 leading-relaxed [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_strong]:font-semibold" dangerouslySetInnerHTML={{ __html: renderMarkdown(aiGrade.feedback) }} />
                  ) : (
                    <p className="text-xs text-gray-400 italic">No feedback provided.</p>
                  )}
                </div>
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

function MarkingGroup({ group, selectedLevels, onSelectLevel, aiGradeMap, criterionFeedback, onCriterionFeedbackChange, hideAi = false, hideFeedback = false }) {
  const { headerLevels, criteria } = group
  const colTemplate = `minmax(0, 1.5fr) repeat(${headerLevels.length}, minmax(0, 1fr))`

  return (
    <div className="border border-gray-200 rounded-lg">
      <div className="grid w-full" style={{ gridTemplateColumns: colTemplate }}>
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-0">
          Criterion
        </div>
        {headerLevels.map((level) => (
          <div key={level.id} className="px-3 py-2 bg-gray-50 border-b border-l border-gray-200 min-w-0">
            <div className="text-xs font-semibold text-gray-800 truncate">{level.title}</div>
            <div className="text-xs text-gray-400">{level.points} pts</div>
          </div>
        ))}

        {criteria.map((criterion, rowIdx) => {
          const isLastCriterion = rowIdx === criteria.length - 1
          const sortedLevels = [...criterion.levels].sort((a, b) => b.points - a.points)
          const aiGrade = aiGradeMap?.[criterion.id]
          const selectedLevelId = selectedLevels[criterion.id]
          const hasAiFeedbackRow = !hideAi && !hideFeedback && !!aiGrade?.feedback
          const hasTeacherFeedbackRow = selectedLevelId !== undefined
          const cellBorderB = !hasAiFeedbackRow && !hasTeacherFeedbackRow && !isLastCriterion ? 'border-b border-gray-200' : ''

          return (
            <Fragment key={criterion.id}>
              <div className={`px-3 py-3 min-w-0 ${cellBorderB}`}>
                <div className="font-semibold text-xs text-gray-800 break-words">{criterion.name}</div>
                <div className="text-xs text-gray-400">{criterion.weight_percentage}%</div>
              </div>

              {sortedLevels.map((level) => {
                const isSelected = selectedLevelId === level.id
                const isAiPick = !hideAi && (aiGrade?.level_id === level.id || (aiGrade?.level_title && aiGrade.level_title === level.title))
                return (
                  <div
                    key={level.id}
                    onClick={() => onSelectLevel(criterion.id, level.id)}
                    className={`px-3 py-3 border-l border-gray-200 ${cellBorderB} cursor-pointer select-none transition-colors min-w-0 ${
                      isSelected
                        ? 'bg-emerald-100 ring-2 ring-inset ring-emerald-400'
                        : isAiPick
                        ? 'bg-indigo-50 hover:bg-emerald-50'
                        : 'hover:bg-emerald-50'
                    }`}
                  >
                    <p className="text-xs text-gray-600 leading-relaxed break-words">
                      {level.description || <span className="italic text-gray-300">—</span>}
                    </p>
                    {isSelected && (
                      <span className="text-xs font-semibold text-emerald-700 mt-1 block">✓ Selected</span>
                    )}
                  </div>
                )
              })}

              {/* Teacher feedback textarea — shown when a level is selected */}
              {hasTeacherFeedbackRow && (
                <div
                  style={{ gridColumn: '1 / -1' }}
                  className={`px-5 py-3 bg-emerald-50 border-t border-emerald-200 ${!hasAiFeedbackRow && !isLastCriterion ? 'border-b border-gray-200' : ''}`}
                >
                  <label className="block text-xs font-semibold text-emerald-700 mb-1.5">
                    Your feedback — {criterion.name}
                  </label>
                  <textarea
                    value={criterionFeedback?.[criterion.id] ?? ''}
                    onChange={(e) => onCriterionFeedbackChange?.(criterion.id, e.target.value)}
                    placeholder={`Add specific feedback for this criterion…`}
                    rows={2}
                    className="w-full border border-emerald-300 rounded-lg p-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
                  />
                </div>
              )}

              {/* AI reasoning — shown below teacher feedback when not hidden */}
              {hasAiFeedbackRow && (
                <div
                  style={{ gridColumn: '1 / -1' }}
                  className={`px-5 py-3 bg-indigo-50 border-t border-indigo-100 ${!isLastCriterion ? 'border-b border-gray-200' : ''}`}
                >
                  <p className="text-xs font-semibold text-indigo-700 mb-1.5">
                    AI reasoning — {criterion.name}
                  </p>
                  <div
                    className="text-sm text-indigo-900 leading-relaxed [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_strong]:font-semibold"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(aiGrade.feedback) }}
                  />
                </div>
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
