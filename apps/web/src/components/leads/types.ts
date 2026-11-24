export const STAGES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"] as const;
export type Stage = (typeof STAGES)[number];

export interface LeadSource {
    id: string;
    name: string;
}

export interface Lead {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    leadStage: Stage;
    leadValue: number | null;
    leadSource: LeadSource | null;
    leadSourceId?: string | null;
    notes?: string | null;
    updatedAt: string;
}

export const NOTE_TYPES = [
    { value: "NOTE", label: "Note" },
    { value: "CALL_OUTBOUND", label: "Call (out)" },
    { value: "CALL_INBOUND", label: "Call (in)" },
    { value: "EMAIL_SENT", label: "Email sent" },
    { value: "EMAIL_RECEIVED", label: "Email received" },
    { value: "SMS_SENT", label: "SMS sent" },
    { value: "MEETING", label: "Meeting" },
] as const;

export function formatRand(val: number | null | undefined): string {
    const n = Number(val ?? 0);
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n);
}
