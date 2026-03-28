const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
    ...options,
  })
  if (!response.ok) {
    if (response.status === 401) {
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
      throw new Error('Session expired')
    }
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }
  // 204 No Content has no body
  if (response.status === 204) return null
  return response.json()
}

export const api = {
  // Auth
  getMe: () => request('/auth/me'),
  logout: () => request('/auth/local-logout', { method: 'POST' }),

  // Classes
  listClasses: () => request('/classes'),
  createClass: (body) => request('/classes', { method: 'POST', body: JSON.stringify(body) }),
  getClass: (id) => request(`/classes/${id}`),
  updateClass: (id, body) => request(`/classes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteClass: (id) => request(`/classes/${id}`, { method: 'DELETE' }),
  addMember: (classId, body) =>
    request(`/classes/${classId}/members`, { method: 'POST', body: JSON.stringify(body) }),
  removeMember: (classId, userId) =>
    request(`/classes/${classId}/members/${userId}`, { method: 'DELETE' }),

  // Assignments
  listAssignments: (classId) => request(`/classes/${classId}/assignments`),
  createAssignment: (classId, body) =>
    request(`/classes/${classId}/assignments`, { method: 'POST', body: JSON.stringify(body) }),
  getAssignment: (classId, assignmentId) =>
    request(`/classes/${classId}/assignments/${assignmentId}`),
  updateAssignment: (classId, assignmentId, body) =>
    request(`/classes/${classId}/assignments/${assignmentId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteAssignment: (classId, assignmentId) =>
    request(`/classes/${classId}/assignments/${assignmentId}`, { method: 'DELETE' }),

  // Submissions
  listSubmissions: (classId, assignmentId) =>
    request(`/classes/${classId}/assignments/${assignmentId}/submissions`),
  createSubmission: (classId, assignmentId, body) =>
    request(`/classes/${classId}/assignments/${assignmentId}/submissions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getSubmission: (classId, assignmentId, submissionId) =>
    request(`/classes/${classId}/assignments/${assignmentId}/submissions/${submissionId}`),

  // Rubric ingest (multipart — let browser set Content-Type with boundary)
  ingestRubric: (formData) =>
    request('/rubrics/ingest', { method: 'POST', headers: {}, body: formData }),

  // Rubric CRUD
  getRubric: (classId, assignmentId) =>
    request(`/classes/${classId}/assignments/${assignmentId}/rubric`),
  saveRubric: (classId, assignmentId, body) =>
    request(`/classes/${classId}/assignments/${assignmentId}/rubric`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateRubric: (classId, assignmentId, body) =>
    request(`/classes/${classId}/assignments/${assignmentId}/rubric`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  // RiPPLE CSV import
  importRippleCsv: (classId, assignmentId, formData) =>
    request(`/classes/${classId}/assignments/${assignmentId}/ripple/import`, {
      method: 'POST',
      headers: {},
      body: formData,
    }),
  clearRippleData: (classId, assignmentId) =>
    request(`/classes/${classId}/assignments/${assignmentId}/ripple`, { method: 'DELETE' }),
  getRippleStats: (classId, assignmentId) =>
    request(`/classes/${classId}/assignments/${assignmentId}/ripple/stats`),

  // AI Grading
  startPreviewGrading: (classId, assignmentId, type = 'resource') =>
    request(`/classes/${classId}/assignments/${assignmentId}/grade/preview?type=${type}`, { method: 'POST' }),
  extendPreviewForSpread: (classId, assignmentId, type) =>
    request(`/classes/${classId}/assignments/${assignmentId}/grade/preview/extend${type ? `?type=${type}` : ''}`, { method: 'POST' }),
  clearPreview: (classId, assignmentId) =>
    request(`/classes/${classId}/assignments/${assignmentId}/grade/preview`, { method: 'DELETE' }),
  startGrading: (classId, assignmentId) =>
    request(`/classes/${classId}/assignments/${assignmentId}/grade/start`, { method: 'POST' }),
  cancelGrading: (classId, assignmentId) =>
    request(`/classes/${classId}/assignments/${assignmentId}/grade/cancel`, { method: 'POST' }),
  deleteGrading: (classId, assignmentId) =>
    request(`/classes/${classId}/assignments/${assignmentId}/grade`, { method: 'DELETE' }),
  clearAiGrades: (classId, assignmentId) =>
    request(`/classes/${classId}/assignments/${assignmentId}/grade/ai-grades`, { method: 'DELETE' }),
  getGradeStatus: (classId, assignmentId) =>
    request(`/classes/${classId}/assignments/${assignmentId}/grade/status`),
  getGradeResults: (classId, assignmentId) =>
    request(`/classes/${classId}/assignments/${assignmentId}/grade/results`),
  getGradeReport: (classId, assignmentId) =>
    request(`/classes/${classId}/assignments/${assignmentId}/grade/report`),
  saveTeacherGrade: (classId, assignmentId, resultId, body) =>
    request(`/classes/${classId}/assignments/${assignmentId}/grade/results/${resultId}/teacher`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  openGradeEmail: async (classId, assignmentId, resultId, toEmail) => {
    const qs = toEmail ? `?to_email=${encodeURIComponent(toEmail)}` : ''
    const { to, subject, body } = await request(
      `/classes/${classId}/assignments/${assignmentId}/grade/results/${resultId}/email${qs}`
    )
    window.open(
      `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    )
  },
  openStudentGradeEmail: async (classId, assignmentId, studentId, { toEmail, topic } = {}) => {
    const params = new URLSearchParams()
    if (toEmail) params.set('to_email', toEmail)
    if (topic) params.set('topic', topic)
    const qs = params.toString() ? `?${params}` : ''
    const { to, subject, body } = await request(
      `/classes/${classId}/assignments/${assignmentId}/grade/results/email-student/${encodeURIComponent(studentId)}${qs}`
    )
    const fullUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    // mailto: URIs > ~30 000 chars often silently fail on Windows (shell CreateProcess limit ~32 767).
    // Fall back to clipboard so the body isn't lost.
    if (fullUrl.length > 30000) {
      try { await navigator.clipboard.writeText(body) } catch {}
      window.open(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}`)
      return { clipboardFallback: true }
    }
    window.open(fullUrl)
    return { clipboardFallback: false }
  },

  // Topics
  getTopics: (classId, assignmentId) =>
    request(`/classes/${classId}/assignments/${assignmentId}/topics`),
  getTopicAttachments: (classId, assignmentId, topic) =>
    request(`/classes/${classId}/assignments/${assignmentId}/topics/${encodeURIComponent(topic)}/attachments`),
  uploadTopicAttachment: (classId, assignmentId, topic, formData, signal) =>
    request(`/classes/${classId}/assignments/${assignmentId}/topics/${encodeURIComponent(topic)}/attachments`, {
      method: 'POST',
      headers: {},
      body: formData,
      ...(signal ? { signal } : {}),
    }),
  deleteTopicAttachment: (classId, assignmentId, topic, attachmentId) =>
    request(`/classes/${classId}/assignments/${assignmentId}/topics/${encodeURIComponent(topic)}/attachments/${attachmentId}`, {
      method: 'DELETE',
    }),
}
