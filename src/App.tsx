import { useEffect, useMemo, useRef, useState } from 'react';
import { GripVertical, MapPinOff, Settings, UserPlus } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  DAYS,
  academicYearOptions,
  currentAY,
  formatMinutes,
  formatTime,
  latestPublishedAY,
  minutesToTime,
  parseNusmodsUrl,
  resolveSchedule,
  timeToMinutes,
} from './nusmods';
import type { Day, ResolvedSlot } from './nusmods';
import type { AppState, Student } from './store';
import { initialState, fetchModulesFor, loadVenues, moveStudent, removeStudent } from './store';
import MapView from './MapView';
import type { MapMarker } from './MapView';
import AddStudentModal from './AddStudentModal';
import TimelineControls from './TimelineControls';

const DAY_START = 8 * 60;
const DAY_END = 22 * 60;
const TOTAL_MINUTES = DAY_END - DAY_START;
const MOBILE_TIMELINE_WIDTH = 1120;
const TIME_MARKS = Array.from({ length: TOTAL_MINUTES / 60 + 1 }, (_, index) => (
  DAY_START + index * 60
));

interface Schedule {
  student: Student;
  slots: ResolvedSlot[];
}

interface TimelineRow {
  student: Student;
  daySlots: ResolvedSlot[];
  active: boolean;
}

interface DragPreview {
  student: Student;
  offset: number;
}

interface ScheduleDockProps {
  schedules: Schedule[];
  selectedSemester: string;
  selectedDay: Day;
  selectedTime: string;
  onSelectSemester: (semester: string) => void;
  onSelectDay: (day: Day) => void;
  onSelectTime: (time: string) => void;
  onJumpToNow: () => void;
  onEditPerson: (id: string) => void;
  onMovePerson: (id: string, offset: number) => void;
  venueLocations: AppState['venueLocations'];
  mobileHeight: number;
  onMobileHeightChange: (height: number) => void;
}

function todayAsDay(): Day {
  const dayIndex = new Date().getDay();
  return dayIndex >= 1 && dayIndex <= 6 ? DAYS[dayIndex - 1] : 'Monday';
}

function currentTime(): string {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutesToTime(Math.min(DAY_END, Math.max(DAY_START, minutes)));
}

function atTime(slots: ResolvedSlot[], time: string): ResolvedSlot[] {
  const minutes = timeToMinutes(time);
  return slots.filter((slot) => (
    timeToMinutes(slot.startTime) <= minutes && timeToMinutes(slot.endTime) > minutes
  ));
}

function clampTimelineMinutes(minutes: number): number {
  return Math.min(DAY_END, Math.max(DAY_START, minutes));
}

function timelinePercent(minutes: number): number {
  return ((clampTimelineMinutes(minutes) - DAY_START) / TOTAL_MINUTES) * 100;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
}

function pickTimelineTime(
  event: React.PointerEvent<HTMLDivElement>,
  onSelectTime: (time: string) => void,
) {
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = (event.clientX - rect.left) / rect.width;
  onSelectTime(minutesToTime(clampTimelineMinutes(Math.round(DAY_START + ratio * TOTAL_MINUTES))));
}

