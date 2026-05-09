import { useState } from 'react';
import { formatTime, parseNusmodsUrl, timeToMinutes } from './nusmods';
import { updateStudent, removeStudent } from './store';
import type { Student, StudentPatch, AppState } from './store';
import type { ResolvedSlot, VenueLocation } from './nusmods';

const PRESETS = [
  '#2f80ed',
  '#16a34a',
  '#f59e0b',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#4b5563',
] as const;

interface Props {
  student: Student;
  daySlots: ResolvedSlot[];
  activeSlots: ResolvedSlot[];
  selectedTime: string;
  venueCoords: Record<string, VenueLocation>;
  loading: boolean;
  error: string;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

function slotLabel(slot: ResolvedSlot): string {
  return `${slot.moduleCode} ${slot.lessonType}`;
}

export default function StudentCard({
  student,
  daySlots,
  activeSlots,
  selectedTime,
  venueCoords,
  loading,
  error,
  setState,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editName, setEditName] = useState(student.name);
  const [editColor, setEditColor] = useState(student.color);
  const [editUrl, setEditUrl] = useState(student.url);

  function save() {
    const patch: StudentPatch = {
      name: editName.trim() || student.name,
      color: editColor,
      url: editUrl.trim() || student.url,
    };
    updateStudent(student.id, patch, setState);
    setEditing(false);
  }

  function cancel() {
    setEditName(student.name);
    setEditColor(student.color);
    setEditUrl(student.url);
    setEditing(false);
  }

  const parsed = parseNusmodsUrl(student.url);
  const moduleCount = parsed ? Object.keys(parsed.modules).length : 0;
  const hasUrlError = !parsed && !!student.url;
  const sortedDaySlots = [...daySlots].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
  );
  const currentVenues = activeSlots.map((slot) => {
    const venue = venueCoords[slot.venue];
    return { ...slot, hasCoords: !!venue, roomName: venue?.roomName ?? slot.venue };
  });
  const nextSlot = sortedDaySlots.find((slot) => timeToMinutes(slot.startTime) > timeToMinutes(selectedTime));

  return (
    <article
      className={`overflow-hidden rounded-md border bg-[var(--color-surface2)] transition
        ${activeSlots.length > 0 ? 'border-[var(--color-accent)]/50 shadow-sm' : 'border-[var(--color-border)]'}
        ${loading ? 'opacity-70' : ''}`}
    >
      <div className="flex">
        <div className="w-1 shrink-0" style={{ background: student.color }} />

        <button
          type="button"
          onClick={() => {
            setExpanded((value) => !value);
            setEditing(false);
          }}
          className="min-w-0 flex-1 px-3 py-2.5 text-left"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-[var(--color-txt)]">{student.name}</span>
            {moduleCount > 0 && (
              <span className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] text-[var(--color-txt-muted)]">
                Sem {parsed!.semester} - {moduleCount}
              </span>
            )}
            {loading && (
              <span className="shrink-0 rounded-full border border-[var(--color-warn)]/40 px-2 py-0.5 text-[10px] text-[var(--color-warn)]">
                loading
              </span>
            )}
          </div>

          <div className="mt-2">
            {hasUrlError ? (
              <p className="text-xs text-[var(--color-danger)]">Invalid NUSMods URL</p>
            ) : error ? (
              <p className="truncate text-xs text-[var(--color-danger)]" title={error}>
                {error}
              </p>
            ) : currentVenues.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {currentVenues.map((slot) => (
                  <span
                    key={`${slot.moduleCode}-${slot.lessonIndex}`}
                    className={`rounded-full border px-2 py-0.5 text-[11px]
                      ${slot.hasCoords
                        ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                        : 'border-[var(--color-warn)]/40 bg-[var(--color-warn-soft)] text-[var(--color-warn)]'}`}
                  >
                    {slot.roomName}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-txt-muted)]">
                Free{nextSlot ? ` until ${formatTime(nextSlot.startTime)}` : ''}
              </p>
            )}
          </div>
        </button>

        <div className="flex shrink-0 flex-col gap-1 px-2 py-2">
          <button
            type="button"
            onClick={() => {
              if (!editing) {
                setEditName(student.name);
                setEditColor(student.color);
                setEditUrl(student.url);
              }
              setEditing((value) => !value);
              setExpanded(false);
            }}
            className="grid h-7 w-10 place-items-center rounded-md text-xs text-[var(--color-txt-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-txt)]"
            aria-label="Edit person"
            title="Edit person"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => confirm(`Remove ${student.name}?`) && removeStudent(student.id, setState)}
            className="grid h-7 w-10 place-items-center rounded-md text-xs text-[var(--color-txt-muted)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-danger)]"
            aria-label="Remove person"
            title="Remove person"
          >
            x
          </button>
        </div>
      </div>

      {editing && (
        <div className="space-y-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-txt-muted)]">
              Name
            </span>
            <input
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && save()}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface2)] px-2.5 py-2 text-sm text-[var(--color-txt)] outline-none transition focus:border-[var(--color-accent)]"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-txt-muted)]">
              NUSMods URL
            </span>
            <input
              value={editUrl}
              onChange={(event) => setEditUrl(event.target.value)}
              placeholder="https://nusmods.com/timetable/sem-1/share?..."
              spellCheck={false}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface2)] px-2.5 py-2 text-sm text-[var(--color-txt)] outline-none transition focus:border-[var(--color-accent)]"
            />
          </label>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-txt-muted)]">
              Colour
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={editColor}
                onChange={(event) => setEditColor(event.target.value)}
                className="h-8 w-10 shrink-0 cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-surface2)] p-0.5"
              />
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setEditColor(color)}
                    aria-label={`Use color ${color}`}
                    className={`h-5 w-5 rounded-full border-2 transition ${editColor === color ? 'border-white' : 'border-transparent'}`}
                    style={{ background: color }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={save}
              className="flex-1 rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-95"
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancel}
              className="flex-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-txt-dim)] transition hover:border-[var(--color-border2)] hover:text-[var(--color-txt)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {expanded && !editing && sortedDaySlots.length > 0 && (
        <div className="space-y-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          {sortedDaySlots.map((slot) => {
            const venue = venueCoords[slot.venue];
            return (
              <div key={`${slot.moduleCode}-${slot.lessonIndex}`} className="grid grid-cols-[78px_minmax(0,1fr)] gap-2">
                <div className="text-[10px] leading-5 text-[var(--color-txt-muted)]">
                  {formatTime(slot.startTime)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-[var(--color-txt)]">
                    {slotLabel(slot)}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-txt-muted)]">
                    <span>{formatTime(slot.startTime)}-{formatTime(slot.endTime)}</span>
                    <span>{slot.classNo}</span>
                    <span className={venue ? 'text-[var(--color-accent)]' : ''}>
                      {venue?.roomName ?? slot.venue}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
