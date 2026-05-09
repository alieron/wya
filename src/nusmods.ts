const API = 'https://api.nusmods.com/v2';

export function currentAY(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface NUSModsLessonSlot {
  lessonType: string;
  classNo: string;
  venue: string;
  day: string;
  startTime: string;
  endTime: string;
  weeks: number[] | Record<string, unknown>;
}

export interface LessonSlot {
  lessonType: string;
  classNo: string;
  lessonIndex: number;
  venue: string;
  day: string;
  startTime: string;
  endTime: string;
  weeks: number[] | Record<string, unknown>;
}

export interface ResolvedSlot extends LessonSlot {
  moduleCode: string;
}

export interface ParsedTimetable {
  semester: string;
  modules: Record<string, ParsedModuleLessonConfig>;
  hidden: string[];
}

export interface VenueLocation {
  roomName: string;
  location: Record<'x' | 'y', number>;
  floor: number;
}

type ParsedLessonSelection =
  | { kind: 'indices'; values: number[] }
  | { kind: 'classNos'; values: string[] };

type ParsedModuleLessonConfig = Record<string, ParsedLessonSelection>;

const LESSON_TYPE_MAP: Record<string, string> = {
  'Lecture': 'LEC',
  'Tutorial': 'TUT',
  'Laboratory': 'LAB',
  'Recitation': 'REC',
  'Seminar-Style Module Class': 'SEM',
  'Design Lecture': 'DLEC',
  'Packaged Laboratory': 'PLAB',
  'Packaged Lecture': 'PLEC',
  'Packaged Tutorial': 'PTUT',
  'Tutorial Type 2': 'TUT2',
  'Tutorial Type 3': 'TUT3',
  'Workshop': 'WS',
  'Mini-Project': 'PROJ',
  'Sectional Teaching': 'SEC',
};

/** Normalize NUSMods lesson type string to standard code, e.g., "Lecture" → "LEC" */
function normalizeLessonType(lt: string): string {
  const trimmed = lt.trim();
  return LESSON_TYPE_MAP[trimmed] ?? trimmed.toUpperCase().replace(/\s+/g, '');
}

// ── API ───────────────────────────────────────────────────────────────────────

export async function fetchModuleLessons(
  moduleCode: string,
  ay = currentAY(),
): Promise<Record<string, LessonSlot[]>> {
  const res = await fetch(`${API}/${ay}/modules/${moduleCode}.json`);
  if (!res.ok) throw new Error(`${moduleCode} not found (${res.status})`);
  const data = await res.json();
  const result: Record<string, LessonSlot[]> = {};
  for (const sem of data.semesterData ?? []) {
    result[String(sem.semester)] = (sem.timetable ?? []).map((l: NUSModsLessonSlot, lessonIndex: number) => ({
      lessonType: l.lessonType,
      classNo: l.classNo,
      lessonIndex,
      venue: l.venue,
      day: l.day,
      startTime: l.startTime,
      endTime: l.endTime,
      weeks: l.weeks,
    }));
  }
  return result;
}


// ── URL parsing ───────────────────────────────────────────────────────────────

function semesterFromPath(pathname: string): string {
  const path = pathname.toLowerCase();
  const semMatch = path.match(/sem-(\d+)/);
  if (semMatch) return semMatch[1];
  if (path.includes('st-ii')) return '4';
  if (path.includes('st-i')) return '3';
  return '1';
}

function parseModuleLessonConfig(serialized: string): ParsedModuleLessonConfig {
  const lessons: ParsedModuleLessonConfig = {};

  // Current NUSMods share links use lesson indices:
  // LEC:(0);TUT:(11,22)
  const indexPattern = /([^:;,]+):\(([^)]*)\)/g;
  let hasIndexFormat = false;
  for (const match of serialized.matchAll(indexPattern)) {
    hasIndexFormat = true;
    const [, type, rawIndices] = match;
    const values = rawIndices
      ? rawIndices
        .split(',')
        .map((i) => parseInt(i, 10))
        .filter(Number.isFinite)
      : [];
    lessons[normalizeLessonType(type)] = { kind: 'indices', values };
  }

  if (hasIndexFormat) return lessons;

  // Old NUSMods v1 links used class numbers:
  // LEC:1,TUT:04,REC:01E
  for (const part of serialized.split(/[;,]/)) {
    const [type, ...classNoParts] = part.split(':');
    const classNo = classNoParts.join(':').trim();
    if (!type || !classNo) continue;
    lessons[normalizeLessonType(type)] = { kind: 'classNos', values: [classNo] };
  }

  return lessons;
}

