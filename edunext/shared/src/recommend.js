import { CONFIG } from './config.js';

/**
 * Small symmetric topic-adjacency table: related topics lend a fraction of
 * interest so a learner who picked one still sees sensible neighbours.
 */
const TOPIC_ADJACENCY = {
  'web-development': { 'data-science': 0.3, design: 0.3 },
  'data-science': { 'web-development': 0.3 },
  design: { 'web-development': 0.3 },
};

function interestScore(topic, interests) {
  if (interests.includes(topic)) return 1;
  let best = 0;
  for (const i of interests) {
    const adj = TOPIC_ADJACENCY[i]?.[topic] ?? 0;
    if (adj > best) best = adj;
  }
  return best;
}

/**
 * Rank courses for a learner.
 * @param {object} args
 * @param {{slug:string, title:string, topic:string, practicalRatio:number}[]} args.courses
 * @param {string[]} args.interests
 * @param {string} args.style  'visual'|'practical'|'balanced'|'unknown'
 * @param {number} args.styleConfidence  0..1
 * @param {Record<string, number>} [args.sessionsByTopic]  topic -> mean score (0..100)
 * @param {Record<string, boolean>} [args.progressByCourse] course slug -> in progress
 * @returns {{course:object, score:number, reasons:string[]}[]}
 */
export function rankCourses({
  courses = [],
  interests = [],
  style = 'unknown',
  styleConfidence = 0,
  sessionsByTopic = {},
  progressByCourse = {},
}) {
  const basePref = style === 'practical' ? 1 : style === 'visual' ? 0 : 0.5;
  // Blend toward 0.5 by (1 - confidence): unsure => treat as balanced.
  const effectivePref = 0.5 + (basePref - 0.5) * styleConfidence;

  const { W_INTEREST, W_STYLE, W_HISTORY, IN_PROGRESS_BOOST } = CONFIG.RECOMMEND;

  const ranked = courses.map((course, idx) => {
    const interest = interestScore(course.topic, interests);
    const styleMatch = 1 - Math.abs(course.practicalRatio - effectivePref);
    const topicMean = sessionsByTopic[course.topic];
    const history = Number.isFinite(topicMean) ? topicMean / 100 : 0.5;
    const inProgress = !!progressByCourse[course.slug];

    const score =
      W_INTEREST * interest +
      W_STYLE * styleMatch +
      W_HISTORY * history +
      (inProgress ? IN_PROGRESS_BOOST : 0);

    const reasons = [];
    if (interest >= 1) reasons.push(`Matches your interest in ${titleCase(course.topic)}`);
    else if (interest > 0) reasons.push(`Related to your interests`);
    if (styleConfidence > 0 && styleMatch >= 0.75) {
      if (course.practicalRatio >= 0.6) reasons.push('Hands-on heavy, which suits your practical learning style');
      else if (course.practicalRatio <= 0.4) reasons.push('Visual-led, which suits your visual learning style');
      else reasons.push('A balanced mix, matching how you engage');
    }
    if (Number.isFinite(topicMean) && topicMean >= 60) {
      reasons.push('You engaged well with similar lessons');
    }
    if (inProgress) reasons.push('Continue where you left off');
    if (reasons.length === 0) reasons.push('A good place to start');

    return { course, score, reasons, _idx: idx };
  });

  // Descending score; stable on ties (preserve original order).
  ranked.sort((a, b) => b.score - a.score || a._idx - b._idx);
  return ranked.map(({ _idx, ...rest }) => rest);
}

function titleCase(slug) {
  return String(slug)
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
