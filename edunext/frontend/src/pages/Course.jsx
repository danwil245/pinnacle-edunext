import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { Loading, ErrorState } from './Home.jsx';
import { Reveal, Stagger } from '../motion/primitives.jsx';

const TOPIC_LABELS = { 'web-development': 'Web Development', 'data-science': 'Data Science', design: 'Design' };

export default function Course() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    api(`/courses/${slug}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [slug]);

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;

  const { course, lessons, servedStyle, progress } = data;
  const styleNote =
    servedStyle.style === 'unknown'
      ? 'Lessons alternate between styles while we learn your preference.'
      : `Lessons are served in your ${servedStyle.style} style (with occasional variety).`;

  return (
    <div className="space-y-6">
      <nav className="text-sm text-slate-400">
        <Link to="/home" className="hover:text-slate-200">Home</Link> <span aria-hidden>/</span>{' '}
        <span className="text-slate-300">{course.title}</span>
      </nav>

      <Reveal as="header" className="space-y-2">
        <span className="pill">{TOPIC_LABELS[course.topic] || course.topic}</span>
        <h1>{course.title}</h1>
        <p className="text-slate-300">{course.description}</p>
        <p className="text-xs text-slate-400">
          {progress.completed}/{progress.total} complete · {styleNote}
        </p>
      </Reveal>

      <Stagger as="ol" className="space-y-3">
        {lessons.map((l) => (
          <li key={l.id} className="card flex items-center justify-between gap-4 transition hover:border-sky-400/30">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                  l.completed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-slate-300'
                }`}
                aria-hidden
              >
                {l.completed ? '✓' : l.position}
              </span>
              <div>
                <div className="font-medium">{l.title}</div>
                <div className="text-xs text-slate-400">
                  ~{Math.round(l.durationS / 60)} min {l.completed && '· completed'}
                </div>
              </div>
            </div>
            <Link to={`/learn/${l.id}`} className={l.completed ? 'btn-ghost' : 'btn-primary'}>
              {l.completed ? 'Review' : 'Start'}
            </Link>
          </li>
        ))}
      </Stagger>

      <p className="text-center text-xs text-slate-500">Placeholder content for this university demo.</p>
    </div>
  );
}
