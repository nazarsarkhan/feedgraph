import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Generic URL-as-source-of-truth filter hook.
 *
 * Extracted on the third occurrence (Articles, Entities, Graph) after the
 * pattern was used three times with identical structure — see the
 * `useUrlListFilters` ADR in PLAN.md. Every list page on the site that
 * binds filter state to the URL goes through this hook.
 *
 * Pattern: the URL is the single source of truth. `filters` is a derived
 * snapshot of the URL; `setFilter` / `setFilters` write back via
 * `setSearchParams({ replace: true })` so the browser history isn't
 * flooded with every keystroke or dropdown click — bookmarking and
 * sharing still work because the current state is always reflected.
 *
 * Page reset: any non-`page` filter change drops the `page` param. This
 * is the standard list-UX expectation (changing a filter takes you back
 * to the first page) and lives in the generic so individual hooks
 * don't repeat the logic. Hooks whose filter set has no `page` (e.g.
 * `useGraphFilters`) are unaffected — the `next.delete('page')` is a
 * no-op when `page` isn't in the URL.
 */

// What we can round-trip through URL params. Booleans serialize via
// `String(v)` to 'true' / 'false' — callers that parse them back are
// responsible for the inverse (e.g. `params.get('foo') === 'true'`).
export type FilterValue = string | number | boolean | undefined;

// The TFilters constraint is `extends object` rather than
// `Record<string, FilterValue>` because TypeScript interfaces don't
// have an implicit index signature — a perfectly valid filter type
// like `interface ArticleFilters { status?: string; ... }` fails the
// stricter `Record<string, ...>` check even when every field is a
// FilterValue. The looser `extends object` constraint works for both
// interfaces and inline types; the `parse` function still gives full
// compile-time type safety on the way out (TFilters is concrete at
// the call site, e.g. `useUrlFilters<ArticleFilters>`).
export interface UseUrlFiltersOptions<TFilters extends object> {
  /** Parse raw URLSearchParams into the typed filter object. */
  parse: (params: URLSearchParams) => TFilters;
  /** Count how many filters are "active" (non-default) for the UI badge. */
  countActive: (filters: TFilters) => number;
}

export interface UseUrlFiltersReturn<TFilters extends object> {
  filters: TFilters;
  setFilter: <K extends keyof TFilters>(key: K, value: TFilters[K]) => void;
  setFilters: (changes: Partial<TFilters>) => void;
  reset: () => void;
  activeFilterCount: number;
}

/**
 * IMPORTANT: callers MUST memoize the `options` argument
 * (`useMemo(() => ({...}), [])`) so its identity is stable across
 * renders. Without that, `options.parse` is a new function each render
 * and the `filters` useMemo below would re-run every render, producing
 * a new `filters` object that triggers downstream re-renders — the
 * classic infinite-loop trap. Each migrated hook is a thin wrapper
 * that does this memoization and exposes the typed result.
 */
export function useUrlFilters<TFilters extends object>(
  options: UseUrlFiltersOptions<TFilters>,
): UseUrlFiltersReturn<TFilters> {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => options.parse(searchParams), [searchParams, options]);

  const setFilter = useCallback(
    <K extends keyof TFilters>(key: K, value: TFilters[K]): void => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === undefined || value === null || value === '') {
            next.delete(key as string);
          } else {
            next.set(key as string, String(value));
          }
          if (key !== 'page') {
            next.delete('page');
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  /**
   * Multi-key batch setter. Two back-to-back `setFilter` calls inside
   * the same synchronous block don't compose — React Router's
   * `setSearchParams` isn't React-state-queueable, so the second call
   * reads the URL as it was BEFORE the first call and clobbers it.
   * Use `setFilters` when you need to change more than one key at once
   * (e.g. `sortBy` + `order`).
   */
  const setFilters = useCallback(
    (changes: Partial<TFilters>): void => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          let touchedNonPage = false;
          for (const [k, v] of Object.entries(changes)) {
            if (v === undefined || v === null || v === '') {
              next.delete(k);
            } else {
              next.set(k, String(v));
            }
            if (k !== 'page') touchedNonPage = true;
          }
          if (touchedNonPage) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const reset = useCallback((): void => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const activeFilterCount = useMemo(() => options.countActive(filters), [filters, options]);

  return { filters, setFilter, setFilters, reset, activeFilterCount };
}

/**
 * Validates a raw string against a closed set of allowed enum values.
 * Returns the value (typed as the enum) if it matches, undefined
 * otherwise. Lives here so every filter hook uses the same primitive
 * for parsing enum URL params; previously inlined identically in each
 * of the three filter hooks.
 */
export function pickEnum<T extends readonly string[]>(
  value: string | null,
  allowed: T,
): T[number] | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T[number]) : undefined;
}
