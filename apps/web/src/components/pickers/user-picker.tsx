"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import api from "../../lib/api";
import { cn } from "../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Input } from "../ui/input";

interface PickerUser {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    role: string;
}

interface UserPickerProps {
    value: string;
    onChange: (userId: string) => void;
    /** Limit the options to these roles (e.g. ["TECHNICIAN"]). Omit for all staff. */
    roles?: string[];
    placeholder?: string;
}

function displayName(u: PickerUser): string {
    return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
}

/**
 * Searchable staff selector fed by GET /users. Reusable: pass `roles` to narrow
 * (e.g. technicians only). Shows name and role so the right person is obvious
 * without pasting a raw user ID.
 */
export function UserPicker({ value, onChange, roles, placeholder = "Select a person" }: UserPickerProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const { data, isLoading } = useQuery<PickerUser[]>({
        queryKey: ["user-picker"],
        queryFn: () => api.get("/users").then((r) => r.data.data.users as PickerUser[]),
    });

    const users = useMemo(() => {
        const all = data ?? [];
        return roles && roles.length > 0 ? all.filter((u) => roles.includes(u.role)) : all;
    }, [data, roles]);

    const selected = users.find((u) => u.id === value) ?? null;

    const visible = useMemo(() => {
        if (!query) return users;
        const q = query.toLowerCase();
        return users.filter((u) => `${displayName(u)} ${u.email} ${u.role}`.toLowerCase().includes(q));
    }, [users, query]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                    {selected ? (
                        <span className="truncate">
                            <span className="font-medium">{displayName(selected)}</span>
                            <span className="text-muted-foreground"> · {selected.role}</span>
                        </span>
                    ) : (
                        <span className="text-muted-foreground">{placeholder}</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <div className="flex items-center gap-2 border-b px-3 py-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search by name or role"
                        className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
                    />
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                    {isLoading ? (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>
                    ) : visible.length === 0 ? (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">No people found</p>
                    ) : (
                        visible.map((u) => (
                            <button
                                key={u.id}
                                type="button"
                                onClick={() => {
                                    onChange(u.id);
                                    setOpen(false);
                                    setQuery("");
                                }}
                                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                            >
                                <Check className={cn("mt-0.5 h-4 w-4 shrink-0", u.id === value ? "opacity-100" : "opacity-0")} />
                                <span className="min-w-0">
                                    <span className="block truncate font-medium">{displayName(u)}</span>
                                    <span className="block truncate text-xs text-muted-foreground">{u.role}</span>
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
