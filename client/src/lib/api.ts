import axios from 'axios';
import { getToken } from './auth';

const resolveBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim();
  }

  // During local development only, fall back to localhost
  if (import.meta.env.DEV) {
    return 'http://localhost:4000/api';
  }

  // In production, VITE_API_BASE_URL MUST be set.
  // This will fail fast and visibly instead of silently hitting localhost.
  console.error(
    '[PharmaFind] VITE_API_BASE_URL is not set. ' +
    'Set it in your Vercel project environment variables to point to your deployed API server. ' +
    'Example: https://your-server.railway.app/api'
  );
  return '/api'; // relative — will 404 but shows a clear network error instead of ERR_CONNECTION_REFUSED
};

export const api = axios.create({
  baseURL: resolveBaseUrl()
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = 'Bearer ' + token;
  }
  return config;
});
