import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    name?: string;
    role: string;
    companyId: string;
    companyName: string;
}

/**
 * - authenticated:   refresh succeeded this session; we hold a live access token.
 * - unverified:      we have a persisted user but refresh failed for a NETWORK
 *                    reason (offline / timeout / 5xx). The session is probably
 *                    still valid — we just couldn't confirm it — so the UI keeps
 *                    rendering from the persisted cache and retries later.
 * - unauthenticated: no session (logged out, or refresh returned 401/403).
 */
export type SessionStatus = 'authenticated' | 'unverified' | 'unauthenticated';

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    accessToken: string | null;
    sessionStatus: SessionStatus;
    login: (user: User, accessToken: string) => void;
    hydrateSession: (user: User, accessToken: string) => void;
    /** Refresh failed for a network reason — keep the user, drop no data. */
    markSessionUnverified: () => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            isAuthenticated: false,
            accessToken: null,
            sessionStatus: 'unauthenticated',
            login: (user, accessToken) => {
                set({ user, isAuthenticated: true, accessToken, sessionStatus: 'authenticated' });
            },
            hydrateSession: (user, accessToken) => {
                set({ user, isAuthenticated: true, accessToken, sessionStatus: 'authenticated' });
            },
            markSessionUnverified: () => {
                // Keep the persisted user and any cached data; we just lack a
                // confirmed token. isAuthenticated/accessToken stay false/null so
                // requests don't send a stale Bearer, but ProtectedRoute treats a
                // persisted user + 'unverified' as "render the cached UI".
                set({ sessionStatus: 'unverified' });
            },
            logout: () => {
                set({ user: null, isAuthenticated: false, accessToken: null, sessionStatus: 'unauthenticated' });
            },
        }),
        {
            name: 'auth-storage',
            // Persist ONLY the user (never the access token — that lives in memory
            // and is re-minted via /auth/refresh). This is what lets a tech reopen
            // the app with no signal and still have an identity to render against.
            partialize: (state) => ({ user: state.user }),
        }
    )
);
