'use client';

import { QueryClient, onlineManager, type Mutation } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useEffect, useState } from 'react';
import { idbPersisterStorage } from '../lib/offline-db';
import { registerOfflineMutationDefaults, OFFLINE_KEYS } from '../lib/offline-mutations';
import { ensureFreshSession } from '../lib/api';
import { useAuthStore } from '../store/auth';
import { isRetryableError } from '../lib/network-error';

const OFFLINE_KEY_HEADS = new Set(Object.values(OFFLINE_KEYS).map((k) => k.join('|')));

/** Offline persistence is a technician-only feature — field crews lose signal,
 *  office/owner staff don't need their data cached on-device. We read the LIVE
 *  role from the auth store (its source of truth) rather than a value captured
 *  at mount, so a login that happens after mount is picked up. */
function currentUserIsTechnician(): boolean {
    return useAuthStore.getState().user?.role === 'TECHNICIAN';
}

// Non-technicians get this: the cache is never written to disk, so nothing is
// restored and there's no offline queue — normal online behaviour.
const noopStorage = {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
};

/** Storage that resolves its backing store on EVERY call. This is what makes
 *  the persister decision reactive: if the user logs in as a technician after
 *  the provider mounted, the next setItem lands in IndexedDB; office users
 *  always hit the no-op store, so their data is never cached on-device. */
const reactivePersisterStorage = {
    getItem: (key: string) =>
        (currentUserIsTechnician() ? idbPersisterStorage : noopStorage).getItem(key),
    setItem: (key: string, value: string) =>
        (currentUserIsTechnician() ? idbPersisterStorage : noopStorage).setItem(key, value),
    removeItem: (key: string) =>
        (currentUserIsTechnician() ? idbPersisterStorage : noopStorage).removeItem(key),
};

/** Decide which queued mutations survive a reload. We keep the mutationKey
 *  allow-list (only actions with a registered replayable default + serialisable
 *  variables — e.g. the receipt File on an expense can't be serialised), AND we
 *  broaden WHICH states persist: not just paused (offline), but also pending
 *  (mid-retry) and errored-with-a-retryable-error. Without that, a reload during
 *  a flaky reconnect would silently drop an in-flight field action. */
function isReplayableMutation(mutation: Mutation) {
    const key = mutation.options?.mutationKey;
    if (!Array.isArray(key) || !OFFLINE_KEY_HEADS.has(key.join('|'))) return false;

    const { isPaused, status, failureReason } = mutation.state;
    if (isPaused) return true; // queued offline, waiting for signal
    if (status === 'pending') return true; // in flight / mid-retry when we reloaded
    // Errored but only because of a transient failure: it will keep retrying, so
    // don't lose it across a reload. A 4xx rejection is final — let it drop.
    if (status === 'error' && isRetryableError(failureReason)) return true;
    return false;
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
                    // Retry at most twice, and only for transient failures. A 4xx
                    // (incl. 401/403/404) is final — retrying wastes signal and
                    // delays showing the cached data.
                    retry: (failureCount, error) => isRetryableError(error) && failureCount < 2,
                },
                mutations: {
                    // Default networkMode: mutations fired offline are paused,
                    // persisted, and resumed automatically on reconnect.
                    // Keep retrying a field action for as long as the failure is
                    // transient (network/timeout/5xx/429) — a tech's edit must not
                    // be dropped after a few misses — but stop immediately on a 4xx
                    // (the server rejected it; retrying can't fix that).
                    retry: (_failureCount, error) => isRetryableError(error),
                    // Capped exponential backoff: 1s, 2s, 4s … up to 60s, so a long
                    // outage doesn't hammer the API the instant signal flickers.
                    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 60_000),
                },
            },
        });
        // Register replayable field-action defaults before any persisted
        // paused mutation is restored.
        registerOfflineMutationDefaults(client);
        return client;
    });

    const [persister] = useState(() =>
        createAsyncStoragePersister({
            // Reactive storage: picks IndexedDB for technicians / no-op for office
            // on every call, so the choice follows the logged-in user's role.
            storage: reactivePersisterStorage,
            key: 'fieldio-rq-cache',
            throttleTime: 1000,
        })
    );

    // Take over online/offline detection so that when signal returns we refresh
    // the session BEFORE react-query auto-resumes paused mutations. Otherwise the
    // whole offline queue replays with a stale/empty Bearer and the server answers
    // with a burst of 401s. react-query's own QueryClient subscription resumes the
    // paused mutations once we flip online → true, so we deliberately do NOT call
    // resumePausedMutations() here (that would double-resume).
    useEffect(() => {
        onlineManager.setEventListener((setOnline) => {
            if (typeof window === 'undefined') return () => undefined;
            const onOnline = () => {
                void ensureFreshSession().finally(() => setOnline(true));
            };
            const onOffline = () => setOnline(false);
            window.addEventListener('online', onOnline);
            window.addEventListener('offline', onOffline);
            return () => {
                window.removeEventListener('online', onOnline);
                window.removeEventListener('offline', onOffline);
            };
        });
    }, []);

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
                // Only technicians have a restored on-device cache/queue to flush.
                if (!currentUserIsTechnician()) return;
                // Cache restored (app start). Prime a valid access token FIRST
                // (single-flight, shared with route bootstrap) so replayed offline
                // mutations carry a fresh Bearer and never trigger a 401 storm.
                // This is the reload/restore path; the reconnect path is handled by
                // the onlineManager listener above — the two don't overlap.
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
