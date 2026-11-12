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
// Receipts get their OWN store so they are never swept into the customer photo
// gallery (they used to share photo-blobs under a `receipt-` key, and the photo
// sweeper uploaded them as job photos).
const receiptStore =
    typeof indexedDB !== "undefined" ? createStore("fieldio-offline", "receipt-blobs") : undefined;

/** Legacy guard: a receipt queued before the split lives in the photo store under
 *  a `receipt-` key. Exclude those from any photo listing so they are never
 *  uploaded as a job photo. */
const isReceiptKey = (id: string) => id.startsWith("receipt-");

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
    return ((await keys(photoStore)) as string[]).filter((id) => !isReceiptKey(id));
}

/** All queued photos, oldest first — used by the pending-sync indicator and the
 *  photo sweeper. Excludes legacy `receipt-` keys so a receipt is never uploaded
 *  into the customer photo gallery. */
export async function listQueuedPhotos(): Promise<Array<{ id: string; photo: QueuedPhoto }>> {
    if (!photoStore) return [];
    const all = (await entries(photoStore)) as Array<[string, QueuedPhoto]>;
    return all
        .filter(([id]) => !isReceiptKey(id))
        .map(([id, photo]) => ({ id, photo }))
        .sort((a, b) => a.photo.createdAt - b.photo.createdAt);
}

/** Count of queued photos (receipts excluded) — used to cap the upload queue. */
export async function countQueuedPhotos(): Promise<number> {
    return (await listPhotoBlobKeys()).length;
}

/** Persist receipt bytes in the dedicated receipt store (never the photo store). */
export async function putReceiptBlob(id: string, receipt: QueuedPhoto): Promise<void> {
    if (!receiptStore) return;
    await set(id, receipt, receiptStore);
}

/** Fetch a queued receipt. Falls back to the photo store for a receipt queued
 *  before the store split, so an in-flight expense replay still finds its bytes. */
export async function getReceiptBlob(id: string): Promise<QueuedPhoto | undefined> {
    if (receiptStore) {
        const found = await get<QueuedPhoto>(id, receiptStore);
        if (found) return found;
    }
    if (photoStore) return get<QueuedPhoto>(id, photoStore); // legacy location
    return undefined;
}

/** Remove a queued receipt from both the receipt store and the legacy photo store. */
export async function delReceiptBlob(id: string): Promise<void> {
    if (receiptStore) await del(id, receiptStore);
    if (photoStore) await del(id, photoStore).catch(() => undefined); // legacy cleanup
}
