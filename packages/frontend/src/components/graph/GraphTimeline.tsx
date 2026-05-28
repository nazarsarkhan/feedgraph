import { Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { formatSliderDate, type TimelineRange } from '@/lib/graph-timeline';

interface Props {
  range: TimelineRange;
  /** Current slider position (Unix seconds). */
  value: number;
  isPlaying: boolean;
  onValueChange: (v: number) => void;
  onPlay: () => void;
  onReset: () => void;
  /** Live counts after the timeline filter is applied. */
  nodeCount: number;
  edgeCount: number;
}

/**
 * Timeline scrubber for the Graph page. Lives outside the canvas so
 * dragging the thumb doesn't interfere with the ReactFlow pan/drag
 * handlers; counts on the right edge reflect post-filter totals so
 * the user can see the graph shrink/grow as they scrub.
 *
 * Step is `range / 200` so 200 discrete positions span the full
 * window — fine-grained enough that even a long range scrubs
 * smoothly while keeping each step a meaningful jump in node-set
 * (avoids re-rendering on sub-second slider noise).
 */
export function GraphTimeline({
  range,
  value,
  isPlaying,
  onValueChange,
  onPlay,
  onReset,
  nodeCount,
  edgeCount,
}: Props) {
  const step = Math.max(1, (range.max - range.min) / 200);

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-background/95 px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Timeline</span>
        <span className="text-xs text-muted-foreground">
          {nodeCount} node{nodeCount === 1 ? '' : 's'} &middot; {edgeCount} edge
          {edgeCount === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label={isPlaying ? 'Pause timeline' : 'Play timeline'}
          onClick={onPlay}
        >
          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>

        <div className="flex flex-1 flex-col gap-1">
          <Slider
            min={range.min}
            max={range.max}
            step={step}
            value={[value]}
            onValueChange={(arr) => onValueChange(arr[0] ?? range.max)}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{formatSliderDate(range.min)}</span>
            <span className="font-medium text-foreground">{formatSliderDate(value)}</span>
            <span>{formatSliderDate(range.max)}</span>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label="Reset timeline to latest"
          onClick={onReset}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
