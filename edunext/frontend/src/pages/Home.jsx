import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Reveal, Stagger } from '../motion/primitives.jsx';

const TOPIC_LABELS = { 'web-development': 'Web Development', 'data-science': 'Data Science', design: 'Design' };

export default function Home() {
  const { profile } = useAuth();
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/courses')
      .then((d) => setCourses(d.courses))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!courses) return <HomeSkeleton />;

  const inProgress = courses.filter((c) => c.progress.completed > 0 && c.progress.completed < c.progress.total);

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-4 flex items-end justify-between">
          <h1>Recommended for you</h1>
          <ProfileChip profile={profile} />
        </div>
        <Stagger immediate className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <CourseCard key={c.slug} course={c} />
          ))}
        </Stagger>
      </section>

      {inProgress.length > 0 && (
        <section>
          <Reveal as="h2" className="mb-3" immediate>Continue learning</Reveal>
          <Stagger immediate className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inProgress.map((c) => (
              <CourseCard key={c.slug} course={c} compact />
            ))}
          </Stagger>
        </section>
      )}
    </div>
  );
}

function CourseCard({ course, compact }) {
  const { title, topic, description, reasons, progress, slug, level } = course;
  const done = progress.completed;
  return (
    <Link
      to={`/courses/${slug}`}
      className="card group flex flex-col gap-3 transition duration-300 will-change-transform hover:-translate-y-1 hover:border-sky-400/40 hover:bg-white/[0.08] hover:shadow-xl hover:shadow-sky-500/10"
    >
      <div className="flex items-center justify-between">
        <span className="pill">{TOPIC_LABELS[topic] || topic}</span>
        <span className="text-xs text-slate-500">{level}</span>
      </div>
      <h3 className="font-display text-lg font-semibold leading-tight group-hover:text-sky-300">{title}</h3>
      {!compact && <p className="text-sm text-slate-400">{description}</p>}
      {reasons?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {reasons.slice(0, 2).map((r, i) => (
            <span key={i} className="pill border-sky-400/20 bg-sky-500/10 text-sky-200">
              <span aria-hidden>✦</span> {r}
            </span>
          ))}
        </div>
      )}
      <div className="mt-auto flex items-center justify-between pt-1 text-xs text-slate-400">
        <span>{done} / {progress.total} lessons</span>
        <span className="font-medium text-sky-300 transition group-hover:translate-x-0.5">
          {done > 0 ? 'Continue →' : 'Start →'}
        </span>
      </div>
    </Link>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <div className="h-8 w-56 skeleton" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card space-y-3">
            <div className="h-5 w-24 skeleton" />
            <div className="h-6 w-3/4 skeleton" />
            <div className="h-4 w-full skeleton" />
            <div className="h-4 w-5/6 skeleton" />
            <div className="mt-2 h-4 w-20 skeleton" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading your recommended courses…</span>
    </div>
  );
}

function ProfileChip({ profile }) {
  if (!profile) return null;
  const style = profile.learningStyle;
  return (
    <div className="hidden text-right text-xs text-slate-400 sm:block">
      <div>
        Style: <b className="capitalize text-slate-200">{style}</b>
        {style !== 'unknown' && <> ({Math.round(profile.styleConfidence * 100)}%)</>}
      </div>
      {profile.interests?.length > 0 && (
        <div>Interests: {profile.interests.map((t) => TOPIC_LABELS[t] || t).join(', ')}</div>
      )}
    </div>
  );
}

export function Loading() {
  return <div className="py-16 text-center text-slate-400" role="status">Loading…</div>;
}
export function ErrorState({ message }) {
  return (
    <div className="card border-rose-500/30 bg-rose-500/5 text-rose-200" role="alert">
      <h2>Something went wrong</h2>
      <p className="mt-1 text-sm">{message}</p>
    </div>
  );
}
