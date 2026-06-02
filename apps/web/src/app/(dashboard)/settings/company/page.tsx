"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";
import api from "../../../../lib/api";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card";
import { defaultCompanySettings, normalizeCompanySettings } from "../../../../lib/company-settings";

const companySchema = z.object({
    name: z.string().min(2),
    settings: z.object({
        regional: z.object({
            homeMarket: z.enum(["ZA", "INTERNATIONAL"]),
            locale: z.string().min(2),
            timezone: z.string().min(2),
            currency: z.string().min(3).max(3),
        }),
        billing: z.object({
            taxLabel: z.string().min(1),
            taxRate: z.coerce.number().min(0).max(100),
            taxNumber: z.string().optional(),
            invoiceHeading: z.string().min(1),
            companyRegistrationNumber: z.string().optional(),
            paymentTermsDays: z.coerce.number().int().min(0).max(365),
            paymentMethods: z.object({
                cardEnabled: z.boolean(),
                eftEnabled: z.boolean(),
                cashEnabled: z.boolean(),
                payFastEnabled: z.boolean(),
            }),
            eftDetails: z.object({
                bankName: z.string().optional(),
                accountName: z.string().optional(),
                accountNumber: z.string().optional(),
                branchCode: z.string().optional(),
                accountType: z.string().optional(),
                referencePrefix: z.string().optional(),
                paymentInstructions: z.string().optional(),
            }),
            payFast: z.object({
                merchantId: z.string().optional(),
                merchantKey: z.string().optional(),
                passphrase: z.string().optional(),
                sandbox: z.boolean(),
            }),
        }),
        integrations: z.object({
            xero: z.object({
                enabled: z.boolean(),
                tenantId: z.string().optional(),
                tenantName: z.string().optional(),
                syncContacts: z.boolean(),
                syncInvoices: z.boolean(),
            }),
            whatsapp: z.object({
                enabled: z.boolean(),
                businessNumber: z.string().optional(),
            }),
        }),
        contact: z.object({
            phone: z.string().optional(),
            email: z.string().optional(),
            website: z.string().optional(),
        }),
    }),
});

type CompanyForm = z.infer<typeof companySchema>;

