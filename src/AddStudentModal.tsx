import { useEffect, useMemo, useState } from 'react';
import { parseNusmodsUrl, defaultColor } from './nusmods';
import { addStudent, updateStudent } from './store';
import type { AppState, Student } from './store';

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
  onClose: () => void;
  studentCount: number;
  student?: Student;
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}

export default function AddStudentModal({ onClose, studentCount, student, state, setState }: Props) {
  const isEditing = Boolean(student);
  const [url, setUrl] = useState(() => student?.url ?? '');
  const [name, setName] = useState(() => student?.name ?? '');
  const [color, setColor] = useState(() => student?.color ?? defaultColor(studentCount));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const preview = useMemo(() => (url.trim() ? parseNusmodsUrl(url) : null), [url]);
  const previewMods = preview ? Object.keys(preview.modules) : [];

  function validate(): boolean {
    if (!url.trim()) {
      setError('Enter a NUSMods share URL');
      return false;
    }
    const parsed = parseNusmodsUrl(url);
    if (!parsed) {
      setError('This does not look like a NUSMods share URL');
      return false;
    }
    if (!Object.keys(parsed.modules).length) {
      setError('No modules found in this URL');
      return false;
    }
    setError('');
    return true;
  }

  async function submit() {
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      if (student) {
        updateStudent(student.id, {
          url: url.trim(),
          name: name.trim() || student.name,
          color,
        }, setState);
      } else {
        await addStudent(url, name, color, state, setState);
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (url) validate();
    else setError('');
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Enter' && !event.shiftKey) void submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [url, name, color, submitting]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputClass =
    'w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-txt)] outline-none transition placeholder:text-[var(--color-txt-muted)] focus:border-[var(--color-accent)]';

  return (
    <>
      <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="fixed left-1/2 top-1/2 z-[2001] flex w-[min(520px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-md border border-[var(--color-border2)] bg-[var(--color-surface)] shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
        role="dialog"
        aria-modal
        aria-label={isEditing ? 'Edit person' : 'Add person'}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <div className="text-sm font-semibold">{isEditing ? 'Edit person' : 'Add person'}</div>
            <div className="mt-1 text-xs text-[var(--color-txt-muted)]">
              {isEditing ? 'Update this timetable and display colour' : 'Import a timetable from a share link'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-[var(--color-txt-muted)] transition hover:bg-[var(--color-surface2)] hover:text-[var(--color-txt)]"
            aria-label="Close"
            title="Close"
          >
            x
          </button>
        </div>

        <div className="space-y-4 p-5">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-txt-muted)]">
              NUSMods URL
            </span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://nusmods.com/timetable/sem-1/share?..."
              spellCheck={false}
              className={`${inputClass} mt-1.5 bg-[var(--color-surface2)] ${error && url ? 'border-[var(--color-danger)]' : ''}`}
            />
            {error && url && (
              <span className="mt-1.5 block text-xs text-[var(--color-danger)]" role="alert">
                {error}
              </span>
            )}
          </label>

          {preview && previewMods.length > 0 && (
            <div className="rounded-md border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-accent)]">
                Sem {preview.semester} - {previewMods.length} module{previewMods.length === 1 ? '' : 's'}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {previewMods.map((moduleCode) => (
                  <span
                    key={moduleCode}
                    className="rounded border border-[var(--color-border)] bg-[var(--color-surface2)] px-1.5 py-0.5 text-[10px] text-[var(--color-txt-dim)]"
                  >
                    {moduleCode}
                  </span>
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-txt-muted)]">
              Name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={student?.name ?? `Person ${studentCount + 1}`}
              className={`${inputClass} mt-1.5 bg-[var(--color-surface2)]`}
            />
          </label>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-txt-muted)]">
              Colour
            </div>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-9 w-11 shrink-0 cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-surface2)] p-0.5"
              />
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setColor(preset)}
                    aria-label={`Use color ${preset}`}
                    className={`h-6 w-6 rounded-full border-2 transition hover:scale-105 ${color === preset ? 'border-white' : 'border-transparent'}`}
                    style={{ background: preset }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--color-txt-dim)] transition hover:border-[var(--color-border2)] hover:text-[var(--color-txt)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || (!!error && !!url)}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {submitting ? (isEditing ? 'Saving' : 'Adding') : (isEditing ? 'Save' : 'Add')}
          </button>
        </div>
      </div>
    </>
  );
}
