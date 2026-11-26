"use client";

import { get, set, del, keys, entries, type UseStore } from "idb-keyval";
import { toast } from "../components/ui/use-toast";

/**
 * IndexedDB stores behind the offline experience, all in one database:
 *  - rq-cache: the query/mutation cache persister (so jobs render and queued
 *    actions survive a reload while the tech has no signal)
 *  - photo-blobs: job photo bytes, which cannot be serialised into the JSON
 *    mutation cache
 *  - receipt-blobs: expense receipts (never swept into the photo gallery)
 *  - form-photo-blobs: photos captured inside a form / CoC, uploaded when the
 *    form submission replays (never touched by the job-photo sweeper)
 *
 * idb-keyval's createStore() only creates its object store when the database is
 * first created, so a second store in the same database never exists. We open
 * the database ourselves at an explicit version and create every missing store
 * in the upgrade — existing data in older stores is kept.
 */
const DB_NAME = "fieldio-offline";
const DB_VERSION = 3;
const STORE_NAMES = ["rq-cache", "photo-blobs", "receipt-blobs", "form-photo-blobs"] as const;
type StoreName = (typeof STORE_NAMES)[number];

// An upgrade is blocked while another tab (e.g. one still on the old bundle)
// holds an older connection open. Give up after this long so the app boots.
const BLOCKED_TIMEOUT_MS = 3_000;
// Absolute cap on an open that neither succeeds, fails nor reports blocked.
const OPEN_TIMEOUT_MS = 10_000;

let dbPromise: Promise<IDBDatabase> | undefined;
let blockedHintShown = false;

function showBlockedHint() {
    if (blockedHintShown) return;
    blockedHintShown = true;
    toast({
        title: "Close other Fieldio tabs to finish updating",
        description: "Offline saving is paused until the other tabs are closed and this page is reloaded.",
        variant: "destructive",
    });
}

function openDatabase(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    const attempt = new Promise<IDBDatabase>((resolve, reject) => {
        let settled = false;
        const fail = (err: unknown) => {
            if (settled) return;
            settled = true;
            clearTimeout(hardTimer);
            if (dbPromise === attempt) dbPromise = undefined;
            reject(err);
        };
        const hardTimer = setTimeout(() => fail(new Error("Offline storage did not open in time")), OPEN_TIMEOUT_MS);

        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            for (const name of STORE_NAMES) {
                if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
            }
        };
        request.onblocked = () => {
            showBlockedHint();
            setTimeout(() => fail(new Error("Offline storage upgrade is blocked by another tab")), BLOCKED_TIMEOUT_MS);
        };
        request.onsuccess = () => {
            const db = request.result;
            // Let a newer tab upgrade the schema instead of being blocked by us.
            db.onversionchange = () => {
                db.close();
                dbPromise = undefined;
            };
            db.onclose = () => {
                dbPromise = undefined;
            };
            if (settled) {
                // We already gave up on this open (blocked); keep it for later calls.
                dbPromise = Promise.resolve(db);
                return;
            }
            settled = true;
            clearTimeout(hardTimer);
            resolve(db);
        };
        request.onerror = () => fail(request.error);
    });
    dbPromise = attempt;
    return attempt;
}

function storeFor(name: StoreName): UseStore {
    return (txMode, callback) =>
        openDatabase().then((db) => callback(db.transaction(name, txMode).objectStore(name)));
}

const hasIndexedDb = typeof indexedDB !== "undefined";
const persisterStore = hasIndexedDb ? storeFor("rq-cache") : undefined;
const photoStore = hasIndexedDb ? storeFor("photo-blobs") : undefined;
// Receipts get their OWN store so they are never swept into the customer photo
// gallery (they used to share photo-blobs under a `receipt-` key, and the photo
// sweeper uploaded them as job photos).
const receiptStore = hasIndexedDb ? storeFor("receipt-blobs") : undefined;
const formPhotoStore = hasIndexedDb ? storeFor("form-photo-blobs") : undefined;

/** Legacy guard: a receipt queued before the split lives in the photo store under
 *  a `receipt-` key. Exclude those from any photo listing so they are never
 *  uploaded as a job photo. */
const isReceiptKey = (id: string) => id.startsWith("receipt-");

/**
 * AsyncStorage shape expected by @tanstack/query-async-storage-persister.
 * Backed by IndexedDB so it can hold the (potentially large) dehydrated cache.
 */
// Set when the saved cache couldn't be read (storage blocked/unavailable). From
// then on this tab never writes the cache: persisting its empty state would
// overwrite the queued field actions saved on disk before they are restored.
let persistDisabled = false;

export const idbPersisterStorage = {
    getItem: async (key: string): Promise<string | null> => {
        if (!persisterStore) return null;
        try {
            const value = await get<string>(key, persisterStore);
            return value ?? null;
        } catch (err) {
            // Boot online with an empty cache rather than hanging on restore.
            persistDisabled = true;
            console.warn("Offline cache unavailable; starting without it", err);
            return null;
        }
    },
    setItem: async (key: string, value: string): Promise<void> => {
        if (!persisterStore || persistDisabled) return;
        await set(key, value, persisterStore).catch((err) => console.warn("Offline cache not saved", err));
    },
    removeItem: async (key: string): Promise<void> => {
        if (!persisterStore || persistDisabled) return;
        await del(key, persisterStore).catch((err) => console.warn("Offline cache not cleared", err));
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

/** A photo captured inside a form, waiting for the form submission to replay. */
export interface QueuedFormPhoto {
    jobId: string;
    caption: string;
    blob: Blob;
    fileName: string;
    createdAt: number;
}

/** Persist a form photo's bytes in its own store (the job-photo sweeper never sees it). */
export async function putFormPhotoBlob(id: string, photo: QueuedFormPhoto): Promise<void> {
    if (!formPhotoStore) throw new Error("Offline storage is not available on this device");
    await set(id, photo, formPhotoStore);
}

export async function getFormPhotoBlob(id: string): Promise<QueuedFormPhoto | undefined> {
    if (!formPhotoStore) return undefined;
    return get<QueuedFormPhoto>(id, formPhotoStore);
}

export async function delFormPhotoBlob(id: string): Promise<void> {
    if (!formPhotoStore) return;
    await del(id, formPhotoStore);
}
