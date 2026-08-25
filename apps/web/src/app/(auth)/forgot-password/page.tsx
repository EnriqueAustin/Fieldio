"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Loader2, MailCheck } from "lucide-react";
import api from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

const schema = z.object({ email: z.string().email("Enter a valid email address") });
type Form = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<Form>({ resolver: zodResolver(schema) });

    const onSubmit = async (data: Form) => {
        try {
            setError(null);
            await api.post("/auth/forgot-password", data);
            // The API answers the same way whether or not the address is on
            // file, so the UI must not imply the account exists either.
            setSent(true);
        } catch (err: any) {
            setError(err.response?.data?.message || "Could not send the reset link. Try again.");
        }
    };

    if (sent) {
        return (
            <div className="space-y-6">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <MailCheck className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                        If that address is registered, a reset link is on its way. The link expires
                        in one hour.
                    </p>
                </div>
                <Link
                    href="/login"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to sign in
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Enter your work email and we will send you a link to choose a new one.
                </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                        id="email"
                        type="email"
                        placeholder="you@company.com"
                        autoComplete="email"
                        {...register("email")}
                    />
                    {errors.email && (
                        <p className="text-xs text-destructive">{errors.email.message}</p>
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
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                        </>
                    ) : (
                        "Send reset link"
                    )}
                </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
                Remembered it?{" "}
                <Link href="/login" className="font-medium text-foreground hover:underline">
                    Back to sign in
                </Link>
            </p>
        </div>
    );
}
