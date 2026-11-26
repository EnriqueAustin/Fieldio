"use client";

import type { Mutation, QueryClient } from "@tanstack/react-query";
import api from "./api";
import {
    getPhotoBlob,
    delPhotoBlob,
    getReceiptBlob,
    delReceiptBlob,
    getFormPhotoBlob,
    delFormPhotoBlob,
} from "./offline-db";

/**
 * Mutation keys shared between the technician field UI and the resumable
 * defaults registered here. Components fire `mutate(vars)` against these keys;
 * the default mutationFn is what replays a queued/paused mutation after the
 * tech regains signal — including across a page reload, where the original
 * component closure is gone.
 */
export const OFFLINE_KEYS = {
    status: ["job", "status"] as const,
    checklist: ["job", "checklist"] as const,
    note: ["job", "note"] as const,
    lineItemAdd: ["job", "lineItem", "add"] as const,
    lineItemRemove: ["job", "lineItem", "remove"] as const,
    signature: ["job", "signature"] as const,
    expense: ["job", "expense"] as const,
    photo: ["job", "photo"] as const,
    fieldQuote: ["job", "fieldQuote"] as const,
    fieldInvoice: ["job", "fieldInvoice"] as const,
    formSubmit: ["job", "formSubmit"] as const,
    summary: ["job", "summary"] as const,
    onMyWay: ["job", "onMyWay"] as const,
    vanStockUse: ["van", "stock", "use"] as const,
    vanStockAdjust: ["van", "stock", "adjust"] as const,
    vanRestock: ["van", "stock", "restock"] as const,
};

/** Hashed heads of every replayable key — used to tell a field mutation apart
 *  from any other mutation in the cache (persistence filter, banner, outbox). */
export const OFFLINE_KEY_HEADS = new Set(Object.values(OFFLINE_KEYS).map((k) => k.join("|")));

/**
 * Serialisation scopes. react-query runs mutations that share a `scope.id`
 * strictly one-at-a-time in enqueue order (verified against query-core 5.101.0:
 * MutationCache.canRun only lets the first *pending* scoped mutation run, and
 * runNext() resumes the next *paused* one in array/insert order; a failed one is
 * no longer "pending" so it never blocks the rest). Without a scope the offline
 * queue replays in parallel and COMPLETED can land before ON_SITE.
 *
 * The core field-ops chain (status/checklist/line items/note/signature/quote/
 * invoice/form) shares ONE scope so those replay in the order the tech tapped —
 * this is what guarantees status ordering and that a line-item remove never
 * overtakes its add. Blob uploads (photos, expense receipts) are slow on patchy
 * signal, so they get their own scopes: a 30s photo upload must NOT sit in front
 * of a COMPLETED, or that status would land late with a stale `clientAt` and the
 * server would skip the customer SMS.
 *
 * NOTE on per-job scope: the contract asks for `scope: { id: job:<jobId> }` so
 * different jobs replay in parallel. react-query resolves scope from the
 * *observer's static options* at mutate() time (MutationObserver.build), not
 * from the mutate() variables — and these hooks are instantiated once in
 * technician-view.tsx (not in this worker's scope) with no jobId, so the shared
 * observer can't know the job. A single stable scope is fully correct here (a
 * tech is one person replaying one FIFO queue) and only trades cross-job
 * parallelism. To get true per-job scope, pass `scope: jobScope(jobId)` into the
 * useMutation() call once the technician-view owner threads the active jobId into
 * the hooks; `jobScope` is exported for exactly that.
 */
export const FIELD_OPS_SCOPE = { id: "fieldio:field-ops" } as const;
const PHOTO_SCOPE = { id: "fieldio:upload-photo" } as const;
const EXPENSE_SCOPE = { id: "fieldio:upload-expense" } as const;
// Van stock draws/adjusts/restocks replay in tap order among themselves, but on
// their own scope so a slow restock can't sit in front of a job status change.
const VAN_STOCK_SCOPE = { id: "fieldio:van-stock" } as const;

/** Per-job scope helper (see note above) for when a hook knows its jobId. */
export function jobScope(jobId: string) {
    return { id: `job:${jobId}` };
}

/** A fresh idempotency key (uuid v4). Generated ONCE per action and stored in the
 *  mutation variables so it survives persistence and is reused on every replay —
 *  a repeat of the same key makes the server return the original 2xx instead of
 *  creating a duplicate. Exported for the photo hook (owned by another worker). */