export function parseNusmodsUrl(url: string): ParsedTimetable | null {
  try {
    const raw = url.trim();
    const u = new URL(raw.startsWith('/') ? raw : raw, raw.startsWith('http') ? undefined : 'https://nusmods.com');

    const semester = semesterFromPath(u.pathname);

    const modules: Record<string, ParsedModuleLessonConfig> = {};
    const hidden: string[] = [];

    for (const [code, lessonStr] of u.searchParams.entries()) {
      if (!code) continue;
      const param = code.toLowerCase();

      if (param === 'hidden') {
        hidden.push(...lessonStr.split(',').map((moduleCode) => moduleCode.toUpperCase()));
        continue;
      }

      if (param === 'ta') continue;

      // empty string means no lessons selected
      if (!lessonStr) {
        modules[code.toUpperCase()] = modules[code.toUpperCase()] ?? {};
        continue;
      }

      const moduleCode = code.toUpperCase();
      modules[moduleCode] = {
        ...(modules[moduleCode] ?? {}),
        ...parseModuleLessonConfig(lessonStr),
      };
    }

    return { semester, modules, hidden };
  } catch (e) {
    console.error('Failed to parse NUSMods URL:', e);
    return null;
  }
}

// ── Schedule resolution ───────────────────────────────────────────────────────

function sameSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function recoveryLessonIndices(lessons: LessonSlot[]): Set<number> {
  const firstLesson = lessons[0];
  if (!firstLesson) return new Set();
  return new Set(
    lessons
      .filter((lesson) => lesson.classNo === firstLesson.classNo)
      .map((lesson) => lesson.lessonIndex),
  );
}

function validateLessonIndices(lessons: LessonSlot[], selected: Set<number> | undefined): Set<number> {
  const firstSelectedIndex = selected?.values().next().value as number | undefined;
  if (!selected?.size || firstSelectedIndex === undefined) return recoveryLessonIndices(lessons);

  const firstSelectedLesson = lessons.find((lesson) => lesson.lessonIndex === firstSelectedIndex);
  if (!firstSelectedLesson) return recoveryLessonIndices(lessons);

  const selectedClassGroup = new Set(
    lessons
      .filter((lesson) => lesson.classNo === firstSelectedLesson.classNo)
      .map((lesson) => lesson.lessonIndex),
  );

  return sameSet(selected, selectedClassGroup)
    ? selectedClassGroup
    : recoveryLessonIndices(lessons);
}

export function resolveSchedule(
  parsed: ParsedTimetable | null,
  moduleCache: Record<string, Record<string, LessonSlot[]>>,
): ResolvedSlot[] {
  if (!parsed) return [];

  const slots: ResolvedSlot[] = [];
  const hidden = new Set(parsed.hidden);

  for (const [moduleCode, selectedLessons] of Object.entries(parsed.modules)) {
    if (hidden.has(moduleCode)) continue;

    const semData = moduleCache[moduleCode]?.[parsed.semester];
    if (!semData) continue;

    const selectedIndicesByType = new Map<string, Set<number>>();

    for (const [lessonType, selection] of Object.entries(selectedLessons)) {
      const normType = normalizeLessonType(lessonType);
      const typeLessons = semData.filter(
        (lesson) => normalizeLessonType(lesson.lessonType) === normType,
      );

      const selected = selection.kind === 'indices'
        ? selection.values
        : typeLessons
          .filter((lesson) => selection.values.includes(lesson.classNo))
          .map((lesson) => lesson.lessonIndex);

      selectedIndicesByType.set(normType, new Set(selected));
    }

    const lessonsByType = semData.reduce<Record<string, LessonSlot[]>>((acc, lesson) => {
      const normType = normalizeLessonType(lesson.lessonType);
      (acc[normType] ??= []).push(lesson);
      return acc;
    }, {});

    for (const typeLessons of Object.values(lessonsByType)) {
      const normType = normalizeLessonType(typeLessons[0]?.lessonType ?? '');
      const validIndices = validateLessonIndices(typeLessons, selectedIndicesByType.get(normType));
      for (const lesson of typeLessons) {
        if (validIndices.has(lesson.lessonIndex)) slots.push({ moduleCode, ...lesson });
      }
    }
  }

  return slots;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export type Day = typeof DAYS[number];

export function timeToMinutes(t: string): number {
  return parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(2), 10);
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`;
}

export function formatMinutes(mins: number): string {
  return formatTime(minutesToTime(mins));
}

export function formatTime(t: string): string {
  const mins = timeToMinutes(t);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

const PALETTE = [
  '#2f80ed', '#16a34a', '#f59e0b', '#dc2626',
  '#7c3aed', '#0891b2', '#db2777', '#4b5563',
  '#0f766e', '#ea580c', '#9333ea', '#64748b',
] as const;

export function defaultColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}
