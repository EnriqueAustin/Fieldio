"use client";

import type { QueryClient } from "@tanstack/react-query";
import api from "./api";
import { getPhotoBlob, delPhotoBlob } from "./offline-db";

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
};

const ASSIGNED_JOBS_KEY = ["technician-assigned-jobs"];
const MY_WEEK_KEY = ["my-week"];

/** Apply a transform to one job inside every cached assigned-jobs list. */
function patchJob(qc: QueryClient, jobId: string, fn: (job: any) => any) {
    qc.setQueriesData({ queryKey: ASSIGNED_JOBS_KEY }, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((job) => (job.id === jobId ? fn({ ...job }) : job));
    });
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

function invalidateFieldQueries(qc: QueryClient) {
    return Promise.all([
        qc.invalidateQueries({ queryKey: ASSIGNED_JOBS_KEY }),
        qc.invalidateQueries({ queryKey: MY_WEEK_KEY }),
    ]);
}

const tempId = () => `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Register replayable defaults for every field action. Called once when the
 * QueryClient is created. Optimistic onMutate keeps the UI truthful offline;
 * onSettled reconciles against the server once the mutation actually lands.
 */
export function registerOfflineMutationDefaults(qc: QueryClient) {
    qc.setMutationDefaults(OFFLINE_KEYS.status, {
        mutationFn: async ({ jobId, status }: { jobId: string; status: string }) => {
            await api.patch(`/jobs/${jobId}/status`, { status });
        },
        onMutate: async ({ jobId, status }: { jobId: string; status: string }) => {
            await qc.cancelQueries({ queryKey: ASSIGNED_JOBS_KEY });
            await qc.cancelQueries({ queryKey: MY_WEEK_KEY });
            patchJob(qc, jobId, (job) => {
                job.status = status;
                if ((status === "EN_ROUTE" || status === "ON_SITE") && !job.actualStart) {
                    job.actualStart = new Date().toISOString();
                }
                if (status === "COMPLETED") job.actualEnd = new Date().toISOString();
                return job;
            });
            patchWeekEventStatus(qc, jobId, status);
        },
        onSettled: () => invalidateFieldQueries(qc),
    });

    qc.setMutationDefaults(OFFLINE_KEYS.checklist, {
        mutationFn: async ({ jobId, checkId, isCompleted }: { jobId: string; checkId: string; isCompleted: boolean }) => {
            await api.patch(`/jobs/${jobId}/checklist/${checkId}`, { isCompleted });
        },
        onMutate: async ({ jobId, checkId, isCompleted }: { jobId: string; checkId: string; isCompleted: boolean }) => {
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
        onSettled: () => invalidateFieldQueries(qc),
    });

    qc.setMutationDefaults(OFFLINE_KEYS.note, {
        mutationFn: async ({ jobId, message }: { jobId: string; message: string }) => {
            await api.post(`/jobs/${jobId}/notes`, { message });
        },
        onMutate: async ({ jobId, message }: { jobId: string; message: string }) => {
            await qc.cancelQueries({ queryKey: ASSIGNED_JOBS_KEY });
            patchJob(qc, jobId, (job) => {
                job.notes = [
                    { id: tempId(), jobId, message, createdAt: new Date().toISOString(), author: null, pending: true },
                    ...(job.notes ?? []),
                ];
                return job;
            });
        },
        onSettled: () => invalidateFieldQueries(qc),
    });

    qc.setMutationDefaults(OFFLINE_KEYS.lineItemAdd, {
        mutationFn: async ({ jobId, ...data }: { jobId: string; name: string; quantity: number; unitPrice: number; type: string; priceBookItemId?: string }) => {
            await api.post(`/jobs/${jobId}/line-items`, data);
        },
        onMutate: async ({ jobId, name, quantity, unitPrice, type }: { jobId: string; name: string; quantity: number; unitPrice: number; type: string }) => {
            await qc.cancelQueries({ queryKey: ASSIGNED_JOBS_KEY });
            patchJob(qc, jobId, (job) => {
                job.lineItems = [
                    ...(job.lineItems ?? []),
                    {
                        id: tempId(),
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
        onSettled: () => invalidateFieldQueries(qc),
    });

    qc.setMutationDefaults(OFFLINE_KEYS.lineItemRemove, {
        mutationFn: async ({ jobId, itemId }: { jobId: string; itemId: string }) => {
            await api.delete(`/jobs/${jobId}/line-items/${itemId}`);
        },
        onMutate: async ({ jobId, itemId }: { jobId: string; itemId: string }) => {
            await qc.cancelQueries({ queryKey: ASSIGNED_JOBS_KEY });
            patchJob(qc, jobId, (job) => {
                job.lineItems = (job.lineItems ?? []).filter((li: any) => li.id !== itemId);
                return job;
            });
        },
        onSettled: () => invalidateFieldQueries(qc),
    });

    qc.setMutationDefaults(OFFLINE_KEYS.signature, {
        mutationFn: async ({ jobId, signerName, signatureDataUrl }: { jobId: string; signerName: string; signatureDataUrl: string }) => {
            await api.post(`/jobs/${jobId}/signatures`, { signerName, signatureDataUrl });
        },
        onMutate: async ({ jobId, signerName, signatureDataUrl }: { jobId: string; signerName: string; signatureDataUrl: string }) => {
            await qc.cancelQueries({ queryKey: ASSIGNED_JOBS_KEY });
            patchJob(qc, jobId, (job) => {
                job.signatures = [
                    { id: tempId(), signerName, signatureDataUrl, signedAt: new Date().toISOString(), pending: true },
                    ...(job.signatures ?? []),
                ];
                return job;
            });
        },
        onSettled: () => invalidateFieldQueries(qc),
    });

    qc.setMutationDefaults(OFFLINE_KEYS.expense, {
        mutationFn: async ({ jobId, description, amount, category, receiptBlobId }: { jobId: string; description: string; amount: number; category: string; receiptBlobId?: string }) => {
            const formData = new FormData();
            formData.append("description", description);
            formData.append("amount", String(amount));
            formData.append("category", category);
            formData.append("date", new Date().toISOString());
            // Receipt bytes live in IndexedDB so the upload survives reload/reconnect.
            if (receiptBlobId) {
                const queued = await getPhotoBlob(receiptBlobId);
                if (queued) formData.append("receipt", queued.blob, queued.fileName);
            }
            await api.post(`/operations/jobs/${jobId}/expenses`, formData);
            if (receiptBlobId) await delPhotoBlob(receiptBlobId);
        },
        onSettled: () => invalidateFieldQueries(qc),
    });

    // Field quote: the tech builds a price-book-driven quote on site. Prices are
    // resolved server-side (never trusted from the client), so the queued
    // variables carry no pricing — only item ids/quantities. No optimistic cache
    // patch: the estimate is a separate entity, not part of the assigned-jobs list.
    qc.setMutationDefaults(OFFLINE_KEYS.fieldQuote, {
        mutationFn: async ({ jobId, items }: { jobId: string; items: Array<{ priceBookItemId?: string; name: string; quantity: number; type: string }> }) => {
            await api.post(`/finance/estimates/field`, { jobId, items });
        },
    });

    // Field invoice: the tech taps once to invoice the job and send the customer a
    // pay link. Amounts are computed and stripped server-side, so the queued
    // variables carry only the jobId. Idempotent server-side (resends the link if
    // already invoiced). onSettled refreshes the assigned-jobs list so the
    // "invoiced" state persists after reconnect. The returned data (masked sent-to)
    // is surfaced by the hook that fires this key.
    qc.setMutationDefaults(OFFLINE_KEYS.fieldInvoice, {
        mutationFn: async ({ jobId }: { jobId: string }) => {
            return (await api.post(`/finance/jobs/${jobId}/field-invoice`, {})).data;
        },
        onSettled: () => invalidateFieldQueries(qc),
    });

    qc.setMutationDefaults(OFFLINE_KEYS.photo, {
        mutationFn: async ({ jobId, blobId, caption }: { jobId: string; blobId: string; caption: string }) => {
            const queued = await getPhotoBlob(blobId);
            if (!queued) return; // already uploaded / cleaned up
            const formData = new FormData();
            formData.append("photo", queued.blob, queued.fileName);
            if (caption.trim()) formData.append("caption", caption.trim());
            await api.post(`/media/jobs/${jobId}/photos`, formData);
            await delPhotoBlob(blobId);
        },
        onSettled: () => invalidateFieldQueries(qc),
    });
}
