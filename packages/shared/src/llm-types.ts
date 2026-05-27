import { z } from 'zod';

// Entity types we ask the LLM to recognize. Kept short for OpenAI strict
// mode (enums must fit a closed set) and to give the model unambiguous
// targets — fewer types means more consistent tagging.
export const EntityTypeSchema = z.enum(['person', 'company', 'product', 'technology', 'location']);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const EntitySchema = z.object({
  name: z.string().min(1).max(200),
  type: EntityTypeSchema,
});
export type Entity = z.infer<typeof EntitySchema>;

// Axis assignment expressed as an array of {axis, value} pairs rather than
// z.record. OpenAI strict-mode JSON schema does not allow open-ended object
// maps (every property must be enumerated in the schema), so a flat array
// keeps the schema closed while letting the worker reconcile against the
// per-user axes config downstream.
export const AxisAssignmentSchema = z.object({
  axis: z.string().min(1).max(100),
  value: z.string().min(1).max(100).nullable(),
});
export type AxisAssignment = z.infer<typeof AxisAssignmentSchema>;

export const ImportanceSchema = z.enum(['high', 'normal', 'junk']);
export type Importance = z.infer<typeof ImportanceSchema>;

export const ArticleAnalysisSchema = z.object({
  summary: z.string().min(1).max(2000),
  entities: z.array(EntitySchema).max(50),
  importance: ImportanceSchema,
  // Free-form category names the LLM thinks fit. The article-process worker
  // reconciles them against the user's actual category list in a later step.
  categoryHints: z.array(z.string().min(1).max(100)).max(20),
  // One entry per axis the user has — even if value is null (LLM had no
  // good pick). The worker validates each value against the axis config.
  axisAssignments: z.array(AxisAssignmentSchema).max(20),
});
export type ArticleAnalysis = z.infer<typeof ArticleAnalysisSchema>;

// Stubs for the other two operations. They exist in the type system so
// callers can refer to them, but adapters throw NotImplementedException
// until the corresponding steps land.
export const EntityMatchInputSchema = z.object({}).passthrough();
export type EntityMatchInput = z.infer<typeof EntityMatchInputSchema>;
export const EntityMatchResultSchema = z.object({
  matches: z.array(z.unknown()),
});
export type EntityMatchResult = z.infer<typeof EntityMatchResultSchema>;

export const DigestInputSchema = z.object({}).passthrough();
export type DigestInput = z.infer<typeof DigestInputSchema>;
export const DigestResultSchema = z.object({ summary: z.string() });
export type DigestResult = z.infer<typeof DigestResultSchema>;
