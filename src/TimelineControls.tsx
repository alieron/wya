import { Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DAYS } from './nusmods';
import type { Day } from './nusmods';

interface Props {
  selectedSemester: string;
  selectedDay: Day;
  onSelectSemester: (semester: string) => void;
  onSelectDay: (day: Day) => void;
  onJumpToNow: () => void;
}

export default function TimelineControls({
  selectedSemester,
  selectedDay,
  onSelectSemester,
  onSelectDay,
  onJumpToNow,
}: Props) {
  return (
    <header className="grid shrink-0 grid-cols-[1fr_auto] items-center gap-2 border-b px-3 py-3 sm:flex sm:gap-1 sm:px-4 md:gap-2">
      <ToggleGroup
        aria-label="Day of week"
        value={[selectedDay]}
        onValueChange={(days) => days[0] && onSelectDay(days[0] as Day)}
        variant="outline"
        size="sm"
        spacing={0}
        className="order-3 col-span-2 grid h-11 w-full grid-cols-6 sm:order-1 sm:col-span-1 sm:flex sm:h-auto sm:w-auto"
      >
        {DAYS.map((day) => (
          <ToggleGroupItem
            key={day}
            value={day}
            aria-label={day}
            className="h-11 min-w-0 px-1 data-pressed:bg-primary data-pressed:text-primary-foreground sm:h-7 sm:min-w-9 sm:px-2 md:min-w-10"
          >
            <span className="sm:hidden">{day.slice(0, 2)}</span>
            <span className="hidden sm:inline">{day.slice(0, 3)}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <NativeSelect
        value={selectedSemester}
        onChange={(event) => onSelectSemester(event.target.value)}
        aria-label="Semester"
        className="order-1 w-24 sm:order-2 md:w-28 [&_select]:h-11! sm:[&_select]:h-7!"
        size="sm"
      >
        <NativeSelectOption value="1">Sem 1</NativeSelectOption>
        <NativeSelectOption value="2">Sem 2</NativeSelectOption>
        <NativeSelectOption value="3">ST I</NativeSelectOption>
        <NativeSelectOption value="4">ST II</NativeSelectOption>
      </NativeSelect>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onJumpToNow}
        aria-label="Jump to now"
        className="order-2 size-11 sm:order-3 sm:h-7 sm:w-auto"
      >
        <Clock3 data-icon="inline-start" />
        <span className="hidden sm:inline">Now</span>
      </Button>
    </header>
  );
}
