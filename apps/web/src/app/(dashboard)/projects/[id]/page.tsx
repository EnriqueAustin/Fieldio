"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, notFound } from "next/navigation";
import api from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, DollarSign, Briefcase, Receipt, FileText } from "lucide-react";
import { StatusPill } from "@/components/ui/status-pill";

interface Project {
    id: string;
    name: string;
    status: string;
    budget?: string | number | null;
    startDate?: string | null;
    endDate?: string | null;
    description?: string | null;
    customer?: { id: string; name: string } | null;
    property?: { id: string; addressLine1: string; city: string } | null;
    jobs: Array<{
        id: string;
        title: string;
        status: string;
        scheduledStart?: string | null;
    }>;
    estimates: Array<{
        id: string;
        number?: string | null;
        status: string;
        total: string | number;
    }>;
    invoices: Array<{
        id: string;
        number?: string | null;
        status: string;
        total: string | number;
    }>;
}

const formatMoney = (amount: number | string | null | undefined) =>
    new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
        maximumFractionDigits: 2,
    }).format(Number(amount ?? 0));

export default function ProjectDetailsPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id as string;

    const { data, isLoading, isError } = useQuery<Project>({
        queryKey: ["project", id],
        queryFn: async () => {
            const res = await api.get(`/projects/${id}`);
            return res.data?.data?.project as Project;
        },
        enabled: !!id,
    });

    if (isError) notFound();

    if (isLoading || !data) {
        return (
            <div className="flex-1 space-y-4 p-8 pt-6">
                <div className="text-sm text-muted-foreground">Loading project…</div>
            </div>
        );
    }

    const project = data;
    const activeJobs = project.jobs.filter((j) => j.status !== "COMPLETED" && j.status !== "CANCELED").length;
    const invoicedTotal = project.invoices.reduce((s, i) => s + Number(i.total ?? 0), 0);

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">{project.name}</h2>
                    <p className="text-muted-foreground flex items-center gap-2 mt-1">
                        <Briefcase className="h-4 w-4" />
                        {project.customer?.name ?? "No customer"}
                        {project.property && (
                            <span className="text-xs">· {project.property.addressLine1}, {project.property.city}</span>
                        )}
                        <Badge variant="outline" className="ml-2">{project.status}</Badge>
                    </p>
                </div>
            </div>

            {project.description && (
                <Card>
                    <CardContent className="p-4 text-sm text-slate-700">{project.description}</CardContent>
                </Card>
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatMoney(project.budget)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Start date</CardTitle>
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {project.startDate ? new Date(project.startDate).toLocaleDateString() : "—"}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active jobs</CardTitle>
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{activeJobs}</div>
                        <p className="text-xs text-muted-foreground">{project.jobs.length} total</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Invoiced</CardTitle>
                        <Receipt className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatMoney(invoicedTotal)}</div>
                        <p className="text-xs text-muted-foreground">{project.invoices.length} invoice(s)</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="jobs" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="jobs">Linked Jobs ({project.jobs.length})</TabsTrigger>
                    <TabsTrigger value="estimates">Estimates ({project.estimates.length})</TabsTrigger>
                    <TabsTrigger value="invoices">Invoices ({project.invoices.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="jobs" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Jobs</CardTitle>
                            <CardDescription>Jobs associated with this project.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {project.jobs.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No jobs linked yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {project.jobs.map((job) => (
                                        <Link
                                            key={job.id}
                                            href={`/jobs/${job.id}`}
                                            className="flex items-center justify-between rounded-lg border p-3 hover:bg-slate-50"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium text-sm truncate">{job.title}</p>
                                                {job.scheduledStart && (
                                                    <p className="text-xs text-muted-foreground">
                                                        {new Date(job.scheduledStart).toLocaleString()}
                                                    </p>
                                                )}
                                            </div>
                                            <StatusPill status={job.status} />
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="estimates" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Estimates</CardTitle>
                            <CardDescription>Estimates sent for this project.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {project.estimates.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No estimates linked yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {project.estimates.map((est) => (
                                        <div
                                            key={est.id}
                                            className="flex items-center justify-between rounded-lg border p-3"
                                        >
                                            <div className="flex items-center gap-2">
                                                <FileText className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-medium text-sm">{est.number || est.id.slice(0, 8)}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-medium">{formatMoney(est.total)}</span>
                                                <Badge variant="outline">{est.status}</Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="invoices" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Invoices</CardTitle>
                            <CardDescription>Invoices generated for this project.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {project.invoices.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No invoices linked yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {project.invoices.map((inv) => (
                                        <div
                                            key={inv.id}
                                            className="flex items-center justify-between rounded-lg border p-3"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Receipt className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-medium text-sm">{inv.number || inv.id.slice(0, 8)}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-medium">{formatMoney(inv.total)}</span>
                                                <Badge variant="outline">{inv.status}</Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
