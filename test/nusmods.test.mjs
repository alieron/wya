import assert from 'node:assert/strict';
import test from 'node:test';
import { academicYearOptions, parseNusmodsUrl, resolveSchedule } from '../src/nusmods.ts';

const url = 'https://nusmods.com/timetable/sem-1/share?CFG2007=SEM:1';
const lesson = (day) => ({
  lessonType: 'Seminar-Style Module Class',
  classNo: '1',
  lessonIndex: 0,
  venue: 'CFG_CARSPA',
  day,
  startTime: '1800',
  endTime: '2100',
  weeks: [1, 2, 3, 4],
});

test('academic years descend from the latest published year', () => {
  assert.deepEqual(academicYearOptions('2026-2027', 3), [
    '2026-2027',
    '2025-2026',
    '2024-2025',
  ]);
});

test('the global semester overrides the semester in a shared URL', () => {
  const parsed = parseNusmodsUrl(url);
  const cache = { CFG2007: { '1': [lesson('Thursday')], '2': [lesson('Monday')] } };
  assert.equal(resolveSchedule(parsed, cache)[0].day, 'Thursday');
  assert.equal(resolveSchedule(parsed, cache, '2')[0].day, 'Monday');
});
