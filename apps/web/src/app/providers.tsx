'use client';

import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';
import { idbPersisterStorage } from '../lib/offline-db';
import { registerOfflineMutationDefaults, OFFLINE_KEYS } from '../lib/offline-mutations';
import { ensureFreshSession } from '../lib/api';

const OFFLINE_KEY_HEADS = new Set(Object.values(OFFLINE_KEYS).map((k) => k.join('|')));

/** Offline persistence is a technician-only feature — field crews lose signal,
 *  office/owner staff don't need their data cached on-device. We read the role
 *  the zustand store persisted to localStorage. */
function isTechnicianDevice(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const raw = window.localStorage.getItem('auth-storage');
        if (!raw) return false;
        return JSON.parse(raw)?.state?.user?.role === 'TECHNICIAN';
    } catch {
        return false;
    }
}

// Non-technicians get this: the cache is never written to disk, so nothing is
// restored and there's no offline queue — normal online behaviour.
const noopStorage = {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
};

/** Only persist queued mutations we know how to replay (have a registered
 *  default mutationFn + serialisable variables). Excludes things like the
 *  receipt-bearing expense mutation whose File variable can't be serialised. */
function isReplayableMutation(mutation: { options?: { mutationKey?: readonly unknown[] }; state: { isPaused: boolean } }) {
    if (!mutation.state.isPaused) return false;
    const key = mutation.options?.mutationKey;
    if (!Array.isArray(key)) return false;
    return OFFLINE_KEY_HEADS.has(key.join('|'));
}

export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => {
        const client = new QueryClient({
            defaultOptions: {
                queries: {
                    staleTime: 60 * 1000,
                    // Keep cached data for a day so the field console renders
                    // with no signal and survives an app reload.
                    gcTime: 24 * 60 * 60 * 1000,
                    retry: 2,
                },
                mutations: {
                    // Default networkMode: mutations fired offline are paused,
                    // persisted, and resumed automatically on reconnect.
                    retry: 3,
                },
            },
        });
        // Register replayable field-action defaults before any persisted
        // paused mutation is restored.
        registerOfflineMutationDefaults(client);
        return client;
    });

    const [isTechnician] = useState(isTechnicianDevice);

    const [persister] = useState(() =>
        createAsyncStoragePersister({
            storage: isTechnician ? idbPersisterStorage : noopStorage,
            key: 'fieldio-rq-cache',
            throttleTime: 1000,
        })
    );

    return (
        <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
                persister,
                maxAge: 24 * 60 * 60 * 1000,
                buster: 'v1',
                dehydrateOptions: {
                    shouldDehydrateMutation: isReplayableMutation,
                },
            }}
            onSuccess={() => {
                if (!isTechnician) return;
                // Cache restored. Prime a valid access token FIRST (single-flight,
                // shared with route bootstrap) so replayed offline mutations carry
                // a fresh Bearer and never trigger a 401 storm on reconnect. Then
                // flush the queue and reconcile with the server.
                ensureFreshSession().finally(() => {
                    queryClient.resumePausedMutations().then(() => {
                        queryClient.invalidateQueries();
                    });
                });
            }}
        >
            {children}
            <ReactQueryDevtools initialIsOpen={false} />
        </PersistQueryClientProvider>
    );
}
