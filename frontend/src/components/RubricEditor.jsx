import { useMemo, useState, useEffect, useRef, Fragment } from 'react'
import { validateRubric } from '../utils/rubricSchema'

// ---------------------------------------------------------------------------
// Inline editable field helpers
// ---------------------------------------------------------------------------

function InlineText({ value, onChange, readOnly, className = '', placeholder = '' }) {
  if (readOnly) return <span className={className}>{value}</span>
  return (
    <input
      className={`border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none bg-transparent ${className}`}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function InlineNumber({ value, onChange, readOnly, className = '' }) {
  if (readOnly) return <span className={className}>{value}</span>
  return (
    <input
      type="number"
      className={`w-16 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none bg-transparent ${className}`}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    />
  )
}

function InlineTextarea({ value, onChange, readOnly, className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = ref.current.scrollHeight + 'px'
    }
  }, [value])

  if (readOnly) {
    return (
      <p className={`text-sm text-gray-600 leading-relaxed ${className}`}>
        {value || <span className="italic text-gray-300">—</span>}
      </p>
    )
  }
  return (
    <textarea
      ref={ref}
      rows={1}
      className={`w-full bg-transparent text-sm text-gray-700 focus:outline-none resize-none placeholder-gray-300 overflow-hidden ${className}`}
      value={value}
      placeholder="Describe this level…"
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

// ---------------------------------------------------------------------------
// Group criteria by their sorted level-title signature
// ---------------------------------------------------------------------------

function getLevelSignature(criterion) {
  return [...criterion.levels]
    .sort((a, b) => b.points - a.points)
    .map((l) => l.title)
    .join('||')
}

function groupCriteria(criteria) {
  const groups = []
  const sigMap = new Map()
  for (const criterion of criteria) {
    const sig = getLevelSignature(criterion)
    if (sigMap.has(sig)) {
      groups[sigMap.get(sig)].criteria.push(criterion)
    } else {
      sigMap.set(sig, groups.length)
      const headerLevels = [...criterion.levels].sort((a, b) => b.points - a.points)
      groups.push({ sig, headerLevels, criteria: [criterion] })
    }
  }
  return groups
}

// Dashed divider — used as inline borderLeft / borderTop so only one side is dashed
const DASHED = '1px dashed #d1d5db'

// ---------------------------------------------------------------------------
// RubricGroup — one CSS grid per set of criteria sharing the same level columns
// ---------------------------------------------------------------------------

function RubricGroup({ group, onUpdate, onDelete, readOnly, onAddRow, onAddColumn, onAddBoth, onDeleteColumn, onUpdateLevelHeader }) {
  const { headerLevels, criteria } = group
  const [hoveredId, setHoveredId] = useState(null)
  const [hoveredLevelTitle, setHoveredLevelTitle] = useState(null)
  const [hintOpen, setHintOpen] = useState(() => new Set())
  const footerRef = useRef(null)

  function toggleHint(criterionId) {
    setHintOpen((prev) => {
      const next = new Set(prev)
      if (next.has(criterionId)) {
        next.delete(criterionId)
      } else {
        next.add(criterionId)
      }
      return next
    })
  }

  function keepFooterVisible(action) {
    action()
    requestAnimationFrame(() => {
      footerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }

  function updateDescription(criterion, levelId, val) {
    onUpdate({
      ...criterion,
      levels: criterion.levels.map((l) =>
        l.id === levelId ? { ...l, description: val } : l
      ),
    })
  }

  const colTemplate = `minmax(140px, 200px) repeat(${headerLevels.length}, 1fr)`

  // The inner data grid — no + column, no footer row
  const tableGrid = (
    <div className="grid min-w-0" style={{ gridTemplateColumns: colTemplate }}>
      {/* Header row */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Criterion
      </div>
      {headerLevels.map((level, colIdx) => (
        <div
          key={level.id}
          className="relative px-4 py-2 bg-gray-50 border-b border-l border-gray-200"
          onMouseEnter={() => setHoveredLevelTitle(level.title + colIdx)}
          onMouseLeave={() => setHoveredLevelTitle(null)}
        >
          <InlineText
            value={level.title}
            onChange={(v) => onUpdateLevelHeader(colIdx, { title: v })}
            readOnly={readOnly}
            className="text-sm font-semibold text-gray-800 w-full"
            placeholder="Level name"
          />
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <InlineNumber
              value={level.points}
              onChange={(v) => onUpdateLevelHeader(colIdx, { points: v })}
              readOnly={readOnly}
              className="text-xs"
            />
            <span>pts</span>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => onDeleteColumn(colIdx)}
              className={`absolute top-2 right-2 text-gray-400 hover:text-red-500 text-xs transition-opacity ${hoveredLevelTitle === level.title + colIdx ? 'opacity-100' : 'opacity-0'}`}
              title="Remove column"
            >
              ✕
            </button>
          )}
        </div>
      ))}

      {/* Criterion rows */}
      {criteria.map((criterion, rowIdx) => {
        const isHovered = hoveredId === criterion.id
        const isLast = rowIdx === criteria.length - 1
        const sortedLevels = [...criterion.levels].sort((a, b) => b.points - a.points)
        const hasHint = !!criterion.ai_hint?.trim()
        const hintVisible = hintOpen.has(criterion.id) || hasHint
        const borderB = isLast && !hintVisible ? '' : 'border-b border-gray-200'
        const rowBg = isHovered ? 'bg-blue-50' : ''

        return (
          <Fragment key={criterion.id}>
            <div
              className={`relative px-4 py-3 flex flex-col gap-1 ${borderB} ${rowBg} transition-colors`}
              onMouseEnter={() => setHoveredId(criterion.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <InlineText
                value={criterion.name}
                onChange={(v) => onUpdate({ ...criterion, name: v })}
                readOnly={readOnly}
                className="font-semibold text-sm text-gray-800 w-full"
                placeholder="Criterion name"
              />
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <InlineNumber
                  value={criterion.weight_percentage}
                  onChange={(v) => onUpdate({ ...criterion, weight_percentage: v })}
                  readOnly={readOnly}
                  className="text-xs"
                />
                <span>%</span>
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => {
                    if (hintVisible && !hasHint) {
                      toggleHint(criterion.id)
                    } else if (hintVisible && hasHint) {
                      onUpdate({ ...criterion, ai_hint: '' })
                      setHintOpen((prev) => { const n = new Set(prev); n.delete(criterion.id); return n })
                    } else {
                      toggleHint(criterion.id)
                    }
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-600 mt-0.5 text-left"
                  title={hintVisible ? 'Remove AI hint' : 'Add AI hint'}
                >
                  {hintVisible ? 'AI hint ✕' : '+ AI hint'}
                </button>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onDelete(criterion.id)}
                  className={`absolute top-2 right-2 text-gray-400 hover:text-red-500 text-xs transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}
                  title="Remove criterion"
                >
                  ✕
                </button>
              )}
            </div>

            {sortedLevels.map((level) => (
              <div
                key={level.id}
                className={`px-4 py-3 border-l border-gray-200 ${borderB} ${rowBg} transition-colors`}
                onMouseEnter={() => setHoveredId(criterion.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <InlineTextarea
                  value={level.description}
                  onChange={(v) => updateDescription(criterion, level.id, v)}
                  readOnly={readOnly}
                />
              </div>
            ))}

            {/* Full-width AI hint row */}
            {hintVisible && (
              <div
                style={{ gridColumn: '1 / -1' }}
                className="px-4 py-2 bg-indigo-50 border-b border-indigo-100"
              >
                <p className="text-xs font-medium text-indigo-500 mb-1">AI grading hint <span className="font-normal text-indigo-400">(hidden from students)</span></p>
                {readOnly
                  ? <p className="text-sm text-gray-600">{criterion.ai_hint}</p>
                  : <textarea
                      className="w-full text-sm text-gray-700 bg-transparent focus:outline-none resize-none placeholder-gray-300"
                      rows={2}
                      placeholder="e.g. Make sure to check whether the student referenced X…"
                      value={criterion.ai_hint ?? ''}
                      onChange={(e) => onUpdate({ ...criterion, ai_hint: e.target.value })}
                    />
                }
              </div>
            )}
          </Fragment>
        )
      })}
    </div>
  )

  // Read-only: just the grid in a simple border box
  if (readOnly) {
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {tableGrid}
      </div>
    )
  }

  // Editable: outer border box contains a 2×2 flex layout
  //
  //  ┌─────────────────────────────┬╌╌╌╌╌╌╌┐
  //  │         table grid          ┆   +   │  ← col + button (no inner row lines)
  //  ├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┼╌╌╌╌╌╌╌┤
  //  │              +              ┆  ++   │  ← row + and ++ corner
  //  └─────────────────────────────┴───────┘
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Top section: table + column + button side-by-side */}
      <div className="flex">
        <div className="flex-1 min-w-0">
          {tableGrid}
        </div>
        {/* Column + button — full table height, no inner row borders */}
        <button
          type="button"
          onClick={onAddColumn}
          title="Add column"
          style={{ borderLeft: DASHED }}
          className="w-10 text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors text-sm font-medium"
        >
          +
        </button>
      </div>

      {/* Bottom section: row + button + ++ corner */}
      <div ref={footerRef} className="flex" style={{ borderTop: DASHED }}>
        <button
          type="button"
          onClick={() => keepFooterVisible(onAddRow)}
          title="Add row"
          className="flex-1 py-1.5 text-sm text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => keepFooterVisible(onAddBoth)}
          title="Add row and column"
          style={{ borderLeft: DASHED }}
          className="w-10 py-1.5 text-xs font-semibold text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
        >
          ++
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RubricEditor
// ---------------------------------------------------------------------------

export default function RubricEditor({ rubric, onChange, readOnly = false, onDelete }) {
  const { warnings } = useMemo(
    () => (rubric ? validateRubric(rubric) : { errors: [], warnings: [] }),
    [rubric]
  )

  const groups = useMemo(() => groupCriteria(rubric?.criteria ?? []), [rubric])

  if (!rubric) return null

  function updateCriterion(updated) {
    onChange({
      ...rubric,
      criteria: rubric.criteria.map((c) => (c.id === updated.id ? updated : c)),
    })
  }

  function deleteCriterion(criterionId) {
    onChange({ ...rubric, criteria: rubric.criteria.filter((c) => c.id !== criterionId) })
  }

  function addCriterionToGroup(group) {
    const newCriterion = {
      id: crypto.randomUUID(),
      name: 'New Criterion',
      weight_percentage: 0,
      levels: group.headerLevels.map((l) => ({
        id: crypto.randomUUID(),
        title: l.title,
        points: l.points,
        description: '',
      })),
    }
    onChange({ ...rubric, criteria: [...rubric.criteria, newCriterion] })
  }

  function addColumnToGroup(group) {
    const criteriaIds = new Set(group.criteria.map((c) => c.id))
    onChange({
      ...rubric,
      criteria: rubric.criteria.map((c) => {
        if (!criteriaIds.has(c.id)) return c
        return {
          ...c,
          levels: [
            ...c.levels,
            { id: crypto.randomUUID(), title: 'New Level', points: 0, description: '' },
          ],
        }
      }),
    })
  }

  function deleteColumnFromGroup(group, colIdx) {
    const criteriaIds = new Set(group.criteria.map((c) => c.id))
    onChange({
      ...rubric,
      criteria: rubric.criteria.map((c) => {
        if (!criteriaIds.has(c.id)) return c
        // Sort the same way as headerLevels to find the level at this column index
        const sorted = [...c.levels].sort((a, b) => b.points - a.points)
        const levelToRemove = sorted[colIdx]
        return { ...c, levels: c.levels.filter((l) => l.id !== levelToRemove.id) }
      }),
    })
  }

  function updateLevelInGroup(group, colIdx, updates) {
    const criteriaIds = new Set(group.criteria.map((c) => c.id))
    onChange({
      ...rubric,
      criteria: rubric.criteria.map((c) => {
        if (!criteriaIds.has(c.id)) return c
        const sorted = [...c.levels].sort((a, b) => b.points - a.points)
        const levelToUpdate = sorted[colIdx]
        return {
          ...c,
          levels: c.levels.map((l) => l.id === levelToUpdate.id ? { ...l, ...updates } : l),
        }
      }),
    })
  }

  // Atomic: adds a new row AND a new column in one onChange call so neither overwrites the other
  function addBothToGroup(group) {
    const criteriaIds = new Set(group.criteria.map((c) => c.id))
    const newLevelStub = () => ({ id: crypto.randomUUID(), title: 'New Level', points: 0, description: '' })

    // Add the extra level to all existing criteria in this group
    const updatedCriteria = rubric.criteria.map((c) => {
      if (!criteriaIds.has(c.id)) return c
      return { ...c, levels: [...c.levels, newLevelStub()] }
    })

    // New criterion matches the group's current levels PLUS the new level
    const newCriterion = {
      id: crypto.randomUUID(),
      name: 'New Criterion',
      weight_percentage: 0,
      levels: [
        ...group.headerLevels.map((l) => ({
          id: crypto.randomUUID(),
          title: l.title,
          points: l.points,
          description: '',
        })),
        newLevelStub(),
      ],
    }

    onChange({ ...rubric, criteria: [...updatedCriteria, newCriterion] })
  }

  return (
    <div className="space-y-3">
      {/* Rubric title */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Rubric title</span>
        <InlineText
          value={rubric.title}
          onChange={(v) => onChange({ ...rubric, title: v })}
          readOnly={readOnly}
          className="text-lg font-bold text-gray-800"
          placeholder="Rubric title"
        />
        {!readOnly && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto text-xs text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-2 py-0.5 rounded transition-colors"
          >
            Delete Rubric
          </button>
        )}
      </div>

      {/* Validation warnings */}
      {warnings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {warnings.map((w, i) => (
            <span key={i} className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-full">
              ⚠ {w}
            </span>
          ))}
        </div>
      )}

      {/* One group per unique level-column set */}
      <div className="space-y-5">
        {groups.map((group) => (
          <RubricGroup
            key={group.sig}
            group={group}
            onUpdate={updateCriterion}
            onDelete={deleteCriterion}
            readOnly={readOnly}
            onAddRow={() => addCriterionToGroup(group)}
            onAddColumn={() => addColumnToGroup(group)}
            onAddBoth={() => addBothToGroup(group)}
            onDeleteColumn={(title) => deleteColumnFromGroup(group, title)}
            onUpdateLevelHeader={(colIdx, updates) => updateLevelInGroup(group, colIdx, updates)}
          />
        ))}
      </div>
    </div>
  )
}
