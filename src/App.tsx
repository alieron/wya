import { useEffect, useMemo, useRef, useState } from 'react';
import { Settings, Trash2, UserPlus } from 'lucide-react';
import {
  DAYS,
  formatMinutes,
  formatTime,
  minutesToTime,
  parseNusmodsUrl,
  resolveSchedule,
  timeToMinutes,
} from './nusmods';
import type { Day, ResolvedSlot } from './nusmods';
import type { AppState, Student } from './store';
import { initialState, fetchModulesFor, loadVenues, removeStudent } from './store';
import MapView from './MapView';
import type { MapMarker } from './MapView';
import AddStudentModal from './AddStudentModal';

const DAY_START = 8 * 60;
const DAY_END = 22 * 60;
const TOTAL_MINUTES = DAY_END - DAY_START;
const TIMELINE_MIN_HEIGHT = 156;
const TIMELINE_MAX_HEIGHT = 430;

const TIME_MARKS = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => (
  DAY_START + i * 60
));

interface Schedule {
  student: Student;
  slots: ResolvedSlot[];
}

interface DaySchedule {
  student: Student;
  slots: ResolvedSlot[];
}

interface TimelineProps {
  schedules: Schedule[];
  selectedDay: Day;
  selectedTime: string;
  height: number;
  busyCount: number;
  freeCount: number;
  onSelectDay: (day: Day) => void;
  onSelectTime: (time: string) => void;
  onJumpToNow: () => void;
  onAddPerson: () => void;
  onEditPerson: (id: string) => void;
  onDeletePerson: (id: string) => void;
  onResizeStart: () => void;
}

function todayAsDay(): Day {
  const dayIndex = new Date().getDay();
  return dayIndex >= 1 && dayIndex <= 6 ? DAYS[dayIndex - 1] : 'Monday';
}

function currentTime(): string {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const clamped = Math.min(DAY_END, Math.max(DAY_START, mins));
  return minutesToTime(clamped);
}

function atTime(slots: ResolvedSlot[], time: string): ResolvedSlot[] {
  const t = timeToMinutes(time);
  return slots.filter((slot) => timeToMinutes(slot.startTime) <= t && timeToMinutes(slot.endTime) > t);
}

function clampTimelineMinutes(minutes: number): number {
  return Math.min(DAY_END, Math.max(DAY_START, minutes));
}

function timelinePercent(minutes: number): number {
  return ((clampTimelineMinutes(minutes) - DAY_START) / TOTAL_MINUTES) * 100;
}

