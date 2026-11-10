import axios from 'axios';
import { useAuthStore } from '../store/auth';

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    withCredentials: true, // Important for HttpOnly cookies
    // Fail fast on patchy signal instead of hanging a request forever (which
    // would leave the tech staring at a spinner). Long uploads (photos,
    // receipts) can opt out per-request with e.g. `api.post(url, body,
    // { timeout: 0 })` or a larger value.
    timeout: 20000,
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
            .catch((error) => {
                const status = error?.response?.status;
                // Only a definitive rejection from the auth server ends the
                // session. A tech opening the app with no signal must NOT be
                // logged out — that would wipe the cached jobs and the offline
                // mutation queue before they ever load.
                if (status === 401 || status === 403) {
                    useAuthStore.getState().logout();
                    return null;
                }
                // Network error / timeout / 5xx: we never learned the session is
                // invalid. Keep the persisted user and fall back to the on-device
                // cache; we retry refresh on the next 'online' event (wired in
                // providers) or the next request that 401s.
                if (useAuthStore.getState().user) {
                    useAuthStore.getState().markSessionUnverified();
                }
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
            originalRequest &&
            !originalRequest._retry &&
            !String(originalRequest?.url || '').includes('/auth/refresh')
        ) {
            originalRequest._retry = true;

            const usedToken = String(originalRequest?.headers?.Authorization || '').replace('Bearer ', '') || null;

            // ensureFreshSession never throws — it resolves to a token, or null.
            // On null it has already decided whether this was a real logout
            // (401/403 → user cleared) or a transient failure (user kept).
            const nextToken = await ensureFreshSession(usedToken);
            if (!nextToken) {
                // Only bounce to /login when the session was actually revoked.
                // If the refresh failed for a network reason the user is still
                // present (session 'unverified'); leave them on their cached view
                // and let react-query surface the error — do NOT redirect (that
                // would throw away the offline session) and do NOT loop.
                if (typeof window !== 'undefined' && !useAuthStore.getState().user) {
                    window.location.href = '/login';
                }
                return Promise.reject(error);
            }
            originalRequest.headers.Authorization = `Bearer ${nextToken}`;
            return api(originalRequest);
        }

        if (error.response?.status === 403) {
            console.error(`[API] 403 Forbidden Accessing: ${error.config?.url}`, error.response.data);
        }

        return Promise.reject(error);
    }
);

export default api;
