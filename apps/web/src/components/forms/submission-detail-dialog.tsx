"use client";

import { format } from "date-fns";
import { FileDown, Send, ShieldCheck } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { useSendCertificate, viewCertificatePdf } from "./certificate-actions";
import {
    displayAnswer,
    fieldId,
    schemaFields,
    submissionTitle,
    submitterName,
    type FormField,
    type FormSubmissionView,
    type PhotoAnswer,
} from "./form-schema";

/** "Sent 3 Dec, 14:05 by email" — or null when never sent. */
export function sentLabel(s: Pick<FormSubmissionView, "sentAt" | "sentChannels">): string | null {
    if (!s.sentAt) return null;
    const via = s.sentChannels
        .map((c) => c.replace(/^summary:/, ""))
        .filter((c, i, all) => all.indexOf(c) === i)
        .join(" & ");
    return `Sent ${format(new Date(s.sentAt), "d MMM, HH:mm")}${via ? ` by ${via}` : ""}`;
}

export function CertificateActions({
    submission,
    canSend,
    size = "sm",
}: {
    submission: FormSubmissionView;
    canSend: boolean;
    size?: "sm" | "default";
}) {
    const send = useSendCertificate();
    const sending = send.isPending && send.variables?.submissionId === submission.id;
    return (
        <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size={size} className="gap-1.5" onClick={() => viewCertificatePdf(submission.id)}>
                <FileDown className="h-4 w-4" /> View PDF
            </Button>
            {canSend && (
                <Button
                    type="button"
                    size={size}
                    className="gap-1.5"
                    disabled={sending}
                    onClick={() => send.mutate({ submissionId: submission.id })}
                >
                    <Send className="h-4 w-4" />
                    {sending ? "Sending…" : submission.sentAt ? "Send again" : "Send to customer"}
                </Button>
            )}
        </div>
    );
}

function AnswerBlock({ field, value }: { field: FormField; value: unknown }) {
    if (field.type === "table") {
        const columns = field.columns ?? [];
        const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
        return (
            <div className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</p>
                {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No rows recorded.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[480px] text-left text-xs">
                            <thead>
                                <tr className="border-b">
                                    {columns.map((c) => (
                                        <th key={c.key} className="px-2 py-1.5 font-medium text-muted-foreground">
                                            {c.label}
                                            {c.unit ? ` (${c.unit})` : ""}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, r) => (
                                    <tr key={r} className="border-b last:border-0">
                                        {columns.map((c) => {
                                            const text = displayAnswer(c.type, row?.[c.key]);
                                            return (
                                                <td
                                                    key={c.key}
                                                    className={`px-2 py-1.5 ${text === "Fail" ? "font-semibold text-rose-600" : ""}`}
                                                >
                                                    {text}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    }

    if (field.type === "photo") {
        const photos = Array.isArray(value) ? (value as PhotoAnswer[]) : [];
        return (
            <div className="rounded-lg border p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</p>
                {photos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No photos.</p>
                ) : (
                    <div className="grid grid-cols-3 gap-2">
                        {photos.map((p, i) => {
                            const src = p.thumbnailUrl || p.url || p.dataUrl;
                            return src ? (
                                <a key={i} href={p.url || src} target="_blank" rel="noreferrer" className="block">
                                    <img
                                        src={src}
                                        alt={`${field.label} photo ${i + 1}`}
                                        className="aspect-square w-full rounded-md border object-cover"
                                    />
                                </a>
                            ) : null;
                        })}
                    </div>
                )}
            </div>
        );
    }

    if (field.type === "signature") {
        return (
            <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</p>
                {typeof value === "string" && value.startsWith("data:image/") ? (
                    <img src={value} alt={field.label} className="h-24 rounded-lg border bg-white p-2" />
                ) : (
                    <p className="text-sm text-muted-foreground">Not signed</p>
                )}
            </div>
        );
    }

    return (
        <div className="rounded-lg border p-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</dt>
            <dd
                className={`mt-1 whitespace-pre-line text-sm ${
                    field.type === "passfail" && value === "fail" ? "font-semibold text-rose-600" : ""
                }`}
            >
                {displayAnswer(field.type, value, field.unit)}
            </dd>
        </div>
    );
}

/** Read-only view of a submission, rendered from the schema it was filled against. */
export function SubmissionDetailDialog({
    submission,
    onClose,
    canSend,
}: {
    submission: FormSubmissionView | null;
    onClose: () => void;
    canSend: boolean;
}) {
    const fields = submission ? schemaFields(submission.templateSnapshot?.schema ?? submission.template?.schema) : [];
    const sent = submission ? sentLabel(submission) : null;

    return (
        <Dialog open={!!submission} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 pr-6">
                        {submission?.requiresCoc && <ShieldCheck className="h-5 w-5 shrink-0 text-amber-600" />}
                        {submission ? submissionTitle(submission) : "Submission"}
                    </DialogTitle>
                </DialogHeader>
                {submission && (
                    <div className="space-y-4">
                        <div className="space-y-1 text-xs text-muted-foreground">
                            <p>
                                Completed by {submitterName(submission)} on {format(new Date(submission.createdAt), "d MMM yyyy, HH:mm")}
                            </p>
                            {submission.certificateNumber && (
                                <p>
                                    Certificate no. <span className="font-semibold text-foreground">{submission.certificateNumber}</span>
                                </p>
                            )}
                            <p>{sent ?? "Not sent to the customer yet"}</p>
                        </div>

                        <CertificateActions submission={submission} canSend={canSend && !!submission.customerId} />
                        {canSend && !submission.customerId && (
                            <p className="text-xs text-muted-foreground">
                                This form isn&apos;t linked to a customer, so it can&apos;t be sent.
                            </p>
                        )}

                        {fields.length > 0 ? (
                            <dl className="space-y-3">
                                {fields.map((field, index) =>
                                    field.type === "section" ? (
                                        <div key={fieldId(field, index)} className="pt-2">
                                            <h3 className="text-sm font-semibold">{field.label}</h3>
                                            {field.help && (
                                                <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{field.help}</p>
                                            )}
                                        </div>
                                    ) : (
                                        <AnswerBlock
                                            key={fieldId(field, index)}
                                            field={field}
                                            value={submission.data[fieldId(field, index)]}
                                        />
                                    )
                                )}
                            </dl>
                        ) : (
                            // Free-form (legacy) submission: list whatever was captured.
                            <dl className="space-y-3">
                                {Object.entries(submission.data).map(([key, value]) => (
                                    <div key={key} className="rounded-lg border p-3">
                                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                            {key.replace(/_/g, " ")}
                                        </dt>
                                        <dd className="mt-1 text-sm">
                                            {typeof value === "boolean" ? (value ? "Yes" : "No") : displayAnswer("text", value)}
                                        </dd>
                                    </div>
                                ))}
                                {submission.signatureUrl && /^(data:image\/|https:\/\/)/.test(submission.signatureUrl) && (
                                    <div className="rounded-lg border p-3">
                                        <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                            Signature
                                        </dt>
                                        <img src={submission.signatureUrl} alt="Signature" className="h-24 rounded-lg border bg-white p-2" />
                                    </div>
                                )}
                            </dl>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
