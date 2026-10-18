import { describe, it, expect } from 'vitest';
import { rankCourses } from '../src/recommend.js';

const courses = [
  { slug: 'web', title: 'Web', topic: 'web-development', practicalRatio: 0.8 },
  { slug: 'ds', title: 'Data', topic: 'data-science', practicalRatio: 0.5 },
  { slug: 'design', title: 'Design', topic: 'design', practicalRatio: 0.2 },
];

describe('rankCourses', () => {
  it('ranks an interest match first and includes a reason', () => {
    const r = rankCourses({ courses, interests: ['design'], style: 'unknown', styleConfidence: 0 });
    expect(r[0].course.slug).toBe('design');
    expect(r[0].reasons.join(' ')).toMatch(/interest/i);
  });

  it('every result carries at least one reason', () => {
    const r = rankCourses({ courses, interests: ['web-development'], style: 'practical', styleConfidence: 0.8 });
    for (const row of r) expect(row.reasons.length).toBeGreaterThan(0);
  });

  it('a confident practical learner favors hands-on courses on a style tie-break', () => {
    const r = rankCourses({ courses, interests: [], style: 'practical', styleConfidence: 1 });
    expect(r[0].course.slug).toBe('web'); // practicalRatio 0.8 closest to pref 1
  });

  it('is stable for exact ties (preserves input order)', () => {
    const flat = [
      { slug: 'a', title: 'A', topic: 'x', practicalRatio: 0.5 },
      { slug: 'b', title: 'B', topic: 'x', practicalRatio: 0.5 },
    ];
    const r = rankCourses({ courses: flat, interests: [], style: 'unknown', styleConfidence: 0 });
    expect(r.map((x) => x.course.slug)).toEqual(['a', 'b']);
  });

  it('boosts in-progress courses', () => {
    const r = rankCourses({
      courses,
      interests: [],
      style: 'unknown',
      styleConfidence: 0,
      progressByCourse: { ds: true },
    });
    expect(r[0].course.slug).toBe('ds');
    expect(r[0].reasons.join(' ')).toMatch(/continue/i);
  });
});
