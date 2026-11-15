// Every date/time in the UI is rendered in the school's timezone.
export const SCHOOL_TZ = 'Asia/Manila';

const TOKEN_KEY = 'attendance_token';
const USER_KEY = 'attendance_user';

export const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  getUser: () => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  },
  save: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
};

class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
  }

  const headers = {};
  const token = auth.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    throw new ApiError('Cannot reach the server. Is the backend running?', 0);
  }

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : {};

  if (!res.ok) {
    if (res.status === 401) auth.clear();
    throw new ApiError(data.message || `Request failed (${res.status})`, res.status, data.details);
  }
  return data;
}

export const api = {
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request('/api/auth/me'),

  getStudents: (params) => request('/api/students', { params }),
  getStudent: (id) => request(`/api/students/${id}`),
  createStudent: (body) => request('/api/students', { method: 'POST', body }),
  updateStudent: (id, body) => request(`/api/students/${id}`, { method: 'PUT', body }),
  deleteStudent: (id) => request(`/api/students/${id}`, { method: 'DELETE' }),

  getAttendance: (params) => request('/api/attendance', { params }),
  // One action: time-in when there is no record yet, otherwise time-out.
  markAttendance: (body) => request('/api/attendance/mark', { method: 'POST', body }),
  getRoster: (params) => request('/api/attendance/roster', { params }),
  excuse: (body) => request('/api/attendance/excuse', { method: 'POST', body }),
  removeExcuse: (params) => request('/api/attendance/excuse', { method: 'DELETE', params }),
  timeIn: (body) => request('/api/attendance/time-in', { method: 'POST', body }),
  timeOut: (body) => request('/api/attendance/time-out', { method: 'POST', body }),
  getDashboard: (params) => request('/api/attendance/dashboard', { params }),

  getNotifications: (params) => request('/api/notifications', { params }),
  markRead: (id) => request(`/api/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => request('/api/notifications/read-all', { method: 'PATCH' }),
  deleteNotification: (id) => request(`/api/notifications/${id}`, { method: 'DELETE' }),

  getSettings: () => request('/api/settings'),
  updateSettings: (body) => request('/api/settings', { method: 'PUT', body }),
  getEventStatus: () => request('/api/settings/event-status')
};

export { ApiError };

/** Small formatting helpers shared by pages. */
export const fmt = {
  time: (value) => {
    if (!value) return '—';
    return new Date(value).toLocaleTimeString('en-PH', {
      timeZone: SCHOOL_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  },
  date: (value) => {
    if (!value) return '—';
    // A plain YYYY-MM-DD is a calendar date: anchor it at noon UTC so the
    // rendered day is identical no matter the browser's timezone.
    const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00Z`)
      : new Date(value);
    return d.toLocaleDateString('en-PH', {
      timeZone: SCHOOL_TZ,
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  },
  dateTime: (value) =>
    value
      ? `${new Date(value).toLocaleDateString('en-PH', {
          timeZone: SCHOOL_TZ,
          month: 'short',
          day: 'numeric'
        })} · ${new Date(value).toLocaleTimeString('en-PH', {
          timeZone: SCHOOL_TZ,
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })}`
      : '—',
  relative: (value) => {
    const diff = (Date.now() - new Date(value).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  },
  lateLabel: (minutes) =>
    minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`,
  // School-local "today" (Asia/Manila), NOT the browser's timezone.
  todayKey: () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: SCHOOL_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
};
