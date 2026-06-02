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

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    accessToken: string | null;
    login: (user: User, accessToken: string) => void;
    hydrateSession: (user: User, accessToken: string) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            isAuthenticated: false,
            accessToken: null,
            login: (user, accessToken) => {
                set({ user, isAuthenticated: true, accessToken });
            },
            hydrateSession: (user, accessToken) => {
                set({ user, isAuthenticated: true, accessToken });
            },
            logout: () => {
                set({ user: null, isAuthenticated: false, accessToken: null });
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({ user: state.user }),
        }
    )
);