export function newClientMutationId(): string {
    const c = typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
        const r = (Math.random() * 16) | 0;
        const v = ch === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/** Header object carrying an idempotency key (empty when absent so spreading it
 *  into an axios config is always safe). Exported for the photo hook. */
export function idempotencyHeaders(id: string | undefined): Record<string, string> {
    return id ? { "Idempotency-Key": id } : {};
}

// Small JSON field writes. On "bars but no data" a request can hang for the full
// client default; capping it lets the retryer try again sooner. Safe to retry:
// the same Idempotency-Key makes a slow first success replay, never double up.
// Payload-heavy writes (signature image, receipt, photo, PDF summary) keep the
// longer default.
const FIELD_REQUEST_TIMEOUT_MS = 15_000;

function fieldRequest(clientMutationId: string | undefined) {
    return { headers: idempotencyHeaders(clientMutationId), timeout: FIELD_REQUEST_TIMEOUT_MS };
}

/** Stamp a stable idempotency key onto the variables object if it has none yet.
 *  Runs in onMutate (once per action, never on a restored/replayed execute), so
 *  the key is written into mutation.state.variables before the mutation is
 *  persisted and is identical on every retry and across reloads. */
function stampId(variables: { clientMutationId?: string }) {
    if (variables && !variables.clientMutationId) variables.clientMutationId = newClientMutationId();
}

const ASSIGNED_JOBS_KEY = ["technician-assigned-jobs"];
const MY_WEEK_KEY = ["my-week"];
// My Schedule's copy of the same /jobs/assigned/me feed.
const MY_OPEN_JOBS_KEY = ["my-open-jobs"];

/** Apply a transform to one job inside every cached assigned-jobs list. */
function patchJob(qc: QueryClient, jobId: string, fn: (job: any) => any) {
    const apply = (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((job) => (job.id === jobId ? fn({ ...job }) : job));
    };
    qc.setQueriesData({ queryKey: ASSIGNED_JOBS_KEY }, apply);
    qc.setQueriesData({ queryKey: MY_OPEN_JOBS_KEY }, apply);
}

/** Patch a job's status inside every cached My Schedule (week) calendar list. */
function patchWeekEventStatus(qc: QueryClient, jobId: string, status: string) {
    qc.setQueriesData({ queryKey: MY_WEEK_KEY }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((ev) =>
            ev.id === jobId
                ? { ...ev, extendedProps: { ...ev.extendedProps, status } }
                : ev
        );
    });
}

/** Bump one van-inventory item's quantity optimistically (delta or absolute). */
function patchVanItemQty(qc: QueryClient, vanId: string, itemId: string, delta: number) {
    qc.setQueriesData({ queryKey: ["van-inventory", vanId] }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((i) =>
            i.id === itemId ? { ...i, quantity: Math.max(0, (i.quantity ?? 0) + delta) } : i
        );
    });
}

/** Field-ops (status/checklist/…) mutations still queued or in flight. */
function pendingFieldOps(qc: QueryClient) {
    return qc.isMutating({ predicate: (m) => m.options.scope?.id === FIELD_OPS_SCOPE.id });
}

function refetchFieldLists(qc: QueryClient) {
    return Promise.all([
        qc.invalidateQueries({ queryKey: ASSIGNED_JOBS_KEY }),
        qc.invalidateQueries({ queryKey: MY_WEEK_KEY }),
        qc.invalidateQueries({ queryKey: MY_OPEN_JOBS_KEY }),
    ]);
}

/**
 * Reconcile the field lists with the server once the field-ops FIFO queue has
 * drained — never while later taps are still queued, or the refetch would
 * overwrite their optimistic status with the server's older one (offering the
 * tech a button they already pressed). Driven by the MutationCache rather than
 * each default's onSettled, so every field-ops action — including ones with no
 * onSettled, and a rejected one whose optimistic status must be rolled back —
 * ends in exactly one refetch when the queue empties.
 */
function refetchWhenFieldOpsDrain(qc: QueryClient) {
    qc.getMutationCache().subscribe((event) => {
        const mutation = event.mutation;
        if (!mutation || mutation.options.scope?.id !== FIELD_OPS_SCOPE.id) return;
        const pending = mutation.state.status === "pending";
        // Settled (success/error), or a still-queued action discarded from the
        // outbox — its optimistic patch needs undoing. Ignore gc of settled ones.
        const finished =
            (event.type === "updated" && !pending) || (event.type === "removed" && pending);
        if (!finished) return;
        if (pendingFieldOps(qc) > 0) return;
        void refetchFieldLists(qc);
    });
}

/**
 * For callers outside the field-ops scope (uploads, live socket pushes):
 * refetch now when the queue is idle. Otherwise do nothing — the drain refetch
 * above runs when the queue empties, so the refresh is deferred, not lost.
 */
export function refreshFieldQueriesWhenIdle(qc: QueryClient) {
    if (pendingFieldOps(qc) > 0) return Promise.resolve();
    return refetchFieldLists(qc);
}

