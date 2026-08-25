"use client";

import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import api from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

const schema = z
    .object({
        password: z
            .string()
            .min(8, "At least 8 characters")
            .regex(
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
                "Needs an uppercase letter, a lowercase letter and a digit"
            ),
        confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, {
        message: "Passwords do not match",
        path: ["confirm"],
    });

type Form = z.infer<typeof schema>;

function ResetPasswordForm() {
    const router = useRouter();
    const token = useSearchParams().get("token") ?? "";
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<Form>({ resolver: zodResolver(schema) });

    const onSubmit = async (data: Form) => {
        try {
            setError(null);
            await api.post("/auth/reset-password", { token, password: data.password });
            setDone(true);
            setTimeout(() => router.push("/login"), 1800);
        } catch (err: any) {
            setError(err.response?.data?.message || "Could not reset the password. Try again.");
        }
    };

    if (!token) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Link not valid</h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        This reset link is missing its token. Request a new one.
                    </p>
                </div>
                <Link
                    href="/forgot-password"
                    className="text-sm font-medium text-foreground hover:underline"
                >
                    Send a new reset link
                </Link>
            </div>
        );
    }

    if (done) {
        return (
            <div className="space-y-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Password updated</h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        Taking you to the sign-in page…
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Signing in on your other devices will need the new password.
                </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="space-y-1.5">
                    <Label htmlFor="password">New password</Label>
                    <Input
                        id="password"
                        type="password"
                        autoComplete="new-password"
                        {...register("password")}
                    />
                    {errors.password && (
                        <p className="text-xs text-destructive">{errors.password.message}</p>
                    )}
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="confirm">Confirm password</Label>
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

                <Button
                    type="submit"
                    className="h-10 w-full bg-slate-900 hover:bg-slate-800"
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
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-slate-100" />}>
            <ResetPasswordForm />
        </Suspense>
    );
}