function PersonLabel({
  student,
  active,
  mobile = false,
  onEdit,
  onMove,
  dragging = false,
  onDragPreview,
}: {
  student: Student;
  active: boolean;
  mobile?: boolean;
  onEdit: () => void;
  onMove: (offset: number) => void;
  dragging?: boolean;
  onDragPreview: (offset: number | null) => void;
}) {
  const dragStartY = useRef<number | null>(null);

  return (
    <div className={cn(
      'group flex min-w-0 items-center gap-2',
      mobile && 'h-11 w-40 rounded-lg border bg-card/95 px-1.5 shadow-sm backdrop-blur-sm',
      dragging && 'opacity-70 ring-2 ring-primary shadow-lg',
    )}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className={cn('shrink-0 touch-none', dragging ? 'cursor-grabbing bg-muted' : 'cursor-grab')}
              aria-label={`Reorder ${student.name}`}
              onPointerDown={(event) => {
                dragStartY.current = event.clientY;
                event.currentTarget.setPointerCapture(event.pointerId);
                onDragPreview(0);
              }}
              onPointerMove={(event) => {
                if (dragStartY.current === null || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
                onDragPreview(Math.round((event.clientY - dragStartY.current) / (mobile ? 48 : 32)));
              }}
              onPointerUp={(event) => {
                if (dragStartY.current !== null) {
                  const offset = Math.round((event.clientY - dragStartY.current) / (mobile ? 48 : 32));
                  if (offset) onMove(offset);
                }
                dragStartY.current = null;
                onDragPreview(null);
              }}
              onPointerCancel={() => {
                dragStartY.current = null;
                onDragPreview(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  onMove(-1);
                }
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  onMove(1);
                }
              }}
            />
          }
        >
          <GripVertical />
        </TooltipTrigger>
        <TooltipContent>Drag to reorder</TooltipContent>
      </Tooltip>
      <Avatar size="sm">
        <AvatarFallback
          className="text-[9px] font-semibold text-white"
          style={{ backgroundColor: student.color }}
        >
          {initials(student.name)}
        </AvatarFallback>
      </Avatar>
      <span className={cn(
        'min-w-0 flex-1 truncate text-xs',
        active ? 'font-semibold text-foreground' : 'text-muted-foreground',
      )}>
        {student.name}
      </span>
      <span className={cn(
        'flex shrink-0 items-center',
        mobile ? '-mr-1' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
      )}>
        <Tooltip>
          <TooltipTrigger
            render={<Button variant="ghost" size="icon-xs" onClick={onEdit} />}
          >
            <Settings />
            <span className="sr-only">Edit {student.name}</span>
          </TooltipTrigger>
          <TooltipContent>Edit {student.name}</TooltipContent>
        </Tooltip>
      </span>
    </div>
  );
}

