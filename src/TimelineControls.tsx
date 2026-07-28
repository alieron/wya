import { Clock3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DAYS, formatTime } from './nusmods';
import type { Day } from './nusmods';

export function TimeLabel({ time }: { time: string }) {
  const [clock, period] = formatTime(time).split(' ');
  const [hour, minute] = clock.split(':');
  return (
    <span
      className="inline-grid grid-cols-[2ch_.5ch_2ch_2.25ch] items-baseline tabular-nums"
      aria-label={formatTime(time)}
    >
      <span className="text-right" aria-hidden="true">{hour}</span>
      <span aria-hidden="true">:</span>
      <span aria-hidden="true">{minute}</span>
      <span className="text-right" aria-hidden="true">{period}</span>
    </span>
  );
}

interface Props {
  selectedDay: Day;
  selectedTime: string;
  busyCount: number;
  freeCount: number;
  onSelectDay: (day: Day) => void;
  onJumpToNow: () => void;
}

export default function TimelineControls({
  selectedDay,
  selectedTime,
  busyCount,
  freeCount,
  onSelectDay,
  onJumpToNow,
}: Props) {
  return (
    <header className="grid shrink-0 grid-cols-[1fr_auto] items-center gap-2 border-b px-3 py-3 sm:flex sm:px-4">
      <ToggleGroup
        aria-label="Day of week"
        value={[selectedDay]}
        onValueChange={(days) => days[0] && onSelectDay(days[0] as Day)}
        variant="outline"
        size="sm"
        spacing={0}
        className="order-3 col-span-2 grid h-11 w-full grid-cols-6 sm:order-1 sm:flex sm:h-auto sm:w-auto"
      >
        {DAYS.map((day) => (
          <ToggleGroupItem
            key={day}
            value={day}
            aria-label={day}
            className="h-11 min-w-0 px-1 data-pressed:bg-primary data-pressed:text-primary-foreground sm:h-7 sm:min-w-10 sm:px-2"
          >
            <span className="sm:hidden">{day.slice(0, 2)}</span>
            <span className="hidden sm:inline">{day.slice(0, 3)}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onJumpToNow}
        className="order-2 h-11 sm:order-2 sm:h-7"
      >
        <Clock3 data-icon="inline-start" />
        Now
      </Button>

      <div className="order-1 flex min-w-0 items-center gap-2 sm:order-3 sm:ml-auto" aria-live="polite">
        <span className="w-[5.25rem] shrink-0 text-sm font-bold text-foreground sm:text-base">
          <TimeLabel time={selectedTime} />
        </span>
        <Badge variant="secondary" className="w-[4.5rem] tabular-nums">{busyCount} busy</Badge>
        <Badge variant="outline" className="hidden w-[4.5rem] tabular-nums min-[360px]:inline-flex">{freeCount} free</Badge>
      </div>
    </header>
  );
}
