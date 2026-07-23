import { useMemo, useState } from 'react';
import { Link2, Palette } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { parseNusmodsUrl, defaultColor } from './nusmods';
import { addStudent, updateStudent } from './store';
import type { AppState, Student } from './store';

const PRESETS = [
  '#2f80ed', '#16a34a', '#f59e0b', '#dc2626',
  '#7c3aed', '#0891b2', '#db2777', '#64748b',
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
    if (!preview) {
      setError('This does not look like a NUSMods share URL');
      return false;
    }
    if (!previewMods.length) {
      setError('No modules found in this URL');
      return false;
    }
    setError('');
    return true;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit person' : 'Add a timetable'}</DialogTitle>
            <DialogDescription>
              Paste one NUSMods share link. We only store it in this browser.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="nusmods-url">
                <Link2 />
                NUSMods URL
              </FieldLabel>
              <Input
                id="nusmods-url"
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  if (error) setError('');
                }}
                placeholder="https://nusmods.com/timetable/sem-1/share?..."
                spellCheck={false}
                autoFocus
                aria-invalid={Boolean(error)}
              />
              <FieldError>{error}</FieldError>
            </Field>

            {preview && previewMods.length > 0 && (
              <div className="flex flex-wrap gap-1.5 rounded-md border bg-muted p-3" aria-label="Imported modules">
                <Badge>Sem {preview.semester}</Badge>
                {previewMods.map((moduleCode) => (
                  <Badge key={moduleCode} variant="outline">{moduleCode}</Badge>
                ))}
              </div>
            )}

            <Field>
              <FieldLabel htmlFor="person-name">Name</FieldLabel>
              <Input
                id="person-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={student?.name ?? `Person ${studentCount + 1}`}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="person-color">
                <Palette />
                Colour
              </FieldLabel>
              <div className="flex min-h-11 flex-wrap items-center gap-2">
                <Input
                  id="person-color"
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  className="size-10 shrink-0 p-1"
                />
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setColor(preset)}
                    aria-label={`Use colour ${preset}`}
                    aria-pressed={color === preset}
                    className="size-8 rounded-full border-2 border-background outline-offset-2 transition-transform active:scale-95 aria-pressed:outline-2 aria-pressed:outline-primary"
                    style={{ backgroundColor: preset }}
                  />
                ))}
              </div>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? 'Saving' : isEditing ? 'Save person' : 'Add person'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
