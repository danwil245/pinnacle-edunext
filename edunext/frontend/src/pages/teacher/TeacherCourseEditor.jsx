import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { teacherApi } from '../../api/teacher.js';
import { InlineError } from '../../motion/primitives.jsx';
import { AsyncState, StatusBadge, ConfirmDialog, YouTubeField } from './components.jsx';

const TOPICS = ['web-development', 'data-science', 'design', 'general'];
const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

export default function TeacherCourseEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [fields, setFields] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // { kind:'delete'|'deleteLesson', ... }
  const [editingLesson, setEditingLesson] = useState(null); // lesson id or 'new' or null

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const res = await teacherApi.getCourse(id);
      setCourse(res.course);
      setLessons(res.lessons);
      setFields({
        title: res.course.title,
        description: res.course.description || '',
        topic: res.course.topic,
        level: res.course.level,
        practicalRatio: res.course.practicalRatio,
      });
      setDirty(false);
    } catch (err) {
      setLoadError(err.message || 'Could not load the course');
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  // Unsaved-changes guard (tab close / reload).
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const setField = (k) => (e) => {
    const v = k === 'practicalRatio' ? Number(e.target.value) : e.target.value;
    setFields((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const saveFields = async () => {
    setError('');
    setSaving(true);
    try {
      const res = await teacherApi.updateCourse(id, fields);
      setCourse(res.course);
      setDirty(false);
    } catch (err) {
      setError(err.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const doStatus = async (fn) => {
    setError('');
    setBusy(true);
    try {
      const res = await fn();
      setCourse(res.course);
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const move = async (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= lessons.length) return;
    const next = lessons.slice();
    [next[index], next[target]] = [next[target], next[index]];
    setLessons(next); // optimistic
    try {
      const res = await teacherApi.reorderLessons(id, next.map((l) => l.id));
      setLessons(res.lessons);
    } catch {
      load(); // revert from server on failure
    }
  };

  const confirmDeleteCourse = async () => {
    setBusy(true);
    try {
      await teacherApi.deleteCourse(id, course.slug);
      navigate('/teacher/courses');
    } catch (err) {
      setError(err.message || 'Could not delete');
      setBusy(false);
    }
  };

  const confirmDeleteLesson = async (lessonId) => {
    setBusy(true);
    try {
      await teacherApi.deleteLesson(id, lessonId);
      setConfirm(null);
      load();
    } catch (err) {
      setError(err.message || 'Could not delete lesson');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AsyncState loading={!course && !loadError} error={loadError}>
      {course && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link to="/teacher/courses" className="text-sm text-slate-400 hover:text-slate-200">← My courses</Link>
              <div className="mt-2 flex items-center gap-3">
                <h1 className="text-2xl font-semibold">{course.title}</h1>
                <StatusBadge status={course.status} />
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {course.lessonCount} lessons · {course.studentCount} students · /{course.slug}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={`/teacher/courses/${id}/analytics`} className="btn-ghost">Analytics</Link>
              {course.status !== 'published' && course.status !== 'archived' && (
                <button className="btn-primary" disabled={busy} onClick={() => doStatus(() => teacherApi.publishCourse(id))}>Publish</button>
              )}
              {course.status === 'published' && (
                <button className="btn-ghost" disabled={busy} onClick={() => doStatus(() => teacherApi.unpublishCourse(id))}>Unpublish</button>
              )}
              {course.status !== 'archived' && (
                <button className="btn-ghost" disabled={busy} onClick={() => doStatus(() => teacherApi.archiveCourse(id))}>Archive</button>
              )}
              <button className="btn-danger" disabled={busy} onClick={() => setConfirm({ kind: 'delete' })}>Delete</button>
            </div>
          </div>

          {error && <InlineError>{error}</InlineError>}

          {/* Course fields */}
          <section className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Details</h2>
              {dirty && <span className="text-xs text-amber-300">Unsaved changes</span>}
            </div>
            <div>
              <label className="label" htmlFor="title">Title</label>
              <input id="title" className="input" value={fields.title} onChange={setField('title')} />
            </div>
            <div>
              <label className="label" htmlFor="description">Description</label>
              <textarea id="description" className="input min-h-[80px]" value={fields.description} onChange={setField('description')} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="topic">Topic</label>
                <select id="topic" className="input" value={fields.topic} onChange={setField('topic')}>
                  {[...new Set([fields.topic, ...TOPICS])].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="level">Level</label>
                <select id="level" className="input" value={fields.level} onChange={setField('level')}>
                  {[...new Set([fields.level, ...LEVELS])].map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="pr">Practical ratio ({fields.practicalRatio.toFixed(2)})</label>
                <input id="pr" type="range" min="0" max="1" step="0.1" value={fields.practicalRatio} onChange={setField('practicalRatio')} className="w-full" />
              </div>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary" disabled={!dirty || saving} onClick={saveFields}>{saving ? 'Saving…' : 'Save details'}</button>
            </div>
          </section>

          {/* Lessons */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Lessons</h2>
              {editingLesson !== 'new' && (
                <button className="btn-ghost" onClick={() => setEditingLesson('new')}>Add lesson</button>
              )}
            </div>

            {editingLesson === 'new' && (
              <LessonForm
                courseId={id}
                onCancel={() => setEditingLesson(null)}
                onSaved={() => { setEditingLesson(null); load(); }}
              />
            )}

            {lessons.length === 0 && editingLesson !== 'new' && (
              <p className="py-8 text-center text-sm text-slate-400">No lessons yet — add your first one.</p>
            )}

            <ul className="space-y-3">
              {lessons.map((l, i) =>
                editingLesson === l.id ? (
                  <li key={l.id}>
                    <LessonForm
                      courseId={id}
                      lesson={l}
                      onCancel={() => setEditingLesson(null)}
                      onSaved={() => { setEditingLesson(null); load(); }}
                    />
                  </li>
                ) : (
                  <li key={l.id} className="card flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <button aria-label={`Move ${l.title} up`} className="rounded px-1 text-slate-400 hover:text-white disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                        <button aria-label={`Move ${l.title} down`} className="rounded px-1 text-slate-400 hover:text-white disabled:opacity-30" disabled={i === lessons.length - 1} onClick={() => move(i, 1)}>▼</button>
                      </div>
                      {l.visualThumbnail ? (
                        <img src={l.visualThumbnail} alt="" className="h-12 w-20 rounded object-cover" loading="lazy" />
                      ) : (
                        <div className="h-12 w-20 rounded bg-white/5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-100">{i + 1}. {l.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        visual: {l.visualVideoId || '—'} · practical: {l.practicalVideoId || '—'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link to={`/learn/${l.id}?preview=1`} className="btn-ghost" title="Opens the lesson as a student would see it, without recording">View as student</Link>
                      <button className="btn-ghost" onClick={() => setEditingLesson(l.id)}>Edit</button>
                      <button className="btn-ghost text-rose-300" onClick={() => setConfirm({ kind: 'deleteLesson', lesson: l })}>Delete</button>
                    </div>
                  </li>
                )
              )}
            </ul>
          </section>
        </div>
      )}

      {/* Permanent-delete course dialog (typed slug) */}
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        title="Permanently delete this course?"
        body={
          <>
            <p>This removes the course, its lessons and <b>all student sessions and analytics</b>. This cannot be undone.</p>
            {course && course.studentCount > 0 && (
              <p className="mt-2 text-amber-300">{course.studentCount} student{course.studentCount === 1 ? '' : 's'} have progress here — their sessions will be removed.</p>
            )}
          </>
        }
        confirmText={course?.slug}
        confirmLabel="Delete forever"
        danger
        busy={busy}
        onConfirm={confirmDeleteCourse}
        onCancel={() => setConfirm(null)}
      />

      {/* Delete lesson dialog */}
      <ConfirmDialog
        open={confirm?.kind === 'deleteLesson'}
        title={`Delete "${confirm?.lesson?.title}"?`}
        body={<p>This removes the lesson and any sessions recorded on it. This cannot be undone.</p>}
        confirmLabel="Delete lesson"
        danger
        busy={busy}
        onConfirm={() => confirmDeleteLesson(confirm.lesson.id)}
        onCancel={() => setConfirm(null)}
      />
    </AsyncState>
  );
}

/** Add/edit a lesson. Verifies YouTube links live before enabling save. */
function LessonForm({ courseId, lesson, onCancel, onSaved }) {
  const isEdit = !!lesson;
  const [title, setTitle] = useState(lesson?.title || '');
  const [visualUrl, setVisualUrl] = useState(lesson?.visualVideoId ? `https://youtu.be/${lesson.visualVideoId}` : '');
  const [practicalUrl, setPracticalUrl] = useState(lesson?.practicalVideoId ? `https://youtu.be/${lesson.practicalVideoId}` : '');
  const [visualNotes, setVisualNotes] = useState(lesson?.visualNotes || '');
  const [practicalExercise, setPracticalExercise] = useState(lesson?.practicalExercise || '');
  const [visualOk, setVisualOk] = useState(lesson?.visualVideoId || null);
  const [practicalOk, setPracticalOk] = useState(lesson?.practicalVideoId || null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const headingRef = useRef(null);
  useEffect(() => { headingRef.current?.focus(); }, []);

  const canSave = title.trim() && (visualOk || practicalOk) && !busy;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) return setError('Give the lesson a title.');
    if (!visualOk && !practicalOk) return setError('Add at least one verified YouTube link.');
    setBusy(true);
    const body = {
      title: title.trim(),
      visualUrl: visualUrl.trim() || undefined,
      practicalUrl: practicalUrl.trim() || undefined,
      visualNotes: visualNotes.trim() || undefined,
      practicalExercise: practicalExercise.trim() || undefined,
    };
    try {
      if (isEdit) await teacherApi.updateLesson(courseId, lesson.id, body);
      else await teacherApi.addLesson(courseId, body);
      onSaved();
    } catch (err) {
      setError(err.message || 'Could not save the lesson');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-4 border-sky-400/20">
      <h3 ref={headingRef} tabIndex={-1} className="font-medium outline-none">{isEdit ? 'Edit lesson' : 'New lesson'}</h3>
      <div>
        <label className="label" htmlFor="l-title">Title</label>
        <input id="l-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <YouTubeField id="l-visual" label="Visual video URL" value={visualUrl} onChange={setVisualUrl} onValidity={setVisualOk} optional />
        <YouTubeField id="l-practical" label="Practical video URL" value={practicalUrl} onChange={setPracticalUrl} onValidity={setPracticalOk} optional />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="l-notes">Visual notes</label>
          <textarea id="l-notes" className="input min-h-[72px]" value={visualNotes} onChange={(e) => setVisualNotes(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="l-ex">Practical exercise</label>
          <textarea id="l-ex" className="input min-h-[72px]" value={practicalExercise} onChange={(e) => setPracticalExercise(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-slate-500">At least one video is required. A missing variant reuses the other so the lesson always plays.</p>
      {error && <InlineError>{error}</InlineError>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={!canSave}>{busy ? 'Saving…' : isEdit ? 'Save lesson' : 'Add lesson'}</button>
      </div>
    </form>
  );
}
