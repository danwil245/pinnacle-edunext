import React from 'react';
import { createRoot } from 'react-dom/client';
import YouTubePlayer from '../../src/pages/lesson/YouTubePlayer.jsx';

// Standalone harness: renders the REAL YouTubePlayer against a REAL video so a
// Playwright run can exercise the production build end to end (no mocks). Player
// callbacks are recorded on window.__yt for assertions. No StrictMode — this
// mirrors the production bundle (no dev double-invoke of effects).
const params = new URLSearchParams(location.search);
const videoId = params.get('v') || 'kUMe1FH4CHE';

window.__yt = { states: [], controllers: [], errors: [] };

function App() {
  return React.createElement(YouTubePlayer, {
    videoId,
    title: 'Harness',
    onState: (s) => window.__yt.states.push(s),
    onController: (c) => window.__yt.controllers.push(c ? c.kind : null),
    onError: (e) => window.__yt.errors.push(e),
  });
}

createRoot(document.getElementById('root')).render(React.createElement(App));
