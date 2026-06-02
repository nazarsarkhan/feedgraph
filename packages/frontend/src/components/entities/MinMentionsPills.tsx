import { cn } from '@/lib/utils';

const PRESETS = [1, 5, 10] as const;

interface Props {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

/**
 * Quick-toggle for the "min mentions" filter: All / 1+ / 5+ / 10+ instead of
 * a free number input, so the common thresholds are one click. A value that
 * isn't one of the presets (e.g. the graph's default of 2) renders as an
 * extra active pill rather than being silently dropped.
 */
export function MinMentionsPills({ value, onChange }: Props) {
  const isCustom = value !== undefined && !PRESETS.includes(value as (typeof PRESETS)[number]);

  return (
    <div className="flex gap-1">
      <Pill active={value === undefined} onClick={() => onChange(undefined)}>
        All
      </Pill>
      {PRESETS.map((n) => (
        <Pill key={n} active={value === n} onClick={() => onChange(n)}>
          {n}+
        </Pill>
      ))}
      {isCustom && (
        <Pill active onClick={() => onChange(value)}>
          {value}+
        </Pill>
      )}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-9 rounded-md border px-3 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {children}
    </button>
  );
}
