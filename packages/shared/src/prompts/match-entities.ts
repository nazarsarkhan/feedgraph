import type { MatchEntitiesInput } from '../llm-types';

/**
 * Builds the matchEntities prompt. Like all prompts in @feedgraph/shared,
 * this is business logic (the wording of what we ask the model). The
 * adapter is pure transport — it sends the prompt and the schema, nothing
 * else. EntityDedupService validates every returned id against the
 * caller's user_id set and filters by the confidence threshold (0.8)
 * before any DB write, so the prompt does NOT need to be paranoid — its
 * job is to get the LLM to identify obvious duplicates.
 */
export function buildMatchEntitiesPrompt(input: MatchEntitiesInput): string {
  return `You are a named-entity resolution system. Given a list of entities
extracted from news articles, identify groups that refer to the same
real-world thing and should be merged.

RULES
- Only merge entities of the SAME type. Never merge across types (a
  company named "Apple" and a product named "Apple" are different).
- Only merge when you are highly confident (> 0.8) the entities are the
  same real-world thing.
- Common merge patterns:
  * Unicode variation: "GPT-4o" and "GPT‑4o" (different dash character).
  * Spacing variation: "OpenAI" and "Open AI".
  * Legal-suffix variation: "Microsoft" and "Microsoft Corp.",
    "Anthropic" and "Anthropic PBC".
  * Acronym ↔ full name: "US" and "United States" (when both are type=location).
- Never merge entities that are genuinely different things, even if the
  names are similar (e.g. "GPT-3" and "GPT-4" — separate model versions).
- The canonicalId field MUST be one of the input entity ids. Prefer the
  one with the most descriptive canonical name.
- duplicateIds MUST NOT contain canonicalId.
- aliases MUST include every distinct surface form across the group
  (including the canonical entity's existing aliases passed in).
- Return mergeGroups: [] when nothing in the list should be merged. Do
  not invent merges to fill output.

ENTITIES TO ANALYZE
${JSON.stringify(input.entities, null, 2)}

OUTPUT FORMAT
Respond with ONE JSON object that matches the provided schema exactly.
No markdown, no code fences, no commentary.`;
}
