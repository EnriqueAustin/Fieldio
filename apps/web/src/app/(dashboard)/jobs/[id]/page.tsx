"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MapPin, CheckCircle2, Circle, DollarSign, FileText, Plus, Receipt } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Job {
    id: string;
    title: string;
    status: string;
    description: string;
    scheduledStart: string;
    scheduledEnd: string;
    customer: { name: string; phone: string; email: string };
    property: { addressLine1: string; city: string; state: string; zip: string };
    checklist: { id: string; label: string; isCompleted: boolean }[];
    tech: { email: string } | null;
    invoice: { id: string; total: string; status: string } | null;
}

interface Expense {
    id: string;
    description: string;
    amount: string;
    date: string;
}

interface JobPhoto {
    id: string;
    url: string;
    thumbnailUrl?: string | null;
    caption?: string | null;
    createdAt: string;
}

export default function JobDetailPage() {
    const { id } = useParams();
    const [job, setJob] = useState<Job | null>(null);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [photos, setPhotos] = useState<JobPhoto[]>([]);
    const [newExpense, setNewExpense] = useState({ description: '', amount: '' });
    const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoCaption, setPhotoCaption] = useState("");
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [photoError, setPhotoError] = useState<string | null>(null);

    const fetchJob = async () => {
        try {
            const res = await api.get(`/jobs/${id}`);
            setJob(res.data.data.job);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchExpenses = async () => {
        try {
            const res = await api.get(`/operations/jobs/${id}/expenses`);
            setExpenses(res.data.data.expenses);
        } catch (e) {
            console.error(e);
        }
    }

    const fetchPhotos = async () => {
        try {
            const res = await api.get(`/media/jobs/${id}/photos`);
            setPhotos(res.data.data.photos ?? []);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        if (id) {
            fetchJob();
            fetchExpenses();
            fetchPhotos();
        }
    }, [id]);

    const updateStatus = async (status: string) => {
        if (!job) return;
        try {
            await api.patch(`/jobs/${job.id}/status`, { status });
            fetchJob();
        } catch (e) {
            console.error(e);
        }
    };

    const toggleChecklist = async (checkId: string, currentStatus: boolean) => {
        if (!job) return;
        try {
            await api.patch(`/jobs/${job.id}/checklist/${checkId}`, { isCompleted: !currentStatus });
            fetchJob();
        } catch (e) {
            console.error(e);
        }
    };

    const generateInvoice = async () => {
        if (!job) return;
        try {
            await api.post(`/finance/jobs/${job.id}/invoice`);
            fetchJob();
        } catch (e) {
            console.error(e);
        }
    };

    const addExpense = async () => {
        if (!job) return;
        try {
            await api.post(`/operations/jobs/${job.id}/expenses`, {
                ...newExpense,
                amount: parseFloat(newExpense.amount),
                date: new Date().toISOString()
            });
            setIsExpenseDialogOpen(false);
            setNewExpense({ description: '', amount: '' });
            fetchExpenses();
        } catch (e) {
            console.error(e);
        }
    };

    const uploadPhoto = async () => {
        if (!job || !photoFile) return;

        setIsUploadingPhoto(true);
        setPhotoError(null);

        try {
            const formData = new FormData();
            formData.append("photo", photoFile);
            if (photoCaption.trim()) {
                formData.append("caption", photoCaption.trim());
            }

            await api.post(`/media/jobs/${job.id}/photos`, formData);
            setPhotoFile(null);
            setPhotoCaption("");
            const fileInput = document.getElementById("job-photo-upload") as HTMLInputElement | null;
            if (fileInput) fileInput.value = "";
            fetchPhotos();
        } catch (e: any) {
            console.error(e);
            setPhotoError(e?.response?.data?.message ?? "Could not upload photo.");
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    const removePhoto = async (photoId: string) => {
        if (!job) return;
        try {
            await api.delete(`/media/photos/${photoId}`);
            setPhotos((current) => current.filter((photo) => photo.id !== photoId));
        } catch (e) {
            console.error(e);
            setPhotoError("Could not remove photo.");
        }
    };

    if (!job) return <div>Loading...</div>;

    const STATUS_STEPS = ['REQUESTED', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED'];
    const currentStepIndex = STATUS_STEPS.indexOf(job.status);

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="text-sm text-muted-foreground">Job #{job.id}</div>
                        <Badge variant="outline">{job.status}</Badge>
                    </div>
                    <h1 className="text-2xl font-bold">{job.title}</h1>
                    <p className="text-muted-foreground">{job.customer.name}</p>
                </div>

                <div className="flex items-center gap-2">
                    {job.status === 'ASSIGNED' && (
                        <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => updateStatus('EN_ROUTE')}>Mark En Route</Button>
                    )}
                    {job.status === 'EN_ROUTE' && (
                        <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => updateStatus('ON_SITE')}>Arrive On Site</Button>
                    )}
                    {job.status === 'ON_SITE' && (
                        <Button className="bg-green-600 hover:bg-green-700" onClick={() => updateStatus('COMPLETED')}>Complete Job</Button>
                    )}
                    {job.invoice && (
                        <Button variant="outline" className="gap-2">
                            <FileText className="h-4 w-4" /> View Invoice
                        </Button>
                    )}
                </div>
            </div>

            {/* Status Stepper */}
            <div className="w-full bg-muted rounded-full h-2.5 mb-6 overflow-hidden flex">
                {STATUS_STEPS.map((step, idx) => (
                    <div
                        key={step}
                        className={`flex-1 h-full ${idx <= currentStepIndex ? 'bg-primary' : 'bg-muted'}`}
                        title={step}
                    />
                ))}
            </div>

            {/* Content */}
            <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Tabs defaultValue="overview">
                        <TabsList>
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                            <TabsTrigger value="checklist">Checklist</TabsTrigger>
                            <TabsTrigger value="finance">Finance</TabsTrigger>
                            <TabsTrigger value="expenses">Expenses</TabsTrigger>
                            <TabsTrigger value="photos">Photos</TabsTrigger>
                        </TabsList>

                        <TabsContent value="overview" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Details</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div>
                                        <h4 className="font-semibold text-sm">Description</h4>
                                        <p className="text-sm text-muted-foreground">{job.description || "No description provided."}</p>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                                        <div>
                                            <div className="font-medium">Service Address</div>
                                            <div className="text-sm text-muted-foreground">
                                                {job.property.addressLine1}<br />
                                                {job.property.city}, {job.property.state} {job.property.zip}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="checklist" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Tasks</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {job.checklist.length === 0 && <p className="text-sm text-muted-foreground">No tasks in checklist.</p>}
                                    {job.checklist.map((item) => (
                                        <div key={item.id}
                                            className="flex items-center gap-3 p-3 border rounded-md cursor-pointer hover:bg-muted"
                                            onClick={() => toggleChecklist(item.id, item.isCompleted)}
                                        >
                                            {item.isCompleted
                                                ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                                                : <Circle className="h-5 w-5 text-gray-400" />
                                            }
                                            <span className={item.isCompleted ? "line-through text-muted-foreground" : ""}>
                                                {item.label}
                                            </span>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="finance" className="space-y-4">
                            {job.invoice ? (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Invoice</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex justify-between items-center bg-muted p-4 rounded-md">
                                            <div>
                                                <div className="font-bold text-lg">${Number(job.invoice.total).toFixed(2)}</div>
                                                <div className="text-sm text-muted-foreground">Status: {job.invoice.status}</div>
                                            </div>
                                            <Button size="sm">View PDF</Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ) : (
                                <Card>
                                    <CardContent className="pt-6 text-center">
                                        <p className="text-muted-foreground mb-4">No invoice generated yet.</p>
                                        <Button onClick={generateInvoice} className="gap-2">
                                            <DollarSign className="h-4 w-4" /> Generate Invoice
                                        </Button>
                                    </CardContent>
                                </Card>
                            )}
                        </TabsContent>

                        <TabsContent value="expenses" className="space-y-4">
                            <Card>
                                <div className="flex items-center justify-between p-6 pb-2">
                                    <CardTitle>Job Expenses</CardTitle>
                                    <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button size="sm" variant="outline" className="gap-2">
                                                <Plus className="h-4 w-4" /> Add Expense
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Add Expense</DialogTitle>
                                            </DialogHeader>
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <Label>Description</Label>
                                                    <Input
                                                        placeholder="e.g. Parking fee"
                                                        value={newExpense.description}
                                                        onChange={e => setNewExpense({ ...newExpense, description: e.target.value })}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Amount</Label>
                                                    <Input
                                                        type="number"
                                                        placeholder="0.00"
                                                        value={newExpense.amount}
                                                        onChange={e => setNewExpense({ ...newExpense, amount: e.target.value })}
                                                    />
                                                </div>
                                            </div>
                                            <DialogFooter>
                                                <Button onClick={addExpense}>Save</Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                                <CardContent>
                                    {expenses.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">No expenses recorded.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {expenses.map(exp => (
                                                <div key={exp.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                                                    <div className="flex items-center gap-3">
                                                        <div className="bg-muted p-2 rounded">
                                                            <Receipt className="h-4 w-4 text-muted-foreground" />
                                                        </div>
                                                        <div>
                                                            <div className="font-medium text-sm">{exp.description}</div>
                                                            <div className="text-xs text-muted-foreground">{format(new Date(exp.date), 'MMM d, yyyy')}</div>
                                                        </div>
                                                    </div>
                                                    <div className="font-medium">-${Number(exp.amount).toFixed(2)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="photos">
                            <Card>
                                <CardContent className="pt-6">
                                    <div className="space-y-6">
                                        <div className="grid gap-4 rounded-2xl border border-dashed border-border p-5 md:grid-cols-[1fr_auto]">
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="job-photo-upload">Upload site photos</Label>
                                                    <Input
                                                        id="job-photo-upload"
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="photo-caption">Caption</Label>
                                                    <Textarea
                                                        id="photo-caption"
                                                        placeholder="Before repair, completed install, damaged part, signed-off work..."
                                                        value={photoCaption}
                                                        onChange={(e) => setPhotoCaption(e.target.value)}
                                                    />
                                                </div>
                                                {photoError && (
                                                    <p className="text-sm text-rose-600">{photoError}</p>
                                                )}
                                            </div>
                                            <div className="flex items-end">
                                                <Button
                                                    onClick={uploadPhoto}
                                                    disabled={!photoFile || isUploadingPhoto}
                                                    className="w-full md:w-auto"
                                                >
                                                    {isUploadingPhoto ? "Uploading..." : "Upload photo"}
                                                </Button>
                                            </div>
                                        </div>

                                        {photos.length === 0 ? (
                                            <div className="rounded-2xl border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                                                No photos uploaded yet. Add before/after images, site conditions, or proof of work.
                                            </div>
                                        ) : (
                                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                                {photos.map((photo) => (
                                                    <div key={photo.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                                                        <img
                                                            src={photo.thumbnailUrl || photo.url}
                                                            alt={photo.caption || "Job photo"}
                                                            className="h-52 w-full object-cover"
                                                        />
                                                        <div className="space-y-3 p-4">
                                                            <div>
                                                                <p className="text-sm font-medium">
                                                                    {photo.caption || "Untitled photo"}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {format(new Date(photo.createdAt), "MMM d, yyyy 'at' h:mm a")}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center justify-between gap-2">
                                                                <a
                                                                    href={photo.url}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                                                                >
                                                                    Open full size
                                                                </a>
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => removePhoto(photo.id)}
                                                                >
                                                                    Delete
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">Schedule</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {job.scheduledStart ? format(new Date(job.scheduledStart), 'h:mm a') : 'TBD'}
                            </div>
                            <div className="text-sm text-muted-foreground">
                                {job.scheduledStart ? format(new Date(job.scheduledStart), 'MMMM d, yyyy') : 'Unscheduled'}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">Technician</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {job.tech ? (
                                <div className="flex items-center gap-3">
                                    <Avatar>
                                        <AvatarFallback>{job.tech.email[0].toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="font-medium">{job.tech.email}</div>
                                        <div className="text-xs text-muted-foreground">Assigned</div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-sm text-muted-foreground italic">Unassigned</div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
