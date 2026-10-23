import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { teacherApi } from '../../api/teacher.js';
import { InlineError } from '../../motion/primitives.jsx';

const TOPICS = ['web-development', 'data-science', 'design', 'general'];
const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

export default function TeacherCourseNew() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', description: '', topic: 'general', level: 'Beginner' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) {
      setError('Give your course a title.');
      return;
    }
    setBusy(true);
    try {
      const res = await teacherApi.createCourse({
        title: form.title.trim(),
        description: form.description.trim(),
        topic: form.topic,
        level: form.level,
      });
      navigate(`/teacher/courses/${res.course.id}`);
    } catch (err) {
      setError(err.message || 'Could not create the course');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link to="/teacher/courses" className="text-sm text-slate-400 hover:text-slate-200">← My courses</Link>
        <h1 className="mt-2 text-2xl font-semibold">New course</h1>
        <p className="mt-1 text-sm text-slate-400">Starts as a draft. Add lessons, then publish when ready.</p>
      </div>
      <form onSubmit={submit} className="card space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" className="input" value={form.title} onChange={set('title')} required />
        </div>
        <div>
          <label className="label" htmlFor="description">Description</label>
          <textarea id="description" className="input min-h-[96px]" value={form.description} onChange={set('description')} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="topic">Topic</label>
            <select id="topic" className="input" value={form.topic} onChange={set('topic')}>
              {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="level">Level</label>
            <select id="level" className="input" value={form.level} onChange={set('level')}>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
        {error && <InlineError>{error}</InlineError>}
        <div className="flex justify-end gap-2">
          <Link to="/teacher/courses" className="btn-ghost">Cancel</Link>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create course'}</button>
        </div>
      </form>
    </div>
  );
}
