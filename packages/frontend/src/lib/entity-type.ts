import type { EntityType } from './entities';

/**
 * Single source of truth for entity-type presentation. Previously the
 * `TYPE_LABEL` map was copy-pasted into EntityRow, EntityDetailSidebar and
 * EntityDetailPage; the badge color classes were a separate (graph-only)
 * palette in EntityNode. Consolidated here so the list view, the sidebar and
 * the graph all agree on label text and on which hue means which type.
 */
export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  person: 'Person',
  company: 'Company',
  product: 'Product',
  technology: 'Technology',
  location: 'Location',
};

// Stable display order for grouped views (e.g. the article-detail sidebar).
// Companies and people lead because they're the most common; locations trail.
export const ENTITY_TYPE_ORDER: readonly EntityType[] = [
  'company',
  'person',
  'product',
  'technology',
  'location',
];

/**
 * Per-type tint for outline badges — text + border only, no fill, so a row
 * full of badges stays calm. Hues match the graph's EntityNode.TYPE_COLORS
 * (company=blue, product=purple, person=green, technology=orange,
 * location=rose) so the two surfaces read as the same colour language.
 */
export const ENTITY_TYPE_BADGE_CLASS: Record<EntityType, string> = {
  company: 'border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300',
  product: 'border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300',
  person: 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-300',
  technology: 'border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300',
  location: 'border-rose-300 text-rose-700 dark:border-rose-700 dark:text-rose-300',
};