function pickTimelineTime(
  event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>,
  onSelectTime: (time: string) => void,
) {
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = (event.clientX - rect.left) / rect.width;
  const minutes = Math.round(DAY_START + ratio * TOTAL_MINUTES);
  onSelectTime(minutesToTime(clampTimelineMinutes(minutes)));
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

function Timeline({
  schedules,
  selectedDay,
  selectedTime,
  height,
  busyCount,
  freeCount,
  onSelectDay,
  onSelectTime,
  onJumpToNow,
  onAddPerson,
  onEditPerson,
  onDeletePerson,
  onResizeStart,
}: TimelineProps) {
  const selectedMinutes = timeToMinutes(selectedTime);
  const scrubberLeft = `${timelinePercent(selectedMinutes)}%`;
  const [hoveredLesson, setHoveredLesson] = useState<{
    slot: ResolvedSlot;
    x: number;
    y: number;
  } | null>(null);
  const rows = schedules.map(({ student, slots }) => {
    const daySlots = slots.filter((slot) => slot.day === selectedDay);
    const rowActive = daySlots.some((slot) => {
      const start = timeToMinutes(slot.startTime);
      const end = timeToMinutes(slot.endTime);
      return start <= selectedMinutes && end > selectedMinutes;
    });
    return { student, daySlots, rowActive };
  });

  function handleTrackPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pickTimelineTime(event, onSelectTime);
  }

  function handleTrackPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.buttons === 1) pickTimelineTime(event, onSelectTime);
  }

  return (
    <section
      className="relative flex shrink-0 flex-col border-t border-[var(--color-border)] bg-[var(--color-surface)]"
      style={{ height }}
    >
      <button
        type="button"
        aria-label="Resize timeline"
        title="Resize timeline"
        onPointerDown={(event) => {
          event.preventDefault();
          onResizeStart();
        }}
        className="absolute left-0 top-0 z-30 h-2 w-full cursor-row-resize bg-transparent"
      >
        <span className="mx-auto mt-[3px] block h-px w-16 rounded-full bg-[var(--color-border2)]" />
      </button>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 pb-3 pt-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-[var(--color-border)] bg-[var(--color-surface2)] p-0.5">
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => onSelectDay(day)}
                className={`h-8 min-w-9 rounded px-2 text-xs font-medium transition ${selectedDay === day
                  ? 'bg-[var(--color-accent)] text-white shadow-sm'
                  : 'text-[var(--color-txt-dim)] hover:bg-[var(--color-surface)] hover:text-[var(--color-txt)]'}`}
              >
                {day.slice(0, 3)}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onJumpToNow}
            className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface2)] px-3 text-xs font-medium text-[var(--color-txt-dim)] transition hover:border-[var(--color-border2)] hover:text-[var(--color-txt)]"
          >
            Now
          </button>
        </div>

        <div className="flex min-w-0 items-baseline gap-2 text-sm">
          <span className="font-semibold text-[var(--color-txt)]">
            {formatTime(selectedTime)}
          </span>
          <span className="text-[var(--color-txt-dim)]">
            {busyCount} busy, {freeCount} free
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-3 pt-2">
        <div className="grid h-full min-h-0 grid-rows-[38px_minmax(0,1fr)] gap-y-1">
          <div className="grid grid-cols-[144px_minmax(0,1fr)] gap-x-3">
            <div />
            <div
              className="relative h-[38px] touch-none"
              onPointerDown={handleTrackPointerDown}
              onPointerMove={handleTrackPointerMove}
            >
              {TIME_MARKS.map((minutes) => (
                <div
                  key={minutes}
                  className="absolute top-0 h-full -translate-x-px"
                  style={{ left: `${timelinePercent(minutes)}%` }}
                >
                  <div className="h-2 w-px bg-[var(--color-border2)]" />
                  <div className="mt-1 -translate-x-1/2 text-[10px] text-[var(--color-txt-muted)]">
                    {formatMinutes(minutes)}
                  </div>
                </div>
              ))}
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-30 w-0.5 rounded-full"
                style={{ left: scrubberLeft, backgroundColor: 'var(--color-scrub)' }}
              />
              <div
                className="pointer-events-none absolute top-0 z-40 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 shadow"
                style={{
                  left: scrubberLeft,
                  backgroundColor: 'var(--color-scrub)',
                  borderColor: 'var(--color-surface)',
                }}
              />
              <div
                className="pointer-events-none absolute top-4 z-40 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow"
                style={{ left: scrubberLeft, backgroundColor: 'var(--color-scrub)' }}
              >
                {formatTime(selectedTime)}
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto pr-1">
            <div className="grid min-h-full grid-cols-[144px_minmax(0,1fr)] gap-x-3">
              <div className="space-y-1.5">
                {rows.map(({ student, rowActive }) => (
                  <div key={student.id} className="group flex h-6 min-w-0 items-center gap-2">
                    <span
                      className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-semibold text-white"
                      style={{ background: student.color }}
                    >
                      {initials(student.name)}
                    </span>
                    <span className={`truncate text-xs ${rowActive ? 'font-semibold text-[var(--color-txt)]' : 'text-[var(--color-txt-dim)]'}`}>
                      {student.name}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => onEditPerson(student.id)}
                        aria-label={`Edit ${student.name}`}
                        title={`Edit ${student.name}`}
                        className="grid h-5 w-5 place-items-center rounded text-[var(--color-txt-muted)] transition hover:bg-[var(--color-surface2)] hover:text-[var(--color-scrub)]"
                      >
                        <Settings size={13} strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePerson(student.id)}
                        aria-label={`Delete ${student.name}`}
                        title={`Delete ${student.name}`}
                        className="grid h-5 w-5 place-items-center rounded text-[var(--color-txt-muted)] transition hover:bg-[var(--color-surface2)] hover:text-[var(--color-danger)]"
                      >
                        <Trash2 size={13} strokeWidth={2} />
                      </button>
                    </span>
                  </div>
                ))}
              </div>

              <div
                className="relative min-h-full space-y-1.5 touch-none"
                onPointerDown={handleTrackPointerDown}
                onPointerMove={handleTrackPointerMove}
              >
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-30 w-0.5 rounded-full"
                  style={{ left: scrubberLeft, backgroundColor: 'var(--color-scrub)' }}
                />

                {rows.map(({ student, daySlots }) => (
                  <div key={student.id} className="relative h-6">
                    <div className="absolute left-0 right-0 top-1/2 h-px bg-[var(--color-border)]" />
                    {daySlots.map((slot) => {
                      const start = timeToMinutes(slot.startTime);
                      const end = timeToMinutes(slot.endTime);
                      if (end <= DAY_START || start >= DAY_END) return null;
                      const left = timelinePercent(start);
                      const width = Math.max(0.5, timelinePercent(end) - left);
                      const isActive = start <= selectedMinutes && end > selectedMinutes;

                      return (
                        <div
                          key={`${slot.moduleCode}-${slot.lessonIndex}`}
                          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full"
                          onMouseEnter={(event) => {
                            setHoveredLesson({ slot, x: event.clientX, y: event.clientY });
                          }}
                          onMouseMove={(event) => {
                            setHoveredLesson({ slot, x: event.clientX, y: event.clientY });
                          }}
                          onMouseLeave={() => setHoveredLesson(null)}
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            background: student.color,
                            opacity: isActive ? 1 : 0.6,
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={onAddPerson}
                className="col-span-2 mt-2 flex h-9 items-center justify-center rounded-md border border-dashed border-[var(--color-border2)] bg-[var(--color-surface2)] text-sm font-medium text-[var(--color-txt-dim)] transition hover:border-[var(--color-scrub)] hover:text-[var(--color-scrub)]"
              >
                + Add person
              </button>
            </div>
          </div>
        </div>
      </div>

      {hoveredLesson && (
        <div
          className="pointer-events-none fixed z-[3000] w-max max-w-[240px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-xs text-[var(--color-txt)] shadow-lg"
          style={{
            left: Math.min(window.innerWidth - 260, hoveredLesson.x + 12),
            top: Math.max(8, hoveredLesson.y - 56),
          }}
        >
          <div className="font-semibold">{hoveredLesson.slot.moduleCode} {hoveredLesson.slot.lessonType}</div>
          <div className="text-[var(--color-txt-dim)]">
            {formatTime(hoveredLesson.slot.startTime)}-{formatTime(hoveredLesson.slot.endTime)} - {hoveredLesson.slot.venue || 'No venue'}
          </div>
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [showModal, setShowModal] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [selectedDay, setDay] = useState<Day>(() => todayAsDay());
  const [selectedTime, setTime] = useState(() => currentTime());
  const [timelineHeight, setTimelineHeight] = useState(230);
  const [resizingTimeline, setResizingTimeline] = useState(false);
  const startedFetches = useRef(new Set<string>());

  useEffect(() => {
    if (state.students.length === 0) return;
    if (!state.venueLoaded) void loadVenues(setState);

    state.students.forEach((student) => {
      const parsed = parseNusmodsUrl(student.url);
      if (!parsed) return;
      const missing = Object.keys(parsed.modules).some((moduleCode) => !state.moduleCache[moduleCode]);
      if (!missing || startedFetches.current.has(student.id)) return;
      startedFetches.current.add(student.id);
      void fetchModulesFor(student, state.moduleCache, setState).finally(() => {
        startedFetches.current.delete(student.id);
      });
    });
  }, [state.students, state.moduleCache, state.venueLoaded]);

  useEffect(() => {
    if (!resizingTimeline) return;

    function onPointerMove(event: PointerEvent) {
      const viewportHeight = window.innerHeight;
      const upperHeight = Math.max(
        TIMELINE_MIN_HEIGHT,
        Math.min(TIMELINE_MAX_HEIGHT, viewportHeight - 180),
      );
      const nextHeight = Math.min(
        upperHeight,
        Math.max(TIMELINE_MIN_HEIGHT, viewportHeight - event.clientY),
      );
      setTimelineHeight(nextHeight);
    }

    function onPointerUp() {
      setResizingTimeline(false);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [resizingTimeline]);

  const schedules = useMemo(
    () =>
      state.students.map((student) => ({
        student,
        slots: resolveSchedule(parseNusmodsUrl(student.url), state.moduleCache),
      })),
    [state.students, state.moduleCache],
  );

  const daySchedules: DaySchedule[] = schedules.map(({ student, slots }) => ({
    student,
    slots: slots.filter((slot) => slot.day === selectedDay),
  }));

  const activeSchedules = daySchedules.map(({ student, slots }) => ({
    student,
    slots: atTime(slots, selectedTime),
  }));

  const busyCount = activeSchedules.filter(({ slots }) => slots.length > 0).length;
  const freeCount = state.students.length - busyCount;

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
    const student = state.students.find((item) => item.id === id);
    if (!student) return;
    if (!window.confirm(`Delete ${student.name}?`)) return;
    removeStudent(id, setState);
    if (editingStudentId === id) closeModal();
  }

  const editingStudent = editingStudentId
    ? state.students.find((student) => student.id === editingStudentId)
    : undefined;

  return (
    <div className="h-screen overflow-hidden bg-[var(--color-bg)] text-[var(--color-txt)]">
      <main className="flex h-full min-h-0 min-w-0 flex-col">
        <section className="relative min-h-[180px] flex-1 overflow-hidden">
          <MapView markers={mapMarkers} />
          <button
            type="button"
            onClick={openAddModal}
            className="absolute right-4 top-4 z-[1000] flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-2 text-sm font-medium text-[var(--color-txt)] shadow-[0_8px_24px_rgba(0,0,0,0.24)] backdrop-blur transition hover:border-[var(--color-scrub)] hover:text-[var(--color-scrub)]"
          >
            <UserPlus size={16} strokeWidth={2} />
            + Add person
          </button>
        </section>

        <Timeline
          schedules={schedules}
          selectedDay={selectedDay}
          selectedTime={selectedTime}
          height={timelineHeight}
          busyCount={busyCount}
          freeCount={freeCount}
          onSelectDay={setDay}
          onSelectTime={setTime}
          onJumpToNow={jumpToNow}
          onAddPerson={openAddModal}
          onEditPerson={openEditModal}
          onDeletePerson={deleteStudent}
          onResizeStart={() => setResizingTimeline(true)}
        />
      </main>

      {showModal && (
        <AddStudentModal
          onClose={closeModal}
          studentCount={state.students.length}
          student={editingStudent}
          state={state}
          setState={setState}
        />
      )}
    </div>
  );
}
