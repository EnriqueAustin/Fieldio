"use client";

import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "../../../lib/api";
import { OFFLINE_KEYS } from "../../../lib/offline-mutations";
import { toast } from "../../ui/use-toast";

export type FormFieldType =
    | "text"
    | "textarea"
    | "number"
    | "date"
    | "checkbox"
    | "boolean"
    | "select"
    | "multiselect"
    | "signature";

export interface FormField {
    // Templates are authored in two places: the office builder uses `key`, the
    // seed/CoC starter uses `name`. Support both so every template renders.
    key?: string;
    name?: string;
    label: string;
    type: FormFieldType;
    required?: boolean;
    options?: string[];
}

export interface FormSchema {
    fields?: FormField[];
    /** CoC / compliance certificate — only users with canIssueCoC may submit. */
    requiresCoc?: boolean;
    /** Opt-in: block job completion until a submission exists for this template. */
    requiredForCompletion?: boolean;
}

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

export function fieldId(field: FormField): string {
    return field.key ?? field.name ?? "";
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
        queryKey: ["job-forms", jobId],
        queryFn: () => api.get(`/digital-forms/jobs/${jobId}/forms`).then((r) => r.data.data as JobFormsResponse),
        enabled: !!jobId,
    });

    const submitMutation = useMutation<unknown, any, { jobId: string; templateId: string; data: Record<string, unknown>; signatureUrl?: string }>({
        mutationKey: OFFLINE_KEYS.formSubmit,
        onError: (error: any) => {
            toast({
                title: "Form not submitted",
                description: error?.response?.data?.message ?? "Please try again.",
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
        submit: (vars: { jobId: string; templateId: string; data: Record<string, unknown>; signatureUrl?: string }) =>
            submitMutation.mutateAsync(vars),
        isSubmitting: submitMutation.isPending,
    };
}
