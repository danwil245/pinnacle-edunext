// Copy only the face-api model weights we actually use (TinyFaceDetector +
// FaceExpressionNet) from node_modules into public/models so Vite serves them
// at /models. Runs on postinstall; safe to re-run.
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dest = join(root, 'public', 'models');

// Resolve the installed package regardless of npm-workspace hoisting.
let src = join(root, 'node_modules', '@vladmandic', 'face-api', 'model');
try {
  const require = createRequire(import.meta.url);
  src = join(dirname(require.resolve('@vladmandic/face-api/package.json')), 'model');
} catch {
  // fall back to the literal path above
}

const FILES = [
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model.bin',
  'face_expression_model-weights_manifest.json',
  'face_expression_model.bin',
];

if (!existsSync(src)) {
  console.warn(`[copy-face-models] source not found (${src}); skipping. Emotion will degrade gracefully.`);
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
let copied = 0;
for (const f of FILES) {
  const from = join(src, f);
  if (existsSync(from)) {
    copyFileSync(from, join(dest, f));
    copied += 1;
  } else {
    console.warn(`[copy-face-models] missing ${f}`);
  }
}
console.log(`[copy-face-models] copied ${copied}/${FILES.length} model files to public/models`);

// --- MediaPipe FaceMesh wasm/data assets -----------------------------------
// FaceMesh loads its wasm/data via locateFile. Self-host them (no CDN, works
// offline) by copying the package's shipped assets into public/mediapipe.
const mpRequire = createRequire(import.meta.url);
let mpSrc = join(root, 'node_modules', '@mediapipe', 'face_mesh');
try {
  mpSrc = dirname(mpRequire.resolve('@mediapipe/face_mesh/package.json'));
} catch {
  /* fall back to the literal path above */
}
const mpDest = join(root, 'public', 'mediapipe');
const MP_FILES = [
  'face_mesh.binarypb',
  'face_mesh_solution_packed_assets.data',
  'face_mesh_solution_packed_assets_loader.js',
  'face_mesh_solution_simd_wasm_bin.data',
  'face_mesh_solution_simd_wasm_bin.js',
  'face_mesh_solution_simd_wasm_bin.wasm',
  'face_mesh_solution_wasm_bin.js',
  'face_mesh_solution_wasm_bin.wasm',
];
if (existsSync(mpSrc)) {
  mkdirSync(mpDest, { recursive: true });
  let mp = 0;
  for (const f of MP_FILES) {
    const from = join(mpSrc, f);
    if (existsSync(from)) {
      copyFileSync(from, join(mpDest, f));
      mp += 1;
    }
  }
  console.log(`[copy-face-models] copied ${mp}/${MP_FILES.length} MediaPipe assets to public/mediapipe`);
} else {
  console.warn(`[copy-face-models] MediaPipe source not found (${mpSrc}); camera path will fall back.`);
}
