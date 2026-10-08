import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
export const SESSION_EXPIRED_EVENT = 'auth:session-expired';

function isProtectedApi(url) {
  const target = new URL(url, window.location.origin);
  return [window.location.origin, new URL(API_BASE_URL).origin].includes(target.origin)
    && target.pathname.startsWith('/api/')
    && !target.pathname.startsWith('/api/auth/');
}

export function handleUnauthorized(url, authorization) {
  if (!isProtectedApi(url) || !authorization?.startsWith('Bearer ')) return;
  const token = authorization.slice(7);
  // Ignore duplicate responses and responses from a previous login.
  if (!token || localStorage.getItem('token') !== token) return;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('preferencesSkipped');
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

export const apiFetch = async (url, options = {}) => {
  const target = url.startsWith('/api/')
    ? `${API_BASE_URL.replace(/\/$/, '')}${url}`
    : url;
  const headers = new Headers(options.headers);
  const token = localStorage.getItem('token');
  if (isProtectedApi(target) && token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await window.fetch(target, { ...options, headers });
  if (response.status === 401) {
    handleUnauthorized(target, headers.get('Authorization'));
  }
  // Preserve the Response contract for existing callers.
  return response;
};

const inspectAxiosResponse = (response) => {
  if (response?.status === 401) {
    const config = response.config;
    const url = axios.getUri(config);
    const headers = axios.AxiosHeaders.from(config.headers);
    handleUnauthorized(url, headers.get('Authorization'));
  }
};

axios.interceptors.response.use(
  (response) => {
    inspectAxiosResponse(response);
    return response;
  },
  (error) => {
    inspectAxiosResponse(error.response);
    return Promise.reject(error);
  },
);

export default API_BASE_URL;
