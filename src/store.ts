import { defaultColor, fetchModuleLessons, parseNusmodsUrl } from './nusmods';
import type { LessonSlot, VenueLocation } from './nusmods';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Student {
  id: string;
  name: string;
  color: string;
  url: string;
  addedAt: number;
}

export type StudentPatch = Partial<Pick<Student, 'name' | 'color' | 'url'>>;

export type ModuleCache = Record<string, Record<string, LessonSlot[]>>;

export interface AppState {
  students: Student[];
  moduleCache: ModuleCache;
  venueLocations: Record<string, VenueLocation>;
  venueLoaded: boolean;
  studentLoading: Record<string, boolean>;
  studentErrors: Record<string, string>;
}

// ── Persistence ───────────────────────────────────────────────────────────────

const STUDENTS_KEY = 'nusmods_tracker_students';

export function loadStudents(): Student[] {
  try {
    const raw = localStorage.getItem(STUDENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function persistStudents(list: Student[]): void {
  localStorage.setItem(STUDENTS_KEY, JSON.stringify(list));
}

// ── Actions (pure async functions that call setState) ─────────────────────────
// These take a React setState dispatcher so there is no singleton state here.
// state lives in the React tree where it belongs.

type SetState = React.Dispatch<React.SetStateAction<AppState>>;

// https://github.com/nusmodifications/nusmods/blob/master/website/src/data/venues.json

export async function loadVenues(setState: SetState): Promise<void> {
  try {
    const res = await fetch('/data/venues.json');
    const venues = await res.json();
    setState(s => ({ ...s, venueLocations: venues, venueLoaded: true }));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
  }
}

export async function fetchModulesFor(
  student: Student,
  currentCache: ModuleCache,
  setState: SetState,
): Promise<void> {
  const parsed = parseNusmodsUrl(student.url);
  if (!parsed) return;

  const needed = Object.keys(parsed.modules).filter(code => !currentCache[code]);
  if (needed.length === 0) return;

  setState(s => ({ ...s, studentLoading: { ...s.studentLoading, [student.id]: true } }));
  try {
    const results = await Promise.all(
      needed.map(async code => ({ code, lessons: await fetchModuleLessons(code) }))
    );
    setState(s => {
      const newCache = { ...s.moduleCache };
      for (const { code, lessons } of results) newCache[code] = lessons;
      return { ...s, moduleCache: newCache, studentLoading: { ...s.studentLoading, [student.id]: false } };
    });
  } catch (e) {
    setState(s => ({
      ...s,
      studentLoading: { ...s.studentLoading, [student.id]: false },
      studentErrors: { ...s.studentErrors, [student.id]: e instanceof Error ? e.message : String(e) },
    }));
  }
}

export async function addStudent(
  url: string,
  name: string,
  color: string | undefined,
  state: AppState,
  setState: SetState,
): Promise<void> {
  const id = crypto.randomUUID();
  const student: Student = {
    id,
    name: name.trim() || `Person ${state.students.length + 1}`,
    color: color || defaultColor(state.students.length),
    url: url.trim(),
    addedAt: Date.now(),
  };
  const newList = [...state.students, student];
  persistStudents(newList);
  setState(s => ({ ...s, students: newList }));
  if (!state.venueLoaded) loadVenues(setState);
  await fetchModulesFor(student, state.moduleCache, setState);
}

export function updateStudent(id: string, patch: StudentPatch, setState: SetState): void {
  setState(s => {
    const newList = s.students.map(st => st.id === id ? { ...st, ...patch } : st);
    persistStudents(newList);
    return { ...s, students: newList };
  });
}

export function removeStudent(id: string, setState: SetState): void {
  setState(s => {
    const newList = s.students.filter(st => st.id !== id);
    persistStudents(newList);
    const studentLoading = { ...s.studentLoading };
    const studentErrors = { ...s.studentErrors };
    delete studentLoading[id];
    delete studentErrors[id];
    return { ...s, students: newList, studentLoading, studentErrors };
  });
}

export function initialState(): AppState {
  return {
    students: loadStudents(),
    moduleCache: {},
    venueLocations: {},
    venueLoaded: false,
    studentLoading: {},
    studentErrors: {},
  };
}
