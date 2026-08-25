import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

type NamedPerson = {
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
    email?: string | null;
} | null | undefined;

/**
 * People are shown by name everywhere. The email prefix is only a last resort —
 * seeing "sipho" instead of "Sipho Ndaba" reads as a bug to the customer-facing
 * side of the business.
 */
export function displayName(person: NamedPerson, fallback = "Unknown"): string {
    if (!person) return fallback;
    const full = [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
    if (full) return full;
    if (person.name?.trim()) return person.name.trim();
    if (person.email) return person.email.split("@")[0];
    return fallback;
}

/** First name only — for greetings and tight mobile headers. */
export function firstNameOf(person: NamedPerson, fallback = "there"): string {
    if (!person) return fallback;
    if (person.firstName?.trim()) return person.firstName.trim();
    const name = person.name?.trim();
    if (name) return name.split(" ")[0];
    if (person.email) return person.email.split("@")[0];
    return fallback;
}

/** Canonical money formatter. The product is ZAR-only today. */
export function formatZAR(value: number | string | null | undefined, opts?: { decimals?: number }) {
    const decimals = opts?.decimals ?? 2;
    return new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(Number(value || 0));
}
