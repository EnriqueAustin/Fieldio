import axios from 'axios';
import { useAuthStore } from '../store/auth';

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    withCredentials: true, // Important for HttpOnly cookies
});

let refreshPromise: Promise<string | null> | null = null;

// Request Interceptor: Attach Token
api.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response Interceptor: Handle Refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // If 401 and not already retrying
        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !String(originalRequest?.url || '').includes('/auth/refresh')
        ) {
            originalRequest._retry = true;

            try {
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
                const nextToken = await refreshPromise;
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
