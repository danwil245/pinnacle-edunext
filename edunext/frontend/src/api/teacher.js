import { api, API_BASE, getToken } from './client.js';

/**
 * Thin wrappers over the teacher API. All routes are owner-checked server-side;
 * these just centralise the paths so the UI never hand-builds URLs.
 */
export const teacherApi = {
  // Content
  listCourses: () => api('/teacher/courses'),
  getCourse: (id) => api(`/teacher/courses/${id}`),
  createCourse: (body) => api('/teacher/courses', { method: 'POST', body }),
  updateCourse: (id, body) => api(`/teacher/courses/${id}`, { method: 'PUT', body }),
  publishCourse: (id) => api(`/teacher/courses/${id}/publish`, { method: 'POST' }),
  unpublishCourse: (id) => api(`/teacher/courses/${id}/unpublish`, { method: 'POST' }),
  archiveCourse: (id) => api(`/teacher/courses/${id}/archive`, { method: 'POST' }),
  deleteCourse: (id, confirm) =>
    api(`/teacher/courses/${id}?confirm=${encodeURIComponent(confirm)}`, { method: 'DELETE' }),
  addLesson: (courseId, body) => api(`/teacher/courses/${courseId}/lessons`, { method: 'POST', body }),
  updateLesson: (courseId, lessonId, body) =>
    api(`/teacher/courses/${courseId}/lessons/${lessonId}`, { method: 'PUT', body }),
  deleteLesson: (courseId, lessonId) =>
    api(`/teacher/courses/${courseId}/lessons/${lessonId}`, { method: 'DELETE' }),
  reorderLessons: (courseId, order) =>
    api(`/teacher/courses/${courseId}/lessons/reorder`, { method: 'POST', body: { order } }),
  checkVideo: (videoId) => api(`/youtube/check?videoId=${encodeURIComponent(videoId)}`),

  // Analytics
  overview: () => api('/teacher/analytics/overview'),
  courseAnalytics: (id) => api(`/teacher/analytics/courses/${id}`),
  courseStudents: (id) => api(`/teacher/analytics/courses/${id}/students`),
  studentDetail: (id, studentId) => api(`/teacher/analytics/courses/${id}/students/${studentId}`),
  /** CSV export URL (opened via an authenticated fetch -> blob download). */
  exportCsvUrl: (id) => `${API_BASE}/api/teacher/analytics/courses/${id}/export.csv`,
};

/** Download the per-student CSV with the bearer token and trigger a save. */
export async function downloadCourseCsv(courseId, filename) {
  const res = await fetch(teacherApi.exportCsvUrl(courseId), {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Could not export CSV');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `course-${courseId}-students.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
