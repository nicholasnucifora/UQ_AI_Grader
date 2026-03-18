import { z } from 'zod'

export const RubricLevelSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  points: z.number().min(0),
  description: z.string(),
})

export const RubricCriterionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  weight_percentage: z.number().min(0).max(100),
  levels: z.array(RubricLevelSchema).min(1),
})

export const RubricSchemaZ = z.object({
  title: z.string().min(1),
  criteria: z.array(RubricCriterionSchema).min(1),
})

/**
 * Validate a rubric object.
 * Returns { errors: ZodIssue[], warnings: string[] }
 */
export function validateRubric(rubric) {
  const result = RubricSchemaZ.safeParse(rubric)
  const warnings = []

  if (result.success) {
    const totalWeight = rubric.criteria.reduce((s, c) => s + (c.weight_percentage || 0), 0)
    if (Math.abs(totalWeight - 100) > 0.01) {
      warnings.push(`Weights sum to ${totalWeight.toFixed(1)}%, must equal 100%`)
    }

    rubric.criteria.forEach((c) => {
      const points = c.levels.map((l) => l.points)
      const sorted = [...points].sort((a, b) => b - a)
      if (JSON.stringify(points) !== JSON.stringify(sorted)) {
        warnings.push(`Criterion "${c.name}": levels should be in descending point order`)
      }
    })
  }

  return { errors: result.error?.issues ?? [], warnings }
}
