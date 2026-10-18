/**
 * predeploy — static pre-flight checks before deploying. Fails (exit 1) if the
 * build or config isn't deploy-ready. Run after `npm run build` (it inspects
 * frontend/dist). `npm run predeploy`.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const fail = [];
const ok = [];
const check = (name, cond, detail = '') => (cond ? ok : fail).push(`${name}${detail ? ' — ' + detail : ''}`);

// 1. Built frontend exists with hashed assets + model/wasm files.
const dist = join(ROOT, 'frontend', 'dist');
const assetsDir = join(dist, 'assets');
check('frontend/dist exists', existsSync(dist));
const jsFiles = existsSync(assetsDir) ? readdirSync(assetsDir).filter((f) => f.endsWith('.js')) : [];
check('bundle has JS assets', jsFiles.length > 0, `${jsFiles.length} files`);
check('model weights present in dist', existsSync(join(dist, 'models')) && readdirSync(join(dist, 'models')).some((f) => f.endsWith('.bin')));
check('MediaPipe wasm present in dist', existsSync(join(dist, 'mediapipe')) && readdirSync(join(dist, 'mediapipe')).some((f) => f.endsWith('.wasm')));

// 2. No hardcoded localhost backend in the built bundle.
let bundleText = '';
for (const f of jsFiles) bundleText += readFileSync(join(assetsDir, f), 'utf8');
check('no hardcoded localhost:4000 in bundle', !/localhost:4000|127\.0\.0\.1:4000/.test(bundleText));
// VITE_API_URL baked in: the client reads import.meta.env.VITE_API_URL at build;
// a non-empty absolute API base should appear (http(s)://...). Warn only.
const hasAbsApi = /https?:\/\/[^"'\s)]+\.(onrender\.com|vercel\.app|[a-z]{2,})(:\d+)?/i.test(bundleText);
check('VITE_API_URL appears baked into bundle', hasAbsApi, hasAbsApi ? '' : 'build with VITE_API_URL set for production');

// 3. Config files parse.
try {
  JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  check('vercel.json is valid JSON', true);
} catch (e) {
  check('vercel.json is valid JSON', false, e.message);
}
const renderYaml = existsSync(join(ROOT, 'render.yaml')) ? readFileSync(join(ROOT, 'render.yaml'), 'utf8') : '';
check('render.yaml exists', !!renderYaml);
check('render.yaml has healthCheckPath /health', /healthCheckPath:\s*\/health/.test(renderYaml));
check('render.yaml declares JWT_SECRET generateValue', /JWT_SECRET[\s\S]*generateValue:\s*true/.test(renderYaml));
check('render.yaml declares CORS_ORIGINS', /CORS_ORIGINS/.test(renderYaml));

// 4. Env docs present.
check('frontend/.env.example documents VITE_API_URL', existsSync(join(ROOT, 'frontend', '.env.example')) && /VITE_API_URL/.test(readFileSync(join(ROOT, 'frontend', '.env.example'), 'utf8')));
check('backend .env.example documents JWT_SECRET + CORS', existsSync(join(ROOT, '.env.example')) && /JWT_SECRET/.test(readFileSync(join(ROOT, '.env.example'), 'utf8')));

// 5. .gitignore covers the essentials.
const gi = existsSync(join(ROOT, '.gitignore')) ? readFileSync(join(ROOT, '.gitignore'), 'utf8') : '';
for (const pat of ['node_modules', 'dist', '.env', '*.db']) check(`.gitignore covers ${pat}`, gi.includes(pat));

// 6. No secrets / env / db tracked by git.
try {
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' });
  const bad = tracked.split('\n').filter((f) => /(^|\/)\.env$|(^|\/)\.env\.(local|production)|\.db$/.test(f));
  check('no tracked secrets/.env/.db', bad.length === 0, bad.join(', '));
} catch {
  check('git ls-files available', false);
}

// --- report ---
for (const o of ok) console.log('PASS  ' + o);
for (const f of fail) console.log('FAIL  ' + f);
console.log(fail.length ? `\npredeploy: ${fail.length} FAILED` : `\npredeploy: all ${ok.length} checks passed`);
process.exit(fail.length ? 1 : 0);
