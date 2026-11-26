"use client";

import { useMemo } from "react";
import { useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import api from "../../../lib/api";
import { OFFLINE_KEYS } from "../../../lib/offline-mutations";
import { toast } from "../../ui/use-toast";
import { fieldId, type FormField, type FormSchema } from "../../forms/form-schema";

export type { FormColumn, FormField, FormFieldType, FormSchema, PhotoAnswer } from "../../forms/form-schema";
export { fieldId };

export interface FormTemplate {
    id: string;
    name: string;
    description: string | null;
    schema: FormSchema | Record<string, unknown>;
    active: boolean;
    createdAt: string;
}

export interface FormSubmissionLite {
    id: string;
    templateId: string;
    userId?: string;
    signatureUrl?: string | null;
    createdAt: string;
    user?: { firstName: string | null; lastName: string | null } | null;
    pending?: boolean;
}

interface JobFormsResponse {
    templates: FormTemplate[];
    submissions: FormSubmissionLite[];
    canIssueCoC: boolean;
}

/** Query key + fetcher shared by the hook and the prefetcher so both land in the
 *  same cache entry. */
const formsQueryKey = (jobId: string | null | undefined) => ["job-forms", jobId] as const;
const fetchJobForms = (jobId: string) =>
    api.get(`/digital-forms/jobs/${jobId}/forms`).then((r) => r.data.data as JobFormsResponse);

// Keep forms cached long enough to open a job offline; don't refetch on every
// mount while on patchy signal.
const FORMS_STALE_TIME = 5 * 60 * 1000;
const FORMS_GC_TIME = 24 * 60 * 60 * 1000;

/**
 * Warm the forms cache for a set of jobs (e.g. today's route) so a tech can open
 * any of them and fill/submit CoC forms with no signal. Called by the route owner
 * for today's jobIds. gcTime matches the on-device persisted cache (24h) so the
 * entries survive an app reload while offline.
 */
export function prefetchFormsForJobs(queryClient: QueryClient, jobIds: string[]) {
    const unique = Array.from(new Set(jobIds.filter(Boolean)));
    return Promise.all(
        unique.map((jobId) =>
            queryClient.prefetchQuery({
                queryKey: formsQueryKey(jobId),
                queryFn: () => fetchJobForms(jobId),
                staleTime: FORMS_STALE_TIME,
                gcTime: FORMS_GC_TIME,
            })
        )
    );
}

export function getSchema(template: FormTemplate): FormSchema {
    return (template.schema ?? {}) as FormSchema;
}

export function getFields(template: FormTemplate): FormField[] {
    const schema = getSchema(template);
    return Array.isArray(schema.fields) ? schema.fields : [];
}

/** Sort key: required-before-completion first, then CoC, then the rest. */
function templateRank(template: FormTemplate): number {
    const schema = getSchema(template);
    if (schema.requiredForCompletion) return 0;
    if (schema.requiresCoc) return 1;
    return 2;
}

/**
 * Per-job forms surface for the field console: available templates, this job's
 * submissions, the caller's CoC permission, and derived completion-gating state.
 * Submission is offline-queued via the shared formSubmit mutation key.
 */
export function useJobForms(jobId: string | null | undefined) {
    const query = useQuery({
        queryKey: formsQueryKey(jobId),
        queryFn: () => fetchJobForms(jobId as string),
        enabled: !!jobId,
        staleTime: FORMS_STALE_TIME,
        gcTime: FORMS_GC_TIME,
    });

    const submitMutation = useMutation<unknown, any, { jobId: string; templateId: string; data: Record<string, unknown>; signatureUrl?: string; detached?: boolean }>({
        mutationKey: OFFLINE_KEYS.formSubmit,
        onError: (error: any) => {
            toast({
                title: "Form not submitted",
                description: error?.response?.data?.message ?? error?.message ?? "Please try again.",
                variant: "destructive",
            });
        },
    });

    const templates = useMemo(
        () => [...(query.data?.templates ?? [])].sort((a, b) => templateRank(a) - templateRank(b) || a.name.localeCompare(b.name)),
        [query.data?.templates]
    );

    const submissions = query.data?.submissions ?? [];
    const canIssueCoC = query.data?.canIssueCoC ?? false;

    // Latest submission per template for this job.
    const submissionByTemplate = useMemo(() => {
        const map = new Map<string, FormSubmissionLite>();
        for (const s of submissions) {
            if (!map.has(s.templateId)) map.set(s.templateId, s);
        }
        return map;
    }, [submissions]);

    // A form blocks completion only when the office explicitly marked its template
    // requiredForCompletion. CoC (requiresCoc) is permission-restricted but does not
    // hard-block on its own — otherwise every job would be un-completable and techs
    // without canIssueCoC could never close a job. See report notes.
    const requiredPending = useMemo(
        () =>
            templates.some(
                (t) => getSchema(t).requiredForCompletion && !submissionByTemplate.has(t.id)
            ),
        [templates, submissionByTemplate]
    );

    const hasForms = templates.length > 0;

    return {
        query,
        templates,
        submissionByTemplate,
        canIssueCoC,
        requiredPending,
        hasForms,
        submit: (vars: { jobId: string; templateId: string; data: Record<string, unknown>; signatureUrl?: string; detached?: boolean }) =>
            submitMutation.mutateAsync(vars),
        isSubmitting: submitMutation.isPending,
    };
}
