"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import api from "../../../../lib/api";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { useAuthStore } from "../../../../store/auth";
import { displayName } from "../../../../lib/utils";

const schema = z
    .object({
        currentPassword: z.string().min(1, "Enter your current password"),
        newPassword: z
            .string()
            .min(8, "At least 8 characters")
            .regex(
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
                "Needs an uppercase letter, a lowercase letter and a digit"
            ),
        confirm: z.string(),
    })
    .refine((v) => v.newPassword === v.confirm, {
        message: "Passwords do not match",
        path: ["confirm"],
    });

type Form = z.infer<typeof schema>;

export default function AccountSettingsPage() {
    const user = useAuthStore((s) => s.user);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<Form>({ resolver: zodResolver(schema) });

    const onSubmit = async (data: Form) => {
        try {
            setError(null);
            setSaved(false);
            await api.post("/auth/change-password", {
                currentPassword: data.currentPassword,
                newPassword: data.newPassword,
            });
            reset();
            setSaved(true);
        } catch (err: any) {
            setError(err.response?.data?.message || "Could not update the password.");
        }
    };

    return (
        <div className="max-w-xl space-y-6">
            <div className="surface-card p-6">
                <h2 className="font-semibold">Your details</h2>
                <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Name</dt>
                        <dd className="font-medium">{displayName(user)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Email</dt>
                        <dd className="font-medium">{user?.email}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Role</dt>
                        <dd className="font-medium">{user?.role}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Company</dt>
                        <dd className="font-medium">{user?.companyName}</dd>
                    </div>
                </dl>
                <p className="mt-4 text-xs text-muted-foreground">
                    Name, email and role are managed by your administrator under Team.
                </p>
            </div>

            <div className="surface-card p-6">
                <div className="flex items-center gap-2">
                    <div className="icon-tile bg-slate-100 text-slate-600">
                        <KeyRound className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="font-semibold">Change password</h2>
                        <p className="text-xs text-muted-foreground">
                            Use at least 8 characters with upper and lower case and a digit.
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="currentPassword">Current password</Label>
                        <Input
                            id="currentPassword"
                            type="password"
                            autoComplete="current-password"
                            {...register("currentPassword")}
                        />
                        {errors.currentPassword && (
                            <p className="text-xs text-destructive">
                                {errors.currentPassword.message}
                            </p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="newPassword">New password</Label>
                        <Input
                            id="newPassword"
                            type="password"
                            autoComplete="new-password"
                            {...register("newPassword")}
                        />
                        {errors.newPassword && (
                            <p className="text-xs text-destructive">{errors.newPassword.message}</p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="confirm">Confirm new password</Label>
                        <Input
                            id="confirm"
                            type="password"
                            autoComplete="new-password"
                            {...register("confirm")}
                        />
                        {errors.confirm && (
                            <p className="text-xs text-destructive">{errors.confirm.message}</p>
                        )}
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {saved && (
                        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>Password updated.</span>
                        </div>
                    )}

                    <Button
                        type="submit"
                        className="bg-slate-900 hover:bg-slate-800"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                            </>
                        ) : (
                            "Update password"
                        )}
                    </Button>
                </form>
            </div>
        </div>
    );
}
