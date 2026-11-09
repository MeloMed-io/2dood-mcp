// Demo mode seed: a fictional student, Maya Chen (college sophomore, biology
// major, climbs and runs). Every date is relative to `now` in local time, from
// 42 days back to 14 days ahead. The anchors below are shared with the
// Nocturne demo, so keep them in step:
//   day -24 to -21  stressed week before the CHEM 201 midterm (day -21, done)
//   day -10 to -8   rough patch: missed tasks, a fight with her roommate
//   day -3          BIO 210 lab report due, turned in late on day -2
//   day +4          CHEM 201 exam 2
//   day +9          BIO 210 problem set
//   day +12         internship application due
//   weekly          climbing gym Tue/Thu, long run Sun, call mom Sun
import { randomUUID } from 'node:crypto';
import type { Task } from './tasks.ts';
import { PRIORITY, type PriorityName } from './tasks.ts';

export const DEMO_PERSONA = 'Maya Chen (college sophomore, biology major, climbs and runs)';

export const DEMO_DAYS_BACK = 42;
export const DEMO_DAYS_AHEAD = 14;
export const ROUGH_PATCH = [-10, -8] as const;

type Seed = {
  day: number | null; // null = undated
  at?: [number, number]; // local hour, minute (default 23:59 for dated tasks)
  title: string;
  priority?: PriorityName;
  notes?: string;
  /** done on the due day, done on another day (number), or still open */
  done?: boolean | number;
};

const ONE_OFF: Seed[] = [
  { day: -42, title: 'BIO 210 read ch 1 and 2', done: true },
  { day: -38, title: 'CHEM 201 problem set 1', priority: 'medium', done: true },
  { day: -35, title: 'ENG 105 personal essay draft', priority: 'medium', done: true },
  { day: -33, at: [9, 0], title: 'BIO 210 lab 1 prelab', done: true },
  { day: -31, title: 'CHEM 201 problem set 2', priority: 'medium', done: true },
  { day: -28, title: 'ENG 105 personal essay final', priority: 'high', done: true },
  { day: -26, title: 'CHEM 201 problem set 3', priority: 'medium', done: true },
  {
    day: -24,
    title: 'CHEM 201 midterm review sheet',
    priority: 'high',
    notes: 'Chapters 1 to 6. Kinetics is the weak spot.',
    done: true,
  },
  { day: -23, at: [15, 0], title: 'CHEM 201 office hours', notes: 'Bring the rate law questions.', done: true },
  { day: -22, at: [20, 0], title: 'CHEM 201 practice midterm', priority: 'high', done: true },
  {
    day: -21,
    at: [10, 0],
    title: 'CHEM 201 midterm',
    priority: 'high',
    notes: 'Science hall room 210. Calculator and two pencils.',
    done: true,
  },
  { day: -17, title: 'ENG 105 reading response ch 3', done: true },
  { day: -15, title: 'CHEM 201 problem set 4', priority: 'medium', done: true },
  { day: -12, title: 'BIO 210 lab 2 data analysis', priority: 'medium', done: true },
  // rough patch
  { day: -10, title: 'ENG 105 peer review comments', priority: 'medium' },
  {
    day: -9,
    title: 'CHEM 201 problem set 5',
    priority: 'medium',
    notes: 'Missed it. Ask the TA if late work gets partial credit.',
  },
  { day: -9, at: [16, 0], title: 'Grocery run' },
  { day: -8, title: 'BIO 210 read ch 7' },
  {
    day: -8,
    at: [21, 0],
    title: 'Talk to roommate about the fight',
    notes: 'Start with the dishes schedule, not the noise thing. Listen first.',
    done: -7,
  },
  // recovery
  { day: -7, at: [14, 0], title: 'Drop-in hours at the campus wellness center', done: true },
  { day: -6, at: [10, 0], title: 'Email CHEM 201 TA about problem set 5', done: true },
  { day: -5, title: 'ENG 105 reading response ch 5', done: true },
  { day: -4, at: [18, 0], title: 'Make a new weekly plan', done: true },
  {
    day: -3,
    title: 'BIO 210 lab report: enzyme kinetics',
    priority: 'high',
    notes: 'Turned in a day late, 10 percent off. Next time start the discussion section early.',
    done: -2,
  },
  { day: -2, at: [17, 0], title: 'Pick up package from the mailroom' },
  { day: -1, title: 'CHEM 201 problem set 6', priority: 'medium', done: true },
  // now and ahead
  { day: 0, at: [9, 0], title: 'BIO 210 lab 3 prelab' },
  { day: 0, title: 'ENG 105 essay 2 outline', priority: 'medium' },
  { day: 1, at: [19, 0], title: 'CHEM 201 exam 2 study group', notes: 'Library, third floor.' },
  { day: 2, at: [15, 0], title: 'Resume review at the career center', priority: 'medium' },
  { day: 3, at: [20, 0], title: 'CHEM 201 practice exam 2', priority: 'high' },
  { day: 4, at: [10, 0], title: 'CHEM 201 exam 2', priority: 'high', notes: 'Covers chapters 7 to 11.' },
  { day: 5, at: [12, 0], title: 'Ask BIO 210 professor for a reference', priority: 'medium' },
  { day: 6, title: 'ENG 105 essay 2 draft', priority: 'medium' },
  { day: 8, title: 'Internship cover letter draft', priority: 'medium' },
  { day: 9, title: 'BIO 210 problem set 4', priority: 'high' },
  {
    day: 12,
    title: 'Internship application due',
    priority: 'high',
    notes: 'Summer research internship. Resume, cover letter, unofficial transcript, one reference.',
  },
  { day: 13, title: 'ENG 105 essay 2 final', priority: 'high' },
  // undated
  { day: null, title: 'Look into summer research labs on campus', notes: 'Ecology and microbiology groups first.' },
  { day: null, title: 'Replace chalk bag' },
  { day: null, title: 'Plan a weekend trip home' },
  { day: null, title: 'Fix bike brakes' },
  { day: null, title: 'Return library books', done: true },
];

