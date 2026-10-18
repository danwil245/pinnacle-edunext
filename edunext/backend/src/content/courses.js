/**
 * Placeholder course content — intentionally placeholder (Section 12) but
 * STRUCTURALLY complete so it can be swapped for real content without code
 * changes. Each lesson ships both a `visual` and a `practical` variant.
 *
 * Video URLs are Google's public sample clips. The UI labels this as
 * placeholder content on every lesson page.
 */
const V = 'https://storage.googleapis.com/gtv-videos-bucket/sample/';

const svgBox = (label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120" role="img">` +
  `<rect x="2" y="2" width="316" height="116" rx="10" fill="none" stroke="currentColor" stroke-width="2"/>` +
  `<text x="160" y="66" text-anchor="middle" font-size="16" fill="currentColor">${label}</text></svg>`;

export const COURSES = [
  {
    slug: 'web-foundations',
    title: 'Modern Web Foundations',
    topic: 'web-development',
    description: 'Build and ship a small web page from scratch — structure, style, and interaction.',
    level: 'Beginner',
    practical_ratio: 0.8,
    lessons: [
      {
        position: 1,
        title: 'HTML Structure',
        duration_s: 90,
        visual: {
          videoUrl: `${V}BigBuckBunny.mp4`,
          keyPoints: [
            'HTML describes the structure of a page with elements.',
            'Semantic tags (header, main, footer) convey meaning.',
            'Attributes configure elements; ids and classes label them.',
            'The document outline helps both users and assistive tech.',
          ],
          diagram: { alt: 'A document tree from html down to body children', svg: svgBox('html → head / body → sections') },
          summary: 'HTML is the skeleton of every page: nested, semantic elements that give content meaning.',
        },
        practical: {
          videoUrl: `${V}ForBiggerFun.mp4`,
          task: {
            title: 'Mark up a short article',
            steps: [
              'Create an index.html with a <!doctype html> and <html> root.',
              'Add a <header> with an <h1> title.',
              'Add a <main> with two <section> blocks and a paragraph each.',
              'Close with a <footer> containing your name.',
            ],
            hints: ['Indent nested elements.', 'Every opening tag needs a closing tag.'],
            expectedOutcome: 'A valid HTML document that outlines cleanly in dev tools.',
          },
          starter: '<!doctype html>\n<html>\n  <head><title>My Article</title></head>\n  <body>\n    <!-- your markup -->\n  </body>\n</html>',
          checklist: ['Has a header with an h1', 'Has a main with two sections', 'Has a footer', 'Validates with no errors'],
        },
      },
      {
        position: 2,
        title: 'Styling with CSS',
        duration_s: 120,
        visual: {
          videoUrl: `${V}ElephantsDream.mp4`,
          keyPoints: [
            'CSS selects elements and declares property/value pairs.',
            'The box model: content, padding, border, margin.',
            'Flexbox lays out items along a main axis.',
            'Colors, spacing, and type set the visual hierarchy.',
          ],
          diagram: { alt: 'The CSS box model layers', svg: svgBox('margin → border → padding → content') },
          summary: 'CSS turns a structured document into a designed page via selectors and the box model.',
        },
        practical: {
          videoUrl: `${V}ForBiggerBlazes.mp4`,
          task: {
            title: 'Style your article',
            steps: [
              'Link a styles.css from your HTML head.',
              'Set a readable font-family and max-width on main.',
              'Use flexbox to lay the header out in a row.',
              'Add consistent spacing with a single spacing scale.',
            ],
            hints: ['Start from the box model outward.', 'Reuse a few spacing values, not many.'],
            expectedOutcome: 'A readable, centered article with consistent spacing.',
          },
          starter: 'main { max-width: 60ch; margin: 0 auto; }',
          checklist: ['Stylesheet linked', 'Readable line length', 'Header uses flexbox', 'Consistent spacing'],
        },
      },
      {
        position: 3,
        title: 'Interactivity with JavaScript',
        duration_s: 150,
        visual: {
          videoUrl: `${V}Sintel.mp4`,
          keyPoints: [
            'JavaScript runs in the browser and reacts to events.',
            'The DOM is a live object model of the page.',
            'Event listeners respond to clicks, input, and more.',
            'Keep logic small and readable; name things well.',
          ],
          diagram: { alt: 'Event flows into a handler that updates the DOM', svg: svgBox('event → handler → DOM update') },
          summary: 'JavaScript adds behavior by listening for events and updating the DOM.',
        },
        practical: {
          videoUrl: `${V}ForBiggerFun.mp4`,
          task: {
            title: 'Add a click counter',
            steps: [
              'Add a <button> and a <span> for the count.',
              'Select both with document.querySelector.',
              'Add a click listener that increments a number.',
              'Write the new value into the span.',
            ],
            hints: ['Keep the count in a variable.', 'textContent is safer than innerHTML here.'],
            expectedOutcome: 'Clicking the button increases the visible count.',
          },
          starter: "const btn = document.querySelector('button');\n// add your listener",
          checklist: ['Button and span exist', 'Listener attached', 'Count increments', 'No console errors'],
        },
      },
    ],
  },
  {
    slug: 'data-science-essentials',
    title: 'Data Science Essentials',
    topic: 'data-science',
    description: 'From raw data to a first model: explore, clean, and reason about data honestly.',
    level: 'Beginner',
    practical_ratio: 0.5,
    lessons: [
      {
        position: 1,
        title: 'Exploring Data',
        duration_s: 120,
        visual: {
          videoUrl: `${V}ElephantsDream.mp4`,
          keyPoints: [
            'Start by understanding the shape and types of your data.',
            'Summary statistics reveal center and spread.',
            'Visualizing distributions catches surprises early.',
            'Always question how the data was collected.',
          ],
          diagram: { alt: 'A table flowing into a histogram', svg: svgBox('rows → summary → histogram') },
          summary: 'Exploration builds intuition before any modeling: types, summaries, and plots.',
        },
        practical: {
          videoUrl: `${V}BigBuckBunny.mp4`,
          task: {
            title: 'Profile a small dataset',
            steps: [
              'Load a CSV of your choice (or the provided sample).',
              'Print the number of rows and columns.',
              'Compute mean and median of one numeric column.',
              'Note one thing that surprised you.',
            ],
            hints: ['Median resists outliers better than mean.', 'Look for missing values.'],
            expectedOutcome: 'A short profile: size, a couple of statistics, and one observation.',
          },
          starter: null,
          checklist: ['Data loaded', 'Row/column counts', 'Mean and median computed', 'One observation noted'],
        },
      },
      {
        position: 2,
        title: 'Cleaning Data',
        duration_s: 120,
        visual: {
          videoUrl: `${V}Sintel.mp4`,
          keyPoints: [
            'Real data is messy: missing, duplicated, inconsistent.',
            'Decide deliberately how to handle missing values.',
            'Document every cleaning step for reproducibility.',
            'Cleaning choices can bias later results.',
          ],
          diagram: { alt: 'Messy rows filtered into tidy rows', svg: svgBox('raw → clean → documented') },
          summary: 'Cleaning is a sequence of explicit, documented decisions — not a single button.',
        },
        practical: {
          videoUrl: `${V}ForBiggerBlazes.mp4`,
          task: {
            title: 'Clean one column',
            steps: [
              'Find a column with missing or inconsistent values.',
              'Choose a strategy (drop, fill, or normalize) and justify it.',
              'Apply it and re-check the summary.',
              'Record what you changed and why.',
            ],
            hints: ['There is rarely one correct strategy.', 'Keep the original for comparison.'],
            expectedOutcome: 'A cleaned column plus a note explaining the choice.',
          },
          starter: null,
          checklist: ['Issue identified', 'Strategy justified', 'Applied and re-checked', 'Change documented'],
        },
      },
      {
        position: 3,
        title: 'A First Model',
        duration_s: 150,
        visual: {
          videoUrl: `${V}ElephantsDream.mp4`,
          keyPoints: [
            'A model maps inputs to a prediction.',
            'Split data into train and test to estimate generalization.',
            'A simple baseline sets the bar to beat.',
            'Metrics must match the question you are asking.',
          ],
          diagram: { alt: 'Train/test split feeding a model and a metric', svg: svgBox('train → model → test → metric') },
          summary: 'Modeling starts simple: a baseline, an honest train/test split, and the right metric.',
        },
        practical: {
          videoUrl: `${V}ForBiggerFun.mp4`,
          task: {
            title: 'Beat a baseline',
            steps: [
              'Pick a target to predict from your dataset.',
              'Make a trivial baseline (e.g. predict the mean/majority).',
              'Fit one simple model and compare on a test split.',
              'Report whether you beat the baseline, honestly.',
            ],
            hints: ['Beating a baseline is the real test.', 'Do not peek at the test set.'],
            expectedOutcome: 'A baseline, a model, and an honest comparison on held-out data.',
          },
          starter: null,
          checklist: ['Target chosen', 'Baseline built', 'Model fit and tested', 'Honest comparison reported'],
        },
      },
    ],
  },
  {
    slug: 'design-principles',
    title: 'Design Principles',
    topic: 'design',
    description: 'The visual fundamentals: hierarchy, type, color, and space — with an eye, not a formula.',
    level: 'Beginner',
    practical_ratio: 0.2,
    lessons: [
      {
        position: 1,
        title: 'Visual Hierarchy',
        duration_s: 90,
        visual: {
          videoUrl: `${V}Sintel.mp4`,
          keyPoints: [
            'Hierarchy guides the eye to what matters first.',
            'Size, weight, color, and position create emphasis.',
            'Contrast separates the primary from the secondary.',
            'Less emphasis everywhere means more emphasis somewhere.',
          ],
          diagram: { alt: 'A layout with one dominant element', svg: svgBox('primary → secondary → tertiary') },
          summary: 'Hierarchy is the deliberate ordering of attention through contrast.',
        },
        practical: {
          videoUrl: `${V}ForBiggerBlazes.mp4`,
          task: {
            title: 'Rank a simple layout',
            steps: ['Take any card UI.', 'Identify its single most important element.', 'Increase its contrast vs the rest.', 'Mute everything secondary.'],
            hints: ['Squint — what stands out?'],
            expectedOutcome: 'A card with one clear focal point.',
          },
          starter: null,
          checklist: ['Focal element chosen', 'Contrast increased', 'Secondary muted', 'Reads at a glance'],
        },
      },
      {
        position: 2,
        title: 'Typography Basics',
        duration_s: 90,
        visual: {
          videoUrl: `${V}ElephantsDream.mp4`,
          keyPoints: [
            'Type sets tone before a word is read.',
            'A limited type scale creates rhythm.',
            'Line length and line height drive readability.',
            'Pair fonts by contrast, not similarity.',
          ],
          diagram: { alt: 'A modular type scale', svg: svgBox('scale: 12 · 16 · 24 · 36') },
          summary: 'Good typography is mostly restraint: a small scale, comfortable measure, clear rhythm.',
        },
        practical: {
          videoUrl: `${V}ForBiggerFun.mp4`,
          task: {
            title: 'Set a readable paragraph',
            steps: ['Pick one font.', 'Set a 45–75 character line length.', 'Tune line-height for comfort.', 'Establish two text sizes only.'],
            hints: ['66 characters is a classic target.'],
            expectedOutcome: 'A comfortable, rhythmic block of text.',
          },
          starter: null,
          checklist: ['One font', 'Good measure', 'Comfortable line-height', 'Two sizes'],
        },
      },
      {
        position: 3,
        title: 'Color & Space',
        duration_s: 120,
        visual: {
          videoUrl: `${V}BigBuckBunny.mp4`,
          keyPoints: [
            'A restrained palette feels intentional.',
            'Whitespace is an active design material.',
            'Contrast ratios matter for accessibility.',
            'Consistent spacing reads as quality.',
          ],
          diagram: { alt: 'One accent color over a neutral scale', svg: svgBox('neutral scale + 1 accent') },
          summary: 'Color and space, used sparingly and consistently, carry most of the perceived polish.',
        },
        practical: {
          videoUrl: `${V}ForBiggerBlazes.mp4`,
          task: {
            title: 'Reduce a palette',
            steps: ['Take a busy design.', 'Reduce to one accent + a neutral scale.', 'Increase whitespace between groups.', 'Check text contrast is at least AA.'],
            hints: ['Remove before you add.'],
            expectedOutcome: 'A calmer design with one accent and clear spacing.',
          },
          starter: null,
          checklist: ['One accent', 'Neutral scale', 'More whitespace', 'AA contrast'],
        },
      },
    ],
  },
];

export default COURSES;
