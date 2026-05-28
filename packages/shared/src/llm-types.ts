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

// matchEntities — fuzzy entity deduplication. Input: list of entity rows
// for one user. Output: groups of ids that refer to the same real-world
// thing and should be merged into one canonical row. The service applies
// a minimum confidence threshold (0.8) before any DB write, and validates
// every id against the caller's user_id — see EntityDedupService.
export const MatchEntitiesEntitySchema = z.object({
  id: z.string().min(1),
  canonicalName: z.string().min(1).max(200),
  type: EntityTypeSchema,
  aliases: z.array(z.string()).max(50),
});
export type MatchEntitiesEntity = z.infer<typeof MatchEntitiesEntitySchema>;

export interface MatchEntitiesInput {
  entities: MatchEntitiesEntity[];
}

export const MatchEntitiesGroupSchema = z.object({
  // The id of the entity to keep — must be one of the input ids.
  canonicalId: z.string().min(1),
  // Other ids to merge INTO canonicalId. Their rows will be deleted; their
  // article_entities links will be re-pointed to canonicalId. Validated
  // against the caller's user_id set before any DB write.
  duplicateIds: z.array(z.string().min(1)).min(1).max(50),
  // All known surface forms including the canonical name. Written to
  // the canonical entity's aliases JSONB column verbatim.
  aliases: z.array(z.string().min(1).max(200)).max(100),
  // LLM's self-reported certainty that every member of this group is the
  // same real-world thing. The service drops groups under 0.8.
  confidence: z.number().min(0).max(1),
});
export type MatchEntitiesGroup = z.infer<typeof MatchEntitiesGroupSchema>;

export const MatchEntitiesOutputSchema = z.object({
  mergeGroups: z.array(MatchEntitiesGroupSchema).max(200),
});
export type MatchEntitiesOutput = z.infer<typeof MatchEntitiesOutputSchema>;

// buildDigest — period-scoped LLM summary. Receives article titles +
// summaries (NOT raw content — see ADR) for a calendar period and
// produces a structured digest. Sentiment is constrained to a closed
// enum so OpenAI strict mode can emit a tight JSON Schema.
export const DigestPeriodTypeSchema = z.enum(['day', 'week', 'month']);
export type DigestPeriodType = z.infer<typeof DigestPeriodTypeSchema>;

export const DigestSentimentSchema = z.enum(['positive', 'negative', 'neutral', 'mixed']);
export type DigestSentiment = z.infer<typeof DigestSentimentSchema>;

export const BuildDigestOutputSchema = z.object({
  executiveSummary: z.string().min(1).max(1000),
  keyThemes: z.array(z.string().min(1).max(120)).min(1).max(8),
  sentiment: DigestSentimentSchema,
  topEntityNames: z.array(z.string().min(1).max(200)).max(10),
});
export type BuildDigestOutput = z.infer<typeof BuildDigestOutputSchema>;
