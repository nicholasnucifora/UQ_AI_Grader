/**
 * Deterministic Markdown formatter matching the backend Python output.
 * Criteria sorted by name (a→z), levels sorted by points (high→low).
 * Use this output as a static prefix in AI grading prompts (prompt caching).
 */
export function formatRubricToMarkdown(rubric) {
  const lines = [`# ${rubric.title}`, '', '## Criteria', '']
  const sortedCriteria = [...rubric.criteria].sort((a, b) => a.name.localeCompare(b.name))
  for (const criterion of sortedCriteria) {
    lines.push(`### ${criterion.name} (${criterion.weight_percentage}%)`)
    lines.push('| Level | Points | Description |')
    lines.push('|-------|--------|-------------|')
    const sortedLevels = [...criterion.levels].sort((a, b) => b.points - a.points)
    for (const level of sortedLevels) {
      lines.push(`| ${level.title} | ${level.points} | ${level.description} |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}