export default function CompanySettingsPage() {
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting } } = useForm<CompanyForm>({
        resolver: zodResolver(companySchema),
        defaultValues: {
            name: "",
            settings: defaultCompanySettings,
        },
    });
    const homeMarket = watch("settings.regional.homeMarket");

    useEffect(() => {
        const fetchCompany = async () => {
            try {
                const res = await api.get('/company/me');
                const company = res.data.data.company;
                reset({
                    name: company.name,
                    settings: normalizeCompanySettings(company.settings),
                });
            } catch (e) {
                console.error(e);
            }
        };
        fetchCompany();
    }, [reset]);

    useEffect(() => {
        if (homeMarket === "ZA") {
            setValue("settings.regional.locale", "en-ZA");
            setValue("settings.regional.timezone", "Africa/Johannesburg");
            setValue("settings.regional.currency", "ZAR");
            setValue("settings.billing.taxLabel", "VAT");
        }
    }, [homeMarket, setValue]);

    const onSubmit = async (data: CompanyForm) => {
        try {
            setSuccess(null);
            setError(null);
            await api.patch("/company/me", data);
            setSuccess("Company settings updated successfully.");
        } catch (err: any) {
            console.error(err);
            setError(err?.response?.data?.message ?? "Could not update company settings.");
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Company Settings</h3>
                <p className="text-sm text-muted-foreground">
                    Configure branding, regional billing defaults, and South Africa / international payment behavior.
                </p>
            </div>
            <Card className="surface-card">
                <CardHeader>
                    <CardTitle>Organization Details</CardTitle>
                    <CardDescription>This information appears on invoices, payment pages, and customer communications.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                            <Label htmlFor="name">Company Name</Label>
                            <Input id="name" {...register("name")} />
                        </div>
                            <div className="space-y-2">
                                <Label htmlFor="homeMarket">Primary Market</Label>
                                <select
                                    id="homeMarket"
                                    {...register("settings.regional.homeMarket")}
                                    className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                                >
                                    <option value="ZA">South Africa</option>
                                    <option value="INTERNATIONAL">International</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                                <Label htmlFor="locale">Locale</Label>
                                <Input id="locale" {...register("settings.regional.locale")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="timezone">Timezone</Label>
                                <Input id="timezone" {...register("settings.regional.timezone")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="currency">Currency</Label>
                                <Input id="currency" {...register("settings.regional.currency")} />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-4">
                            <div className="space-y-2">
                                <Label htmlFor="taxLabel">Tax Label</Label>
                                <Input id="taxLabel" {...register("settings.billing.taxLabel")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="taxRate">Tax Rate %</Label>
                                <Input id="taxRate" type="number" step="0.01" {...register("settings.billing.taxRate")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="taxNumber">Tax Number</Label>
                                <Input id="taxNumber" {...register("settings.billing.taxNumber")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="paymentTermsDays">Payment Terms (days)</Label>
                                <Input id="paymentTermsDays" type="number" {...register("settings.billing.paymentTermsDays")} />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="invoiceHeading">Invoice Heading</Label>
                                <Input id="invoiceHeading" {...register("settings.billing.invoiceHeading")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="companyRegistrationNumber">Company Registration Number</Label>
                                <Input id="companyRegistrationNumber" {...register("settings.billing.companyRegistrationNumber")} />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <h4 className="text-sm font-semibold">Accepted payment methods</h4>
                                <p className="text-xs text-muted-foreground">Choose which options customers see on invoice pages.</p>
                            </div>
                            <div className="grid gap-3 md:grid-cols-3">
                                <label className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                                    <input type="checkbox" {...register("settings.billing.paymentMethods.cardEnabled")} />
                                    <span>Card payments</span>
                                </label>
                                <label className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                                    <input type="checkbox" {...register("settings.billing.paymentMethods.eftEnabled")} />
                                    <span>EFT / bank transfer</span>
                                </label>
                                <label className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                                    <input type="checkbox" {...register("settings.billing.paymentMethods.cashEnabled")} />
                                    <span>Cash accepted</span>
                                </label>
                                <label className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                                    <input type="checkbox" {...register("settings.billing.paymentMethods.payFastEnabled")} />
                                    <span>PayFast</span>
                                </label>
                            </div>
                        </div>

                        <div className="space-y-4 rounded-2xl border border-border/80 bg-slate-50/70 p-5">
                            <div>
                                <h4 className="text-sm font-semibold">EFT / bank transfer details</h4>
                                <p className="text-xs text-muted-foreground">Especially important for South African customers who prefer EFT.</p>
                            </div>
                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="space-y-2">
                                    <Label>Bank Name</Label>
                                    <Input {...register("settings.billing.eftDetails.bankName")} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Account Name</Label>
                                    <Input {...register("settings.billing.eftDetails.accountName")} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Account Number</Label>
                                    <Input {...register("settings.billing.eftDetails.accountNumber")} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Branch Code</Label>
                                    <Input {...register("settings.billing.eftDetails.branchCode")} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Account Type</Label>
                                    <Input {...register("settings.billing.eftDetails.accountType")} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Reference Prefix</Label>
                                    <Input {...register("settings.billing.eftDetails.referencePrefix")} placeholder="INV" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Payment Instructions</Label>
                                <textarea
                                    {...register("settings.billing.eftDetails.paymentInstructions")}
                                    className="min-h-[110px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                                    placeholder="Use your invoice number as the payment reference."
                                />
                            </div>
                        </div>

                        <div className="space-y-4 rounded-2xl border border-border/80 bg-white p-5">
                            <div>
                                <h4 className="text-sm font-semibold">PayFast</h4>
                                <p className="text-xs text-muted-foreground">Enable a South Africa-first card/EFT gateway handoff from customer pay pages.</p>
                            </div>
                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="space-y-2">
                                    <Label>Merchant ID</Label>
                                    <Input {...register("settings.billing.payFast.merchantId")} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Merchant Key</Label>
                                    <Input {...register("settings.billing.payFast.merchantKey")} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Passphrase</Label>
                                    <Input type="password" {...register("settings.billing.payFast.passphrase")} />
                                </div>
                            </div>
                            <label className="flex items-center gap-3 text-sm">
                                <input type="checkbox" {...register("settings.billing.payFast.sandbox")} />
                                <span>Use PayFast sandbox</span>
                            </label>
                        </div>

                        <div className="space-y-4 rounded-2xl border border-border/80 bg-slate-50/70 p-5">
                            <div>
                                <h4 className="text-sm font-semibold">Accounting and WhatsApp</h4>
                                <p className="text-xs text-muted-foreground">Store integration state for Xero sync and WhatsApp Business rollout.</p>
                            </div>
                            <div className="grid gap-4 md:grid-cols-3">
                                <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
                                    <input type="checkbox" {...register("settings.integrations.xero.enabled")} />
                                    <span>Xero enabled</span>
                                </label>
                                <div className="space-y-2">
                                    <Label>Xero Tenant ID</Label>
                                    <Input {...register("settings.integrations.xero.tenantId")} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Xero Tenant Name</Label>
                                    <Input {...register("settings.integrations.xero.tenantName")} />
                                </div>
                                <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
                                    <input type="checkbox" {...register("settings.integrations.xero.syncContacts")} />
                                    <span>Sync contacts</span>
                                </label>
                                <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
                                    <input type="checkbox" {...register("settings.integrations.xero.syncInvoices")} />
                                    <span>Sync invoices</span>
                                </label>
                                <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
                                    <input type="checkbox" {...register("settings.integrations.whatsapp.enabled")} />
                                    <span>WhatsApp enabled</span>
                                </label>
                            </div>
                            <div className="space-y-2">
                                <Label>WhatsApp Business Number</Label>
                                <Input {...register("settings.integrations.whatsapp.businessNumber")} />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                                <Label>Support Phone</Label>
                                <Input {...register("settings.contact.phone")} />
                            </div>
                            <div className="space-y-2">
                                <Label>Support Email</Label>
                                <Input {...register("settings.contact.email")} />
                            </div>
                            <div className="space-y-2">
                                <Label>Website</Label>
                                <Input {...register("settings.contact.website")} />
                            </div>
                        </div>

                        {success && <p className="text-sm text-green-600">{success}</p>}
                        {error && <p className="text-sm text-rose-600">{error}</p>}
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Saving..." : "Save Changes"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