const tempId = () => `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** A form photo answer as queued on the phone: bytes live in IndexedDB. */
interface QueuedFormPhotoRef {
    blobId: string;
}

const isQueuedFormPhoto = (v: unknown): v is QueuedFormPhotoRef =>
    !!v && typeof v === "object" && typeof (v as QueuedFormPhotoRef).blobId === "string";

/** Every form-photo blob id referenced by a queued submission's answers. */
export function formPhotoBlobIds(data: Record<string, unknown>): string[] {
    return Object.values(data).flatMap((v) => (Array.isArray(v) ? v.filter(isQueuedFormPhoto).map((p) => p.blobId) : []));
}

// Inline fallback limits — must stay under the API's per-photo cap (450k chars),
// and all inline photos together under its 2 MB request body limit (leaving room
// for the signature and the other answers).
const INLINE_MAX_EDGE = 1024;
const INLINE_MAX_CHARS = 440_000;
const INLINE_TOTAL_MAX_CHARS = 1_400_000;

/** A form submission that can never succeed as queued (retrying won't help). */
class PermanentFormError extends Error {}

/** True when a failed form submission is final: bad data, too large, or our own size check. */
function isPermanentFormFailure(error: unknown): boolean {
    if (error instanceof PermanentFormError) return true;
    const status = (error as { response?: { status?: number } } | null)?.response?.status;
    return status === 400 || status === 413 || status === 422;
}

function deleteFormPhotos(data: Record<string, unknown> | undefined) {
    if (!data) return Promise.resolve();
    return Promise.all(formPhotoBlobIds(data).map((id) => delFormPhotoBlob(id).catch(() => undefined))).then(() => undefined);
}

type FormSubmitVars = { data?: Record<string, unknown>; detached?: boolean } | undefined;

/**
 * Form photo bytes belong to their queued submission. When the tech discards a
 * queued one from the outbox, or a detached (sheet already closed) one that
 * failed is garbage-collected, nothing can replay it any more, so free the
 * blobs. Blobs of a failed submit whose sheet is still open belong to the sheet
 * (it cleans up on close), and blobs another live submission still references
 * (a resubmit reuses them) are never touched.
 */
function cleanupFormPhotosOnRemoval(qc: QueryClient) {
    const head = OFFLINE_KEYS.formSubmit.join("|");
    const isFormSubmit = (m: Mutation<any, any, any, any>) => {
        const key = m.options.mutationKey;
        return Array.isArray(key) && key.join("|") === head;
    };
    qc.getMutationCache().subscribe((event) => {
        if (event.type !== "removed" || !event.mutation || !isFormSubmit(event.mutation)) return;
        const { status } = event.mutation.state;
        const vars = event.mutation.state.variables as FormSubmitVars;
        if (status === "success") return; // its blobs were deleted when it landed
        if (status !== "pending" && !vars?.detached) return;

        const stillUsed = new Set(
            qc
                .getMutationCache()
                .getAll()
                .filter((m) => m !== event.mutation && isFormSubmit(m) && m.state.status !== "success")
                .flatMap((m) => formPhotoBlobIds((m.state.variables as FormSubmitVars)?.data ?? {}))
        );
        const ids = formPhotoBlobIds(vars?.data ?? {}).filter((id) => !stillUsed.has(id));
        void Promise.all(ids.map((id) => delFormPhotoBlob(id).catch(() => undefined)));
    });
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/**
 * Shrink a photo to a small inline JPEG data URL. Only used when the server has
 * no photo storage configured (upload returns 503), so the certificate still
 * carries its evidence.
 */
async function blobToInlineJpeg(blob: Blob): Promise<string> {
    const bitmap = await createImageBitmap(blob);
    try {
        let edge = INLINE_MAX_EDGE;
        for (let attempt = 0; attempt < 4; attempt += 1) {
            const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            const ctx = canvas.getContext("2d");
            if (!ctx) break;
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
            if (dataUrl.length <= INLINE_MAX_CHARS) return dataUrl;
            edge = Math.round(edge * 0.7);
        }
    } finally {
        bitmap.close?.();
    }
    const raw = await blobToDataUrl(blob);
    if (raw.length <= INLINE_MAX_CHARS && /^data:image\/(png|jpeg);base64,/.test(raw)) return raw;
    throw new Error("A form photo is too large to attach. Retake it and try again.");
}

/**
 * Upload each queued form photo to the job's gallery (so it shows with the job
 * photos) and swap its blob reference for the server photo id. The blob id is
 * the upload's Idempotency-Key, so a replay after a partial upload reuses the
 * photos that already landed instead of duplicating them.
 */
async function resolveFormPhotos(
    jobId: string,
    data: Record<string, unknown>
): Promise<{ data: Record<string, unknown>; inline: boolean }> {
    const out: Record<string, unknown> = { ...data };
    let inline = false;
    let inlineChars = 0;
    for (const [key, value] of Object.entries(data)) {
        if (!Array.isArray(value) || !value.some(isQueuedFormPhoto)) continue;
        const resolved: unknown[] = [];
        for (const item of value) {
            if (!isQueuedFormPhoto(item)) {
                resolved.push(item);
                continue;
            }
            const queued = await getFormPhotoBlob(item.blobId);
            if (!queued) {
                throw new Error("A photo for this form is missing from this device. Open the form again and retake it.");
            }
            const formData = new FormData();
            formData.append("photo", queued.blob, queued.fileName);
            if (queued.caption.trim()) formData.append("caption", queued.caption.trim());
            try {
                const res = await api.post(`/media/jobs/${jobId}/photos`, formData, {
                    headers: idempotencyHeaders(item.blobId),
                    timeout: 120000,
                });
                const photoId = res.data?.data?.photo?.id;
                if (typeof photoId !== "string") throw new Error("Photo upload returned no photo id");
                resolved.push({ photoId });
            } catch (err: any) {
                if (err?.response?.status !== 503) throw err;
                const dataUrl = await blobToInlineJpeg(queued.blob);
                inlineChars += dataUrl.length;
                if (inlineChars > INLINE_TOTAL_MAX_CHARS) {
                    throw new PermanentFormError(
                        "This form has too many photos to send while photo storage is unavailable. Remove some photos and submit it again."
                    );
                }
                resolved.push({ dataUrl });
                inline = true;
            }
        }
        out[key] = resolved;
    }
    return { data: out, inline };
}

/**
 * Register replayable defaults for every field action. Called once when the
 * QueryClient is created. Optimistic onMutate keeps the UI truthful offline;
 * onSettled reconciles against the server once the mutation actually lands.
 *
 * Every replayable mutation: (1) carries a scope so the offline queue replays in
 * order, and (2) stamps an Idempotency-Key in onMutate and sends it as a header,
 * so a replay/retry can never create a duplicate.
 */
/** A tap replayed later than this was made somewhere else: its position would give a wrong ETA. */
const START_ROUTE_FIX_MAX_TAP_AGE_MS = 2 * 60_000;
const START_ROUTE_FIX_TIMEOUT_MS = 4_000;

/**
 * Best-effort position for "Start route". Resolves undefined (never rejects)
 * on a stale replayed tap, no geolocation, denial or timeout, so the status
 * change is never blocked or failed by it.
 */
function startRouteLocation(clientAt: string | undefined) {
    const tappedAt = clientAt ? Date.parse(clientAt) : Date.now();
    if (!Number.isFinite(tappedAt) || Date.now() - tappedAt > START_ROUTE_FIX_MAX_TAP_AGE_MS) {
        return Promise.resolve(undefined);
    }
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return Promise.resolve(undefined);
    return new Promise<{ lat: number; lng: number; accuracy: number } | undefined>((resolve) => {
        // Hard cap in case the browser never calls back (e.g. a pending prompt).
        const timer = setTimeout(() => resolve(undefined), START_ROUTE_FIX_TIMEOUT_MS + 500);
        navigator.geolocation.getCurrentPosition(
            ({ coords }) => {
                clearTimeout(timer);
                resolve({ lat: coords.latitude, lng: coords.longitude, accuracy: Math.round(coords.accuracy) });
            },
            () => {
                clearTimeout(timer);
                resolve(undefined);
            },
            { enableHighAccuracy: true, maximumAge: 60_000, timeout: START_ROUTE_FIX_TIMEOUT_MS }
        );
    });
}

export function registerOfflineMutationDefaults(qc: QueryClient) {
    refetchWhenFieldOpsDrain(qc);
    cleanupFormPhotosOnRemoval(qc);

    qc.setMutationDefaults(OFFLINE_KEYS.status, {
        scope: FIELD_OPS_SCOPE,
        mutationFn: async ({ jobId, status, clientAt, clientMutationId }: { jobId: string; status: string; clientAt?: string; clientMutationId?: string }) => {
            // clientAt = when the tech tapped (not when this replays): the server
            // drives the clock from it and skips the customer SMS if it's stale.
            // "Start route" also carries the current position (taken at send time,
            // never stored in the queued variables) so the first SMS has an ETA.
            const location = status === "EN_ROUTE" ? await startRouteLocation(clientAt) : undefined;
            await api.patch(
                `/jobs/${jobId}/status`,
                { status, clientAt, ...(location ? { location } : {}) },
                fieldRequest(clientMutationId)
            );
        },
        onMutate: async (variables: { jobId: string; status: string; clientAt?: string; clientMutationId?: string }) => {
            stampId(variables);
            if (!variables.clientAt) variables.clientAt = new Date().toISOString();
            const { jobId, status } = variables;
            await qc.cancelQueries({ queryKey: ASSIGNED_JOBS_KEY });
            await qc.cancelQueries({ queryKey: MY_WEEK_KEY });
            await qc.cancelQueries({ queryKey: MY_OPEN_JOBS_KEY });
            patchJob(qc, jobId, (job) => {
                job.status = status;
                if ((status === "EN_ROUTE" || status === "ON_SITE") && !job.actualStart) {
                    job.actualStart = variables.clientAt;
                }
                if (status === "COMPLETED") job.actualEnd = variables.clientAt;
                return job;
            });
            patchWeekEventStatus(qc, jobId, status);
        },
    });

    qc.setMutationDefaults(OFFLINE_KEYS.checklist, {
        scope: FIELD_OPS_SCOPE,
        mutationFn: async ({ jobId, checkId, isCompleted, clientMutationId }: { jobId: string; checkId: string; isCompleted: boolean; clientMutationId?: string }) => {
            await api.patch(`/jobs/${jobId}/checklist/${checkId}`, { isCompleted }, fieldRequest(clientMutationId));
        },
        onMutate: async (variables: { jobId: string; checkId: string; isCompleted: boolean; clientMutationId?: string }) => {
            stampId(variables);
            const { jobId, checkId, isCompleted } = variables;
            await qc.cancelQueries({ queryKey: ASSIGNED_JOBS_KEY });
            patchJob(qc, jobId, (job) => {
                job.checklist = (job.checklist ?? []).map((c: any) =>
                    c.id === checkId
                        ? { ...c, isCompleted, completedAt: isCompleted ? new Date().toISOString() : null }
                        : c
                );
                return job;
            });
        },
    });

    qc.setMutationDefaults(OFFLINE_KEYS.note, {
        scope: FIELD_OPS_SCOPE,
        mutationFn: async ({ jobId, message, clientMutationId }: { jobId: string; message: string; clientMutationId?: string }) => {
            await api.post(`/jobs/${jobId}/notes`, { message }, fieldRequest(clientMutationId));
        },
        onMutate: async (variables: { jobId: string; message: string; clientMutationId?: string }) => {
            stampId(variables);
            const { jobId, message } = variables;
            await qc.cancelQueries({ queryKey: ASSIGNED_JOBS_KEY });
            patchJob(qc, jobId, (job) => {
                job.notes = [
                    { id: tempId(), jobId, message, createdAt: new Date().toISOString(), author: null, pending: true },
                    ...(job.notes ?? []),
                ];
                return job;
            });
        },
    });

    qc.setMutationDefaults(OFFLINE_KEYS.lineItemAdd, {
        scope: FIELD_OPS_SCOPE,
        mutationFn: async ({ jobId, name, quantity, unitPrice, type, priceBookItemId, clientMutationId }: { jobId: string; name: string; quantity: number; unitPrice: number; type: string; priceBookItemId?: string; tempId?: string; clientMutationId?: string }) => {
            await api.post(`/jobs/${jobId}/line-items`, { name, quantity, unitPrice, type, priceBookItemId }, fieldRequest(clientMutationId));
        },
        onMutate: async (variables: { jobId: string; name: string; quantity: number; unitPrice: number; type: string; tempId?: string; clientMutationId?: string }) => {
            stampId(variables);
            // The optimistic row's id is stored on the variables so a still-queued
            // add can be matched and cancelled if the tech removes the item before
            // it syncs (see use-line-items: removeLineItem).
            if (!variables.tempId) variables.tempId = tempId();
            const { jobId, name, quantity, unitPrice, type, tempId: optimisticId } = variables;
            await qc.cancelQueries({ queryKey: ASSIGNED_JOBS_KEY });
            patchJob(qc, jobId, (job) => {
                job.lineItems = [
                    ...(job.lineItems ?? []),
                    {
                        id: optimisticId,
                        name,
                        quantity,
                        unitPrice: String(unitPrice),
                        total: String(quantity * unitPrice),
                        type,
                        pending: true,
                    },
                ];
                return job;
            });
        },
    });

    qc.setMutationDefaults(OFFLINE_KEYS.lineItemRemove, {
        scope: FIELD_OPS_SCOPE,
        mutationFn: async ({ jobId, itemId, clientMutationId }: { jobId: string; itemId: string; clientMutationId?: string }) => {
            await api.delete(`/jobs/${jobId}/line-items/${itemId}`, fieldRequest(clientMutationId));
        },
        onMutate: async (variables: { jobId: string; itemId: string; clientMutationId?: string }) => {
            stampId(variables);
            const { jobId, itemId } = variables;
            await qc.cancelQueries({ queryKey: ASSIGNED_JOBS_KEY });
            patchJob(qc, jobId, (job) => {
                job.lineItems = (job.lineItems ?? []).filter((li: any) => li.id !== itemId);
                return job;
            });
        },
    });

    qc.setMutationDefaults(OFFLINE_KEYS.signature, {
        scope: FIELD_OPS_SCOPE,
        mutationFn: async ({ jobId, signerName, signatureDataUrl, clientMutationId }: { jobId: string; signerName: string; signatureDataUrl: string; clientMutationId?: string }) => {
            await api.post(`/jobs/${jobId}/signatures`, { signerName, signatureDataUrl }, { headers: idempotencyHeaders(clientMutationId) });
        },
        onMutate: async (variables: { jobId: string; signerName: string; signatureDataUrl: string; clientMutationId?: string }) => {
            stampId(variables);
            const { jobId, signerName, signatureDataUrl } = variables;
            await qc.cancelQueries({ queryKey: ASSIGNED_JOBS_KEY });
            patchJob(qc, jobId, (job) => {
                job.signatures = [
                    { id: tempId(), signerName, signatureDataUrl, signedAt: new Date().toISOString(), pending: true },
                    ...(job.signatures ?? []),
                ];
                return job;
            });
        },
    });

    qc.setMutationDefaults(OFFLINE_KEYS.expense, {
        scope: EXPENSE_SCOPE,
        mutationFn: async ({ jobId, description, amount, category, receiptBlobId, clientMutationId }: { jobId: string; description: string; amount: number; category: string; receiptBlobId?: string; clientMutationId?: string }) => {
            const formData = new FormData();
            formData.append("description", description);
            formData.append("amount", String(amount));
            formData.append("category", category);
            formData.append("date", new Date().toISOString());
            // Receipt bytes live in their own IndexedDB store so the upload
            // survives reload/reconnect and is never swept into the photo gallery.
            if (receiptBlobId) {
                const queued = await getReceiptBlob(receiptBlobId);
                if (queued) formData.append("receipt", queued.blob, queued.fileName);
            }
            await api.post(`/operations/jobs/${jobId}/expenses`, formData, { headers: idempotencyHeaders(clientMutationId) });
            if (receiptBlobId) await delReceiptBlob(receiptBlobId);
        },
        onMutate: async (variables: { jobId: string; description: string; amount: number; category: string; receiptBlobId?: string; clientMutationId?: string }) => {
            stampId(variables);
        },
        onSettled: () => refreshFieldQueriesWhenIdle(qc),
    });

    // Field quote: the tech builds a price-book-driven quote on site. Prices are
    // resolved server-side (never trusted from the client), so the queued
    // variables carry no pricing — only item ids/quantities. No optimistic cache
    // patch: the estimate is a separate entity, not part of the assigned-jobs list.
    qc.setMutationDefaults(OFFLINE_KEYS.fieldQuote, {
        scope: FIELD_OPS_SCOPE,
        mutationFn: async ({ jobId, items, clientMutationId }: { jobId: string; items: Array<{ priceBookItemId?: string; name: string; quantity: number; type: string }>; clientMutationId?: string }) => {
            await api.post(`/finance/estimates/field`, { jobId, items }, fieldRequest(clientMutationId));
        },
        onMutate: async (variables: { jobId: string; items: Array<{ priceBookItemId?: string; name: string; quantity: number; type: string }>; clientMutationId?: string }) => {
            stampId(variables);
        },
    });

    // Field invoice: the tech taps once to invoice the job and send the customer a
    // pay link. Amounts are computed and stripped server-side, so the queued
    // variables carry only the jobId. Idempotent server-side (resends the link if
    // already invoiced). onSettled refreshes the assigned-jobs list so the
    // "invoiced" state persists after reconnect. The returned data (masked sent-to)
    // is surfaced by the hook that fires this key.
    qc.setMutationDefaults(OFFLINE_KEYS.fieldInvoice, {
        scope: FIELD_OPS_SCOPE,
        mutationFn: async ({ jobId, clientMutationId }: { jobId: string; clientMutationId?: string }) => {
            return (await api.post(`/finance/jobs/${jobId}/field-invoice`, {}, fieldRequest(clientMutationId))).data;
        },
        onMutate: async (variables: { jobId: string; clientMutationId?: string }) => {
            stampId(variables);
        },
    });

    // Field form / CoC submission. The submission is a separate entity (not part
    // of the assigned-jobs list), so we patch the per-job forms cache optimistically
    // and reconcile onSettled. Prices never appear on forms, so nothing to strip.
    //
    // Form photos are uploaded inside this mutation (not on the photo scope): the
    // submission must reference them, and it stays on the field-ops scope so a
    // required form still lands before the COMPLETED status that depends on it.
    // `detached` = queued with the form sheet already closed (offline). Only then
    // does a final failure free the photo blobs; an open sheet still needs them
    // so the tech can fix the answers and resubmit.
    qc.setMutationDefaults(OFFLINE_KEYS.formSubmit, {
        scope: FIELD_OPS_SCOPE,
        mutationFn: async ({ jobId, templateId, data, signatureUrl, clientMutationId }: { jobId: string; templateId: string; data: Record<string, unknown>; signatureUrl?: string; clientMutationId?: string; detached?: boolean }) => {
            const resolved = await resolveFormPhotos(jobId, data);
            await api.post(
                `/digital-forms/submissions`,
                { jobId, templateId, data: resolved.data, signatureUrl },
                // Inline photo fallbacks make a large body; give it the upload timeout.
                resolved.inline
                    ? { headers: idempotencyHeaders(clientMutationId), timeout: 120000 }
                    : fieldRequest(clientMutationId),
            );
            await deleteFormPhotos(data);
        },
        onError: (error: unknown, variables: { jobId: string; templateId: string; data: Record<string, unknown>; signatureUrl?: string; clientMutationId?: string; detached?: boolean }) => {
            if (variables?.detached && isPermanentFormFailure(error)) void deleteFormPhotos(variables.data);
        },
        onMutate: async (variables: { jobId: string; templateId: string; data: Record<string, unknown>; signatureUrl?: string; clientMutationId?: string; detached?: boolean }) => {
            stampId(variables);
            const { jobId, templateId } = variables;
            await qc.cancelQueries({ queryKey: ["job-forms", jobId] });
            qc.setQueryData(["job-forms", jobId], (old: any) => {
                if (!old) return old;
                return {
                    ...old,
                    submissions: [
                        { id: tempId(), templateId, createdAt: new Date().toISOString(), user: null, pending: true },
                        ...(old.submissions ?? []),
                    ],
                };
            });
        },
        onSettled: (_data, _error, variables: any) =>
            qc.invalidateQueries({ queryKey: ["job-forms", variables?.jobId] }),
    });

    qc.setMutationDefaults(OFFLINE_KEYS.photo, {
        scope: PHOTO_SCOPE,
        mutationFn: async ({ jobId, blobId, caption }: { jobId: string; blobId: string; caption: string }) => {
            const queued = await getPhotoBlob(blobId);
            if (!queued) return; // already uploaded / cleaned up
            const formData = new FormData();
            formData.append("photo", queued.blob, queued.fileName);
            if (caption.trim()) formData.append("caption", caption.trim());
            // Idempotency key is the IndexedDB blobId: stable across replay and
            // shared with the photo sweeper in use-photos.ts, so if both the
            // paused mutation and the sweeper fire the same blob the server
            // dedupes. Long timeout — photo uploads on patchy signal are slow.
            await api.post(`/media/jobs/${jobId}/photos`, formData, {
                headers: idempotencyHeaders(blobId),
                timeout: 120000,
            });
            await delPhotoBlob(blobId);
        },
        onSettled: () => refreshFieldQueriesWhenIdle(qc),
    });

    // Customer job summary (PDF by email + WhatsApp). Needs signal, but queuing it
    // means a tap on patchy signal isn't lost and never double-sends on retry.
    qc.setMutationDefaults(OFFLINE_KEYS.summary, {
        scope: FIELD_OPS_SCOPE,
        mutationFn: async ({ jobId, clientMutationId }: { jobId: string; clientMutationId?: string }) =>
            (await api.post(
                `/jobs/${jobId}/summary-pdf`,
                { email: true, whatsapp: true },
                { headers: idempotencyHeaders(clientMutationId) },
            )).data,
        onMutate: async (variables: { jobId: string; clientMutationId?: string }) => {
            stampId(variables);
        },
    });

    // Legacy "On my way": the field UIs now send status EN_ROUTE instead. Kept so
    // taps already queued on a phone still replay. clientAt lets the server skip
    // a stale customer message; Idempotency-Key stops a double text.
    qc.setMutationDefaults(OFFLINE_KEYS.onMyWay, {
        scope: FIELD_OPS_SCOPE,
        mutationFn: async ({ jobId, clientAt, clientMutationId }: { jobId: string; clientAt?: string; clientMutationId?: string }) => {
            await api.post(`/schedule/jobs/${jobId}/on-my-way`, { clientAt }, fieldRequest(clientMutationId));
        },
        onMutate: async (variables: { jobId: string; clientAt?: string; clientMutationId?: string }) => {
            stampId(variables);
            if (!variables.clientAt) variables.clientAt = new Date().toISOString();
        },
    });

    // Van stock: draw on a job. Server decrements atomically; the Idempotency-Key
    // makes a replay a no-op so a queued draw can't deduct twice.
    qc.setMutationDefaults(OFFLINE_KEYS.vanStockUse, {
        scope: VAN_STOCK_SCOPE,
        mutationFn: async ({ vanId, itemId, jobId, quantity, clientMutationId }: { vanId: string; itemId: string; jobId: string; quantity: number; clientMutationId?: string }) => {
            await api.post(
                `/vans/${vanId}/inventory/${itemId}/use`,
                { jobId, quantity },
                fieldRequest(clientMutationId),
            );
        },
        onMutate: async (variables: { vanId: string; itemId: string; jobId: string; quantity: number; clientMutationId?: string }) => {
            stampId(variables);
            await qc.cancelQueries({ queryKey: ["van-inventory", variables.vanId] });
            patchVanItemQty(qc, variables.vanId, variables.itemId, -variables.quantity);
        },
        onSettled: (_d, _e, variables: any) =>
            qc.invalidateQueries({ queryKey: ["van-inventory", variables?.vanId] }),
    });

    // Van stock: +/- stepper. Delta-based so two crew members don't clobber each
    // other; idempotent on replay.
    qc.setMutationDefaults(OFFLINE_KEYS.vanStockAdjust, {
        scope: VAN_STOCK_SCOPE,
        mutationFn: async ({ vanId, itemId, delta, clientMutationId }: { vanId: string; itemId: string; delta: number; clientMutationId?: string }) => {
            await api.post(
                `/vans/${vanId}/inventory/${itemId}/adjust`,
                { delta },
                fieldRequest(clientMutationId),
            );
        },
        onMutate: async (variables: { vanId: string; itemId: string; delta: number; clientMutationId?: string }) => {
            stampId(variables);
            await qc.cancelQueries({ queryKey: ["van-inventory", variables.vanId] });
            patchVanItemQty(qc, variables.vanId, variables.itemId, variables.delta);
        },
        onSettled: (_d, _e, variables: any) =>
            qc.invalidateQueries({ queryKey: ["van-inventory", variables?.vanId] }),
    });

    // Van stock: request restock. De-duped server-side; idempotent on replay.
    qc.setMutationDefaults(OFFLINE_KEYS.vanRestock, {
        scope: VAN_STOCK_SCOPE,
        mutationFn: async ({ vanId, itemId, clientMutationId }: { vanId: string; itemId: string; clientMutationId?: string }) => {
            await api.post(
                `/vans/${vanId}/inventory/${itemId}/request-restock`,
                {},
                fieldRequest(clientMutationId),
            );
        },
        onMutate: async (variables: { vanId: string; itemId: string; clientMutationId?: string }) => {
            stampId(variables);
        },
    });
}

/** True when this cache mutation is one of our replayable field actions. */
export function isFieldMutation(mutation: Mutation<any, any, any, any>): boolean {
    const key = mutation.options?.mutationKey;
    return Array.isArray(key) && OFFLINE_KEY_HEADS.has(key.join("|"));
}

const STATUS_TEXT: Record<string, string> = {
    REQUESTED: "Requested",
    ASSIGNED: "Assigned",
    EN_ROUTE: "En route",
    ON_SITE: "On site",
    PAUSED: "Paused",
    COMPLETED: "Completed",
    CANCELED: "Canceled",
};

/**
 * Human label for a queued/failed field mutation, for the outbox. NEVER includes
 * prices or amounts — techs don't see pricing. Returns the action text plus the
 * jobId so the outbox can resolve a friendly job name from cache.
 */
export function mutationLabel(mutation: Mutation<any, any, any, any>): { action: string; jobId?: string } {
    const key = Array.isArray(mutation.options?.mutationKey) ? mutation.options.mutationKey.join("|") : "";
    const v: any = mutation.state.variables ?? {};
    const k = OFFLINE_KEYS;
    switch (key) {
        case k.status.join("|"):
            return { action: `Status → ${STATUS_TEXT[v.status] ?? v.status ?? "updated"}`, jobId: v.jobId };
        case k.checklist.join("|"):
            return { action: v.isCompleted ? "Checklist item ticked" : "Checklist item cleared", jobId: v.jobId };
        case k.note.join("|"):
            return { action: "Note added", jobId: v.jobId };
        case k.lineItemAdd.join("|"):
            return { action: `Line item: ${v.name ?? "item"}${v.quantity ? ` ×${v.quantity}` : ""}`, jobId: v.jobId };
        case k.lineItemRemove.join("|"):
            return { action: "Line item removed", jobId: v.jobId };
        case k.signature.join("|"):
            return { action: `Signature${v.signerName ? ` — ${v.signerName}` : ""}`, jobId: v.jobId };
        case k.expense.join("|"):
            return { action: `Expense: ${v.description ?? "receipt"}`, jobId: v.jobId };
        case k.fieldQuote.join("|"): {
            const n = Array.isArray(v.items) ? v.items.length : 0;
            return { action: `Quote (${n} item${n !== 1 ? "s" : ""})`, jobId: v.jobId };
        }
        case k.fieldInvoice.join("|"):
            return { action: "Invoice & pay link", jobId: v.jobId };
        case k.formSubmit.join("|"):
            return { action: "Form submission", jobId: v.jobId };
        case k.photo.join("|"):
            return { action: "Photo upload", jobId: v.jobId };
        case k.summary.join("|"):
            return { action: "Job summary sent", jobId: v.jobId };
        case k.onMyWay.join("|"):
            return { action: "On my way (customer notified)", jobId: v.jobId };
        case k.vanStockUse.join("|"):
            return { action: `Van stock used${v.quantity ? ` ×${v.quantity}` : ""}`, jobId: v.jobId };
        case k.vanStockAdjust.join("|"):
            return { action: `Van stock ${v.delta > 0 ? "added" : "removed"}${v.delta ? ` (${Math.abs(v.delta)})` : ""}` };
        case k.vanRestock.join("|"):
            return { action: "Restock requested" };
        default:
            return { action: "Change", jobId: v.jobId };
    }
}
