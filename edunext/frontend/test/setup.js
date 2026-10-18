import '@testing-library/jest-dom/vitest';

// jsdom has no matchMedia; GSAP/ScrollTrigger and our reduced-motion hook both
// read it. Provide a minimal, inert stub (reports "no preference").
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  });
}

// jsdom has no ResizeObserver; Lenis constructs one. Inert stub for tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
