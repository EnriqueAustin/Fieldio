"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api from "../../../lib/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";

const registerSchema = z.object({
    companyName: z.string().min(2, "Company name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

    const onSubmit = async (data: RegisterForm) => {
        try {
            setError(null);
            await api.post("/auth/register", data);
            router.push("/login?registered=true");
        } catch (err: any) {
            setError(err.response?.data?.message || "Registration failed");
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Start your free trial</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Create your workspace in under a minute.
                </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="space-y-1.5">
                    <Label htmlFor="companyName">Company name</Label>
                    <Input id="companyName" placeholder="Acme Plumbing" {...register("companyName")} />
                    {errors.companyName && (
                        <p className="text-xs text-destructive">{errors.companyName.message}</p>
                    )}
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="email">Work email</Label>
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

                <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                        id="password"
                        type="password"
                        placeholder="At least 8 characters"
                        autoComplete="new-password"
                        {...register("password")}
                    />
                    {errors.password && (
                        <p className="text-xs text-destructive">{errors.password.message}</p>
                    )}
                </div>

                {error && (
                    <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <Button
                    type="submit"
                    className="w-full h-10 bg-slate-900 hover:bg-slate-800"
                    disabled={isSubmitting}
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating workspace…
                        </>
                    ) : (
                        "Create account"
                    )}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                    By signing up you agree to our Terms and Privacy Policy.
                </p>
            </form>

            <p className="text-sm text-center text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-foreground hover:underline">
                    Sign in
                </Link>
            </p>
        </div>
    );
}