/** Weekly routines, generated for every matching weekday in range. */
const WEEKLY: { weekday: number; at: [number, number]; title: string }[] = [
  { weekday: 2, at: [18, 0], title: 'Climbing gym' }, // Tue
  { weekday: 4, at: [18, 0], title: 'Climbing gym' }, // Thu
  { weekday: 0, at: [8, 0], title: 'Long run' }, // Sun
  { weekday: 0, at: [19, 0], title: 'Call mom' }, // Sun
];

function atDay(now: Date, day: number, [h, m]: [number, number]) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, h, m, 0, 0);
}

function toTask(now: Date, s: Seed): Task {
  const due = s.day === null ? null : atDay(now, s.day, s.at ?? [23, 59]);
  let completed: Date | null = null;
  if (s.done === true) completed = due ? new Date(Math.min(due.getTime(), now.getTime())) : atDay(now, -5, [12, 0]);
  else if (typeof s.done === 'number') completed = atDay(now, s.done, [16, 30]);
  // Created a few days ahead of the due date, never in the future.
  const createdDay = s.day === null ? -20 : Math.min(s.day - 5, 0);
  const created = new Date(Math.min(atDay(now, createdDay, [10, 0]).getTime(), now.getTime()));
  return {
    id: randomUUID(),
    title: s.title,
    body: s.notes ?? null,
    status: s.done === undefined || s.done === false ? 'open' : 'done',
    due_at: due?.toISOString() ?? null,
    completed_at: completed?.toISOString() ?? null,
    priority: PRIORITY[s.priority ?? 'none'],
    source: 'app',
    created_at: created.toISOString(),
  };
}

/** The demo task list, dated relative to `now` (local timezone). */
export function seedDemoTasks(now: Date = new Date()): Task[] {
  const seeds: Seed[] = [...ONE_OFF];
  for (let day = -DEMO_DAYS_BACK; day <= DEMO_DAYS_AHEAD; day++) {
    const weekday = atDay(now, day, [12, 0]).getDay();
    const inRoughPatch = day >= ROUGH_PATCH[0] && day <= ROUGH_PATCH[1];
    for (const w of WEEKLY) {
      if (w.weekday !== weekday) continue;
      const due = atDay(now, day, w.at);
      // Past routines got done, except during the rough patch.
      seeds.push({ day, at: w.at, title: w.title, done: due < now && !inRoughPatch });
    }
  }
  return seeds
    .map((s) => toTask(now, s))
    .sort((a, b) => (a.due_at ?? '9').localeCompare(b.due_at ?? '9'));
}
