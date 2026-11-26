/**
 * Server-owned metadata stored alongside a submission's answers, under the
 * reserved `__meta` key of `DigitalFormSubmission.data` (no schema migration):
 *
 *  - template: the schema the tech filled in, snapshotted at submit time so a
 *    later template edit can never change what an old certificate says.
 *  - sentAt / sentChannels / sentTo: last delivery to the customer.
 *
 * Client input can never write here: validation drops every `__` key.
 */
export const META_KEY = '__meta';

export interface SubmissionMeta {
    template?: {
        id: string;
        name: string;
        description: string | null;
        schema: unknown;
        updatedAt: string | null;
    };
    sentAt?: string;
    sentChannels?: string[];
    sentTo?: { email?: string | null; phone?: string | null };
}

type DataObject = Record<string, unknown>;

const asObject = (v: unknown): DataObject => (v && typeof v === 'object' && !Array.isArray(v) ? (v as DataObject) : {});

export function readMeta(data: unknown): SubmissionMeta {
    return asObject(asObject(data)[META_KEY]) as SubmissionMeta;
}

/** The tech's answers without server metadata. */
export function readAnswers(data: unknown): DataObject {
    const { [META_KEY]: _meta, ...answers } = asObject(data);
    return answers;
}

export function withMeta(data: unknown, patch: Partial<SubmissionMeta>): DataObject {
    const obj = asObject(data);
    return { ...obj, [META_KEY]: { ...readMeta(obj), ...patch } };
}
