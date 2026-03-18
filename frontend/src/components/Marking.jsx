import { Fragment, useEffect, useState } from 'react'

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
                  {isMod ? (r.moderation_user_id || '—') : (
                    <span>
                      {r.primary_author_name || '—'}
                      {r.primary_author_id && (
                        <span className="ml-1.5 text-xs text-gray-400 font-mono">({r.primary_author_id})</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-800 font-medium">
                  {r.status === 'error' ? (
                    <span className="text-red-500">Error</span>
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

export function TeacherGradingPanel({ resourceQueue, moderationQueue, resourceRubric, moderationRubric, onSave, isRnM, startAtResultId }) {
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
  const [showOriginal, setShowOriginal] = useState(false)
  const [lastJumpedId, setLastJumpedId] = useState(null)

  // When startAtResultId changes, jump to that result in the queue
  useEffect(() => {
    if (!startAtResultId || startAtResultId === lastJumpedId) return
    setLastJumpedId(startAtResultId)
    const resIdx = resourceQueue.findIndex((r) => r.id === startAtResultId)
    if (resIdx >= 0) {
      setActiveType('resource')
      setResourceIdx(resIdx)
      return
    }
    const modIdx = moderationQueue.findIndex((r) => r.id === startAtResultId)
    if (modIdx >= 0) {
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
  }, [current?.id, activeType])

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
    const nextIdx = currentIdx + 1
    if (nextIdx < queue.length) setCurrentIdx(nextIdx)
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
            onClick={() => setActiveType('resource')}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              activeType === 'resource' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            Resources
            <span className="ml-1.5 text-xs opacity-60">{resGraded}/{resourceQueue.length}</span>
          </button>
          <button
            onClick={() => setActiveType('moderation')}
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
          <p className="text-sm text-gray-500">Switch to the AI Grading tab to review results.</p>
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
                  <span className="text-gray-500">Moderator: {current.moderation_user_id || '—'}</span>
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
              <RubricMarkingGrid
                rubric={rubric}
                selectedLevels={selectedLevels}
                onSelectLevel={(criterionId, levelId) =>
                  setSelectedLevels((prev) => ({ ...prev, [criterionId]: levelId }))
                }
                aiGradeMap={aiGradeMap}
                criterionFeedback={criterionFeedback}
                onCriterionFeedbackChange={(criterionId, value) =>
                  setCriterionFeedback((prev) => ({ ...prev, [criterionId]: value }))
                }
              />
            </div>
          ) : (
            <p className="text-sm text-amber-600 mb-5">No rubric defined — save the rubric in assignment settings first.</p>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
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

export function RubricMarkingGrid({ rubric, selectedLevels, onSelectLevel, aiGradeMap, criterionFeedback, onCriterionFeedbackChange }) {
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

function MarkingGroup({ group, selectedLevels, onSelectLevel, aiGradeMap, criterionFeedback, onCriterionFeedbackChange }) {
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
          const hasFeedbackRow = selectedLevelId !== undefined
          const cellBorderB = !hasFeedbackRow && !isLastCriterion ? 'border-b border-gray-200' : ''

          return (
            <Fragment key={criterion.id}>
              <div className={`px-3 py-3 min-w-0 ${cellBorderB}`}>
                <div className="font-semibold text-xs text-gray-800 break-words">{criterion.name}</div>
                <div className="text-xs text-gray-400">{criterion.weight_percentage}%</div>
                {aiGrade && (
                  <span className="inline-block mt-1 text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded leading-tight">
                    AI: {aiGrade.level_title}
                  </span>
                )}
              </div>

              {sortedLevels.map((level) => {
                const isSelected = selectedLevelId === level.id
                const isAiPick = aiGrade?.level_id === level.id || (aiGrade?.level_title && aiGrade.level_title === level.title)
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

              {hasFeedbackRow && (
                <div
                  style={{ gridColumn: '1 / -1' }}
                  className={`px-5 py-3 bg-emerald-50 border-t border-emerald-200 ${!isLastCriterion ? 'border-b border-gray-200' : ''}`}
                >
                  <label className="block text-xs font-semibold text-emerald-700 mb-1.5">
                    Feedback for {criterion.name}
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
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
