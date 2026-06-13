import axios from 'axios';
import { useAuthStore } from '../store/auth';

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    withCredentials: true, // Important for HttpOnly cookies
});

// One refresh in flight at a time. Every 401'd request and the app bootstrap
// share this same promise so a reconnecting client (or a tech replaying a
// queue of offline mutations) reauths exactly once instead of stampeding
// /auth/refresh and racing the server's refresh-token rotation.
let refreshPromise: Promise<string | null> | null = null;

/**
 * Ensure we hold a valid access token.
 * @param staleToken the token a caller just had rejected (401). If the store
 *   already rotated to a newer token, we return that without a network call;
 *   otherwise we trigger (or join) the single in-flight refresh.
 */
export function ensureFreshSession(staleToken?: string | null): Promise<string | null> {
    const current = useAuthStore.getState().accessToken;
    if (current && current !== staleToken) {
        return Promise.resolve(current);
    }

    if (!refreshPromise) {
        refreshPromise = api
            .post('/auth/refresh')
            .then((response) => {
                const { user, accessToken } = response.data.data;
                useAuthStore.getState().hydrateSession(user, accessToken);
                return accessToken as string;
            })
            .catch(() => {
                useAuthStore.getState().logout();
                return null;
            })
            .finally(() => {
                refreshPromise = null;
            });
    }

    return refreshPromise;
}

// Request Interceptor: Attach Token
api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response Interceptor: refresh once on 401, then retry the original request.
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !String(originalRequest?.url || '').includes('/auth/refresh')
        ) {
            originalRequest._retry = true;

            const usedToken = String(originalRequest?.headers?.Authorization || '').replace('Bearer ', '') || null;

            try {
                const nextToken = await ensureFreshSession(usedToken);
                if (!nextToken) {
                    if (typeof window !== 'undefined') {
                        window.location.href = '/login';
                    }
                    return Promise.reject(error);
                }
                originalRequest.headers.Authorization = `Bearer ${nextToken}`;
                return api(originalRequest);
            } catch (refreshError) {
                if (typeof window !== 'undefined') {
                    useAuthStore.getState().logout();
                    window.location.href = '/login';
                }
                return Promise.reject(refreshError);
            }
        }

        if (error.response?.status === 403) {
            console.error(`[API] 403 Forbidden Accessing: ${error.config?.url}`, error.response.data);
        }

        return Promise.reject(error);
    }
);

export default api;
