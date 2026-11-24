"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api from "../../../../lib/api";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Switch } from "../../../../components/ui/switch";
import {
    defaultBusinessHours,
    normalizeCompanySettings,
    type BusinessHours,
    type DayKey,
} from "../../../../lib/company-settings";

const DAYS: { key: DayKey; label: string }[] = [
    { key: "mon", label: "Monday" },
    { key: "tue", label: "Tuesday" },
    { key: "wed", label: "Wednesday" },
    { key: "thu", label: "Thursday" },
    { key: "fri", label: "Friday" },
    { key: "sat", label: "Saturday" },
    { key: "sun", label: "Sunday" },
];

// Close must be after open on any day that is open. Mirrors the server refine
// in apps/api company-settings.ts; kept here so the form shows the error inline.
const daySchema = z
    .object({
        open: z.boolean(),
        start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time"),
        end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time"),
    })
    .superRefine((val, ctx) => {
        if (val.open && val.end <= val.start) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Closing time must be after opening time",
                path: ["end"],
            });
        }
    });

const businessHoursSchema = z.object({
    mon: daySchema,
    tue: daySchema,
    wed: daySchema,
    thu: daySchema,
    fri: daySchema,
    sat: daySchema,
    sun: daySchema,
});

export default function BusinessHoursPage() {
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        reset,
        control,
        watch,
        formState: { isSubmitting, errors },
    } = useForm<BusinessHours>({
        resolver: zodResolver(businessHoursSchema),
        defaultValues: defaultBusinessHours,
    });

    useEffect(() => {
        const fetchCompany = async () => {
            try {
                const res = await api.get("/company/me");
                const settings = normalizeCompanySettings(res.data.data.company?.settings);
                reset(settings.businessHours);
            } catch (e) {
                console.error(e);
            }
        };
        fetchCompany();
    }, [reset]);

    const onSubmit = async (data: BusinessHours) => {
        try {
            setSuccess(null);
            setError(null);
            await api.patch("/company/me", { settings: { businessHours: data } });
            setSuccess("Business hours saved.");
        } catch (err: any) {
            console.error(err);
            setError(err?.response?.data?.message ?? "Could not save business hours.");
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Business Hours</h3>
                <p className="text-sm text-muted-foreground">
                    Set your operating hours. These decide which appointment times customers can
                    request on your public booking page.
                </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <Card className="surface-card">
                    <CardContent className="p-6 space-y-2">
                        {DAYS.map(({ key, label }) => {
                            const isOpen = watch(`${key}.open`);
                            return (
                                <div
                                    key={key}
                                    className="flex flex-wrap items-center justify-between gap-3 py-3 border-b last:border-0"
                                >
                                    <div className="flex items-center space-x-4 w-36">
                                        <Controller
                                            control={control}
                                            name={`${key}.open`}
                                            render={({ field }) => (
                                                <Switch
                                                    id={`open-${key}`}
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                />
                                            )}
                                        />
                                        <Label
                                            htmlFor={`open-${key}`}
                                            className={isOpen ? "" : "text-muted-foreground"}
                                        >
                                            {label}
                                        </Label>
                                    </div>
                                    {isOpen ? (
                                        <div className="flex flex-col items-end gap-1">
                                            <div className="flex items-center space-x-2">
                                                <Input
                                                    type="time"
                                                    className="w-32"
                                                    {...register(`${key}.start`)}
                                                />
                                                <span className="text-muted-foreground">-</span>
                                                <Input
                                                    type="time"
                                                    className="w-32"
                                                    {...register(`${key}.end`)}
                                                />
                                            </div>
                                            {errors[key]?.end?.message && (
                                                <span className="text-xs text-rose-600">
                                                    {errors[key]?.end?.message as string}
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-sm text-muted-foreground pr-2">Closed</span>
                                    )}
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>

                {success && <p className="text-sm text-green-600">{success}</p>}
                {error && <p className="text-sm text-rose-600">{error}</p>}

                <div className="flex justify-end">
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Saving..." : "Save Hours"}
                    </Button>
                </div>
            </form>
        </div>
    );
}
