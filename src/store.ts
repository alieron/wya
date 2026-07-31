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

export type AcademicYearModuleCache = Record<string, Record<string, LessonSlot[]>>;
export type ModuleCache = Record<string, AcademicYearModuleCache>;

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
    const res = await fetch(`${import.meta.env.BASE_URL}data/venues.json`);
    const venues = await res.json();
    setState(s => ({ ...s, venueLocations: venues, venueLoaded: true }));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
  }
}

export async function fetchModulesFor(
  student: Student,
  academicYear: string,
  currentCache: AcademicYearModuleCache,
  setState: SetState,
): Promise<void> {
  const parsed = parseNusmodsUrl(student.url);
  if (!parsed) return;

  const needed = Object.keys(parsed.modules).filter(code => !currentCache[code]);
  if (needed.length === 0) return;

  setState(s => ({ ...s, studentLoading: { ...s.studentLoading, [student.id]: true } }));
  const results = await Promise.all(needed.map(async code => {
    try {
      return { code, lessons: await fetchModuleLessons(code, academicYear), error: '' };
    } catch (error) {
      return {
        code,
        lessons: {} as Record<string, LessonSlot[]>,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }));
  setState(s => {
    const yearCache = { ...s.moduleCache[academicYear] };
    for (const { code, lessons } of results) yearCache[code] = lessons;
    const errors = results.flatMap(result => result.error ? [result.error] : []);
    const studentErrors = { ...s.studentErrors };
    if (errors.length) studentErrors[student.id] = errors.join(', ');
    else delete studentErrors[student.id];
    return {
      ...s,
      moduleCache: { ...s.moduleCache, [academicYear]: yearCache },
      studentLoading: { ...s.studentLoading, [student.id]: false },
      studentErrors,
    };
  });
}

export function addStudent(
  url: string,
  name: string,
  color: string | undefined,
  state: AppState,
  setState: SetState,
): void {
  const id = crypto.randomUUID?.() ?? [...crypto.getRandomValues(new Uint32Array(4))].join('-');
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
}

export function updateStudent(id: string, patch: StudentPatch, setState: SetState): void {
  setState(s => {
    const newList = s.students.map(st => st.id === id ? { ...st, ...patch } : st);
    persistStudents(newList);
    return { ...s, students: newList };
  });
}

export function moveStudent(id: string, offset: number, setState: SetState): void {
  setState(s => {
    const from = s.students.findIndex(student => student.id === id);
    const to = Math.min(s.students.length - 1, Math.max(0, from + offset));
    if (from < 0 || from === to) return s;
    const students = [...s.students];
    const [student] = students.splice(from, 1);
    students.splice(to, 0, student);
    persistStudents(students);
    return { ...s, students };
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
