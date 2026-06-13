"use client";

import { createStore, get, set, del, keys, entries } from "idb-keyval";

/**
 * Two IndexedDB stores back the offline experience:
 *  - the query/mutation cache persister (so jobs render and queued actions
 *    survive a reload while the tech has no signal)
 *  - a binary store for photos, which cannot be serialised into the JSON
 *    mutation cache.
 */
const persisterStore =
    typeof indexedDB !== "undefined" ? createStore("fieldio-offline", "rq-cache") : undefined;
const photoStore =
    typeof indexedDB !== "undefined" ? createStore("fieldio-offline", "photo-blobs") : undefined;

/**
 * AsyncStorage shape expected by @tanstack/query-async-storage-persister.
 * Backed by IndexedDB so it can hold the (potentially large) dehydrated cache.
 */
export const idbPersisterStorage = {
    getItem: async (key: string): Promise<string | null> => {
        if (!persisterStore) return null;
        const value = await get<string>(key, persisterStore);
        return value ?? null;
    },
    setItem: async (key: string, value: string): Promise<void> => {
        if (!persisterStore) return;
        await set(key, value, persisterStore);
    },
    removeItem: async (key: string): Promise<void> => {
        if (!persisterStore) return;
        await del(key, persisterStore);
    },
};

export interface QueuedPhoto {
    jobId: string;
    caption: string;
    blob: Blob;
    fileName: string;
    createdAt: number;
}

/** Persist a photo's bytes so a queued upload survives reload and replays later. */
export async function putPhotoBlob(id: string, photo: QueuedPhoto): Promise<void> {
    if (!photoStore) return;
    await set(id, photo, photoStore);
}

export async function getPhotoBlob(id: string): Promise<QueuedPhoto | undefined> {
    if (!photoStore) return undefined;
    return get<QueuedPhoto>(id, photoStore);
}

export async function delPhotoBlob(id: string): Promise<void> {
    if (!photoStore) return;
    await del(id, photoStore);
}

export async function listPhotoBlobKeys(): Promise<string[]> {
    if (!photoStore) return [];
    return (await keys(photoStore)) as string[];
}

/** All queued photos, oldest first — used by the pending-sync indicator. */
export async function listQueuedPhotos(): Promise<Array<{ id: string; photo: QueuedPhoto }>> {
    if (!photoStore) return [];
    const all = (await entries(photoStore)) as Array<[string, QueuedPhoto]>;
    return all
        .map(([id, photo]) => ({ id, photo }))
        .sort((a, b) => a.photo.createdAt - b.photo.createdAt);
}