function PersonGhost({ student, mobile = false }: { student: Student; mobile?: boolean }) {
  return (
    <div className={cn(
      'pointer-events-none flex items-center gap-2 rounded-lg border border-dashed border-primary bg-muted/95 px-2 text-xs font-semibold text-foreground shadow-lg',
      mobile ? 'h-11 w-40' : 'h-7 w-full',
    )}>
      <GripVertical className="size-3.5 text-primary" />
      <Avatar size="sm">
        <AvatarFallback className="text-[9px] font-semibold text-white" style={{ backgroundColor: student.color }}>
          {initials(student.name)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{student.name}</span>
    </div>
  );
}

function finalReorderPreview(rows: TimelineRow[], preview: DragPreview | null) {
  if (!preview) return null;
  const source = rows.findIndex(row => row.student.id === preview.student.id);
  const target = Math.min(rows.length - 1, Math.max(0, source + preview.offset));
  if (source < 0 || source === target) return null;
  const students = rows.map(row => row.student);
  const [student] = students.splice(source, 1);
  students.splice(target, 0, student);
  return { students, start: Math.min(source, target), end: Math.max(source, target) };
}

function LessonBlock({
  slot,
  student,
  selectedMinutes,
  mobile = false,
  venueFound,
}: {
  slot: ResolvedSlot;
  student: Student;
  selectedMinutes: number;
  mobile?: boolean;
  venueFound: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const start = timeToMinutes(slot.startTime);
  const end = timeToMinutes(slot.endTime);
  if (end <= DAY_START || start >= DAY_END) return null;

  const left = timelinePercent(start);
  const width = Math.max(0.5, timelinePercent(end) - left);
  const active = start <= selectedMinutes && end > selectedMinutes;
  const missingVenue = !slot.venue || !venueFound;

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className={cn(
                'absolute overflow-hidden rounded-md px-1.5 text-left text-[10px] font-bold text-white outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary',
                mobile ? 'top-1 h-10' : 'top-1/2 h-5 -translate-y-1/2',
              )}
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: student.color,
                opacity: active ? 1 : 0.72,
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => mobile && setDetailsOpen(true)}
            />
          }
        >
          <span className="flex min-w-0 items-center gap-1" aria-hidden="true">
            <span className="truncate">{slot.moduleCode}</span>
            {missingVenue && <MapPinOff className="size-3 shrink-0" />}
          </span>
          <span className="sr-only">
            {slot.moduleCode} {slot.lessonType}{missingVenue ? ', location unavailable' : ''}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col gap-0.5">
            <p className="font-semibold">{slot.moduleCode} {slot.lessonType}</p>
            <p className="opacity-80">
              {formatTime(slot.startTime)}-{formatTime(slot.endTime)} · {slot.venue || 'No venue'}
            </p>
            {missingVenue && <p className="opacity-80">Location unavailable on the map</p>}
          </div>
        </TooltipContent>
      </Tooltip>

      {mobile && (
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{slot.moduleCode} {slot.lessonType}</DialogTitle>
              <DialogDescription>{student.name}&apos;s class details</DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Time</dt>
              <dd>{formatTime(slot.startTime)}-{formatTime(slot.endTime)}</dd>
              <dt className="text-muted-foreground">Venue</dt>
              <dd>{slot.venue || 'No venue provided'}</dd>
              {missingVenue && (
                <>
                  <dt className="text-muted-foreground">Map</dt>
                  <dd className="flex items-center gap-1.5"><MapPinOff className="size-4" /> Location unavailable</dd>
                </>
              )}
            </dl>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function TimeMarks({ mobile = false }: { mobile?: boolean }) {
  return TIME_MARKS.map((minutes) => (
    <div
      key={minutes}
      className="absolute top-0 h-full -translate-x-px"
      style={{ left: `${timelinePercent(minutes)}%` }}
    >
      <div className={cn('w-px bg-border', mobile ? 'h-2.5' : 'h-2')} />
      <div className="mt-1 h-4 -translate-x-1/2 text-[10px] leading-4 text-muted-foreground">
        {formatMinutes(minutes)}
      </div>
    </div>
  ));
}

function DesktopTimeline({
  rows,
  selectedMinutes,
  selectedTime,
  onSelectTime,
  onEditPerson,
  onMovePerson,
  venueLocations,
}: {
  rows: TimelineRow[];
  selectedMinutes: number;
  selectedTime: string;
  onSelectTime: (time: string) => void;
  onEditPerson: (id: string) => void;
  onMovePerson: (id: string, offset: number) => void;
  venueLocations: AppState['venueLocations'];
}) {
  const scrubberLeft = `${timelinePercent(selectedMinutes)}%`;
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const reorderPreview = finalReorderPreview(rows, dragPreview);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pickTimelineTime(event, onSelectTime);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.buttons === 1) pickTimelineTime(event, onSelectTime);
  }

  if (rows.length === 0) {
    return (
      <div className="hidden min-h-0 flex-1 items-center justify-center px-6 text-center sm:flex">
        <p className="text-sm text-muted-foreground">
          No timetables yet. Use <span className="font-medium text-foreground">Add person</span> to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="hidden min-h-0 flex-1 select-none grid-rows-[36px_minmax(0,1fr)] px-4 pb-3 sm:grid">
      <div className="grid grid-cols-[148px_minmax(0,1fr)] gap-x-3">
        <div />
        <div
          className="relative touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
        >
          <TimeMarks />
          <div
            className="pointer-events-none absolute inset-y-0 z-30 w-0.5 -translate-x-1/2 bg-primary"
            style={{ left: scrubberLeft }}
          />
          <div
            className="pointer-events-none absolute top-0 z-40 size-3 -translate-x-1/2 rounded-full border-2 border-card bg-primary shadow"
            style={{ left: scrubberLeft }}
          />
          <div
            className="pointer-events-none absolute top-4 z-40 h-4 -translate-x-1/2 rounded-full bg-primary px-2 text-[10px] font-semibold leading-4 text-primary-foreground shadow"
            style={{ left: scrubberLeft }}
          >
            {formatTime(selectedTime)}
          </div>
        </div>
      </div>

      <div className="min-h-0 overflow-y-auto">
        {rows.map(({ student, daySlots, active }, index) => (
          <div
            key={student.id}
            className="grid h-8 grid-cols-[148px_minmax(0,1fr)] items-center gap-x-3"
          >
            <div className="relative min-w-0">
              {reorderPreview && index >= reorderPreview.start && index <= reorderPreview.end && (
                <div className="absolute inset-0 z-40"><PersonGhost student={reorderPreview.students[index]} /></div>
              )}
              <PersonLabel
                student={student}
                active={active}
                dragging={dragPreview?.student.id === student.id}
                onEdit={() => onEditPerson(student.id)}
                onMove={(offset) => onMovePerson(student.id, offset)}
                onDragPreview={(offset) => setDragPreview(offset === null ? null : { student, offset })}
              />
            </div>
            <div
              className="relative h-full touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
            >
              <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
              <div
                className="pointer-events-none absolute inset-y-0 z-30 w-0.5 -translate-x-1/2 bg-primary"
                style={{ left: scrubberLeft }}
              />
              {daySlots.map((slot) => (
                <LessonBlock
                  key={`${slot.moduleCode}-${slot.lessonIndex}`}
                  slot={slot}
                  student={student}
                  selectedMinutes={selectedMinutes}
                  venueFound={Boolean(slot.venue && venueLocations[slot.venue])}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileTimeline({
  rows,
  selectedMinutes,
  selectedTime,
  onSelectTime,
  onEditPerson,
  onMovePerson,
  venueLocations,
}: {
  rows: TimelineRow[];
  selectedMinutes: number;
  selectedTime: string;
  onSelectTime: (time: string) => void;
  onEditPerson: (id: string) => void;
  onMovePerson: (id: string, offset: number) => void;
  venueLocations: AppState['venueLocations'];
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const updatingFromScroll = useRef(false);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const reorderPreview = finalReorderPreview(rows, dragPreview);

  useEffect(() => {
    if (updatingFromScroll.current) {
      updatingFromScroll.current = false;
      return;
    }
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollLeft = (timelinePercent(selectedMinutes) / 100) * MOBILE_TIMELINE_WIDTH;
    }
  }, [selectedMinutes]);

  function onScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const ratio = Math.min(1, Math.max(0, scroller.scrollLeft / MOBILE_TIMELINE_WIDTH));
    const nextTime = minutesToTime(Math.round(DAY_START + ratio * TOTAL_MINUTES));
    if (nextTime === selectedTime) return;
    updatingFromScroll.current = true;
    onSelectTime(nextTime);
  }

  if (rows.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center sm:hidden">
        <p className="max-w-64 text-sm text-muted-foreground">
          No timetables yet. Use <span className="font-medium text-foreground">Add person</span> above to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1 select-none overflow-hidden sm:hidden">
      <div
        ref={scrollerRef}
        className="mobile-timeline-scroll h-full max-w-full overflow-auto overscroll-contain"
        onScroll={onScroll}
        aria-label="Schedule timeline. Scroll horizontally to select a time."
        tabIndex={0}
      >
        <div className="mobile-timeline-content relative min-h-full">
          <div className="relative h-10">
            <div className="mobile-timeline-zone absolute inset-y-0">
              <TimeMarks mobile />
            </div>
          </div>
          {rows.map(({ student, daySlots, active }, index) => (
            <div key={student.id} className="relative h-12">
              <div className="sticky left-2 z-20 flex h-12 w-fit items-center">
                {reorderPreview && index >= reorderPreview.start && index <= reorderPreview.end && (
                  <div className="absolute inset-0 z-40"><PersonGhost student={reorderPreview.students[index]} mobile /></div>
                )}
                <PersonLabel
                  student={student}
                  active={active}
                  mobile
                  dragging={dragPreview?.student.id === student.id}
                  onEdit={() => onEditPerson(student.id)}
                  onMove={(offset) => onMovePerson(student.id, offset)}
                  onDragPreview={(offset) => setDragPreview(offset === null ? null : { student, offset })}
                />
              </div>
              <div className="mobile-timeline-zone absolute inset-y-0">
                <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
                {daySlots.map((slot) => (
                  <LessonBlock
                    key={`${slot.moduleCode}-${slot.lessonIndex}`}
                    slot={slot}
                    student={student}
                    selectedMinutes={selectedMinutes}
                    mobile
                    venueFound={Boolean(slot.venue && venueLocations[slot.venue])}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-y-0 left-1/2 z-30 w-0.5 -translate-x-1/2 bg-primary" />
      <div className="pointer-events-none absolute left-1/2 top-0 z-40 size-4 -translate-x-1/2 rounded-full border-2 border-card bg-primary shadow" />
      <div className="pointer-events-none absolute left-1/2 top-5 z-40 h-4 -translate-x-1/2 rounded-full bg-primary px-2 text-[10px] font-semibold leading-4 text-primary-foreground shadow">
        {formatTime(selectedTime)}
      </div>
    </div>
  );
}

function ScheduleDock({
  schedules,
  selectedSemester,
  selectedDay,
  selectedTime,
  onSelectSemester,
  onSelectDay,
  onSelectTime,
  onJumpToNow,
  onEditPerson,
  onMovePerson,
  venueLocations,
  mobileHeight,
  onMobileHeightChange,
}: ScheduleDockProps) {
  const selectedMinutes = timeToMinutes(selectedTime);
  const rows: TimelineRow[] = schedules.map(({ student, slots }) => {
    const daySlots = slots.filter((slot) => slot.day === selectedDay);
    return {
      student,
      daySlots,
      active: daySlots.some((slot) => (
        timeToMinutes(slot.startTime) <= selectedMinutes
        && timeToMinutes(slot.endTime) > selectedMinutes
      )),
    };
  });

  return (
    <section
      className="schedule-dock z-10 flex flex-col overflow-hidden border bg-card/95 text-card-foreground shadow-2xl backdrop-blur-md"
      style={{ '--mobile-dock-height': `${mobileHeight}px` } as React.CSSProperties}
      aria-label="Timetable schedule"
    >
      <button
        type="button"
        className="flex h-4 shrink-0 cursor-row-resize touch-none items-center justify-center sm:hidden"
        aria-label="Resize timeline panel"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const controlsHeight = event.currentTarget.nextElementSibling?.getBoundingClientRect().height ?? 120;
          const minimumHeight = Math.ceil(event.currentTarget.offsetHeight + controlsHeight + 4);
          const height = Math.min(window.innerHeight - 16, Math.max(minimumHeight, window.innerHeight - event.clientY));
          onMobileHeightChange(height);
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        <span className="h-0.5 w-8 rounded-full bg-border" />
      </button>
      <TimelineControls
        selectedSemester={selectedSemester}
        selectedDay={selectedDay}
        onSelectSemester={onSelectSemester}
        onSelectDay={onSelectDay}
        onJumpToNow={onJumpToNow}
      />

      <DesktopTimeline
        rows={rows}
        selectedMinutes={selectedMinutes}
        selectedTime={selectedTime}
        onSelectTime={onSelectTime}
        onEditPerson={onEditPerson}
        onMovePerson={onMovePerson}
        venueLocations={venueLocations}
      />
      <MobileTimeline
        rows={rows}
        selectedMinutes={selectedMinutes}
        selectedTime={selectedTime}
        onSelectTime={onSelectTime}
        onEditPerson={onEditPerson}
        onMovePerson={onMovePerson}
        venueLocations={venueLocations}
      />
    </section>
  );
}

export default function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [showModal, setShowModal] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [selectedDay, setDay] = useState<Day>(() => todayAsDay());
  const [selectedTime, setTime] = useState(() => currentTime());
  const [selectedSemester, setSemester] = useState('1');
  const [academicYear, setAcademicYear] = useState<string | null>(null);
  const [academicYears, setAcademicYears] = useState(() => academicYearOptions(currentAY()));
  const [mobileDockHeight, setMobileDockHeight] = useState(() => window.innerHeight * 0.5);
  const startedFetches = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    void latestPublishedAY().then((latest) => {
      if (cancelled) return;
      setAcademicYears(academicYearOptions(latest));
      setAcademicYear(latest);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!academicYear || state.students.length === 0) return;
    if (!state.venueLoaded) void loadVenues(setState);
    const yearCache = state.moduleCache[academicYear] ?? {};

    state.students.forEach((student) => {
      const parsed = parseNusmodsUrl(student.url);
      if (!parsed) return;
      const missing = Object.keys(parsed.modules).some((moduleCode) => !yearCache[moduleCode]);
      const fetchKey = `${academicYear}:${student.id}:${student.url}`;
      if (!missing || startedFetches.current.has(fetchKey)) return;
      startedFetches.current.add(fetchKey);
      void fetchModulesFor(student, academicYear, yearCache, setState);
    });
  }, [academicYear, state.students, state.moduleCache, state.venueLoaded]);

  const schedules = useMemo(
    () => state.students.map((student) => ({
      student,
      slots: resolveSchedule(
        parseNusmodsUrl(student.url),
        academicYear ? state.moduleCache[academicYear] ?? {} : {},
        selectedSemester,
      ),
    })),
    [academicYear, selectedSemester, state.students, state.moduleCache],
  );

  const activeSchedules = schedules.map(({ student, slots }) => ({
    student,
    slots: atTime(slots.filter((slot) => slot.day === selectedDay), selectedTime),
  }));
  const mapMarkers: MapMarker[] = activeSchedules.flatMap(({ student, slots }) => {
    const seen = new Set<string>();
    return slots.flatMap((slot) => {
      if (!slot.venue || seen.has(slot.venue)) return [];
      seen.add(slot.venue);
      const venue = state.venueLocations[slot.venue];
      if (!venue) return [];
      return [{
        lat: venue.location.y,
        lng: venue.location.x,
        label: student.name,
        color: student.color,
        venue: venue.roomName,
        moduleCode: slot.moduleCode,
        lessonType: slot.lessonType,
        startTime: slot.startTime,
        endTime: slot.endTime,
      }];
    });
  });

  function jumpToNow() {
    setDay(todayAsDay());
    setTime(currentTime());
  }

  function openAddModal() {
    setEditingStudentId(null);
    setShowModal(true);
  }

  function openEditModal(id: string) {
    setEditingStudentId(id);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingStudentId(null);
  }

  function deleteStudent(id: string) {
    removeStudent(id, setState);
  }

  const editingStudent = editingStudentId
    ? state.students.find((student) => student.id === editingStudentId)
    : undefined;

  return (
      <div className="relative isolate h-dvh overflow-hidden bg-background text-foreground">
        <main className="absolute inset-0 z-0">
          <MapView markers={mapMarkers} bottomInset={mobileDockHeight} />
        </main>

        <NativeSelect
          value={academicYear ?? ''}
          onChange={(event) => setAcademicYear(event.target.value)}
          disabled={!academicYear}
          aria-label="Academic year"
          className="absolute left-3 top-3 z-10 w-36 shadow-lg sm:left-4 sm:top-4 [&_select]:h-11! [&_select]:bg-card/95"
        >
          {!academicYear && <NativeSelectOption value="">Loading AY…</NativeSelectOption>}
          {academicYears.map(year => (
            <NativeSelectOption key={year} value={year}>AY {year.replace('-', '/')}</NativeSelectOption>
          ))}
        </NativeSelect>

        <Button
          type="button"
          size="lg"
          onClick={openAddModal}
          className="absolute right-3 top-3 z-10 h-11 shadow-lg sm:right-4 sm:top-4"
        >
          <UserPlus data-icon="inline-start" />
          Add person
        </Button>

        <ScheduleDock
          schedules={schedules}
          selectedSemester={selectedSemester}
          selectedDay={selectedDay}
          selectedTime={selectedTime}
          onSelectSemester={setSemester}
          onSelectDay={setDay}
          onSelectTime={setTime}
          onJumpToNow={jumpToNow}
          onEditPerson={openEditModal}
          onMovePerson={(id, offset) => moveStudent(id, offset, setState)}
          venueLocations={state.venueLocations}
          mobileHeight={mobileDockHeight}
          onMobileHeightChange={setMobileDockHeight}
        />

        {showModal && (
          <AddStudentModal
            onClose={closeModal}
            studentCount={state.students.length}
            student={editingStudent}
            state={state}
            setState={setState}
            onDelete={deleteStudent}
          />
        )}
      </div>
  );
}
