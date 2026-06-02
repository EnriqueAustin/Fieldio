'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
    FolderKanban, Plus, Search, ChevronRight,
    Calendar, DollarSign, Briefcase, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog, DialogContent, DialogDescription,
    DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

type Project = {
    id: string;
    name: string;
    description?: string;
    status: 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELED';
    budget?: number;
    startDate?: string;
    endDate?: string;
    customer: { name: string };
    property: { addressLine1: string; city: string };
    _count?: { jobs: number };
};

const STATUS_CONFIG: Record<Project['status'], { label: string; className: string }> = {
    PLANNING:    { label: 'Planning',     className: 'bg-blue-100 text-blue-700 border-blue-200' },
    IN_PROGRESS: { label: 'In Progress',  className: 'bg-green-100 text-green-700 border-green-200' },
    ON_HOLD:     { label: 'On Hold',      className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    COMPLETED:   { label: 'Completed',    className: 'bg-slate-100 text-slate-700 border-slate-200' },
    CANCELED:    { label: 'Canceled',     className: 'bg-red-100 text-red-700 border-red-200' },
};

function formatCurrency(val?: number) {
    if (!val) return '—';
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(val);
}

export default function ProjectsPage() {
    const router = useRouter();
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ name: '', description: '', budget: '', customerId: '', propertyId: '' });

    const { data, isLoading } = useQuery({
        queryKey: ['projects'],
        queryFn: () => api.get('/projects').then(r => r.data.data),
    });

    const createProject = useMutation({
        mutationFn: (payload: typeof form) =>
            api.post('/projects', {
                ...payload,
                budget: payload.budget ? Number(payload.budget) : undefined,
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['projects'] });
            setOpen(false);
            setForm({ name: '', description: '', budget: '', customerId: '', propertyId: '' });
        },
    });

    const projects: Project[] = data?.projects ?? [];
    const filtered = projects.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.customer?.name?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="flex-1 space-y-6 p-8 pt-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <FolderKanban className="h-8 w-8 text-primary" />
                        Projects
                    </h2>
                    <p className="text-muted-foreground mt-1">
                        Manage large contracts and group multiple jobs together.
                    </p>
                </div>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button id="create-project-btn">
                            <Plus className="mr-2 h-4 w-4" /> New Project
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Create Project</DialogTitle>
                            <DialogDescription>
                                Create a new project to group related jobs and track overall budgets.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="space-y-1">
                                <Label htmlFor="proj-name">Project Name *</Label>
                                <Input
                                    id="proj-name"
                                    placeholder="e.g. Main Street Commercial Refit"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="proj-budget">Budget (ZAR)</Label>
                                <Input
                                    id="proj-budget"
                                    type="number"
                                    placeholder="e.g. 150000"
                                    value={form.budget}
                                    onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="proj-desc">Description</Label>
                                <Textarea
                                    id="proj-desc"
                                    placeholder="Scope of work..."
                                    value={form.description}
                                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Note: Customer and property can be linked after creation from the job screen.
                            </p>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                            <Button
                                disabled={!form.name || createProject.isPending}
                                onClick={() => createProject.mutate(form)}
                            >
                                {createProject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Create Project
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                    id="project-search"
                    placeholder="Search projects..."
                    className="pl-9"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-4">
                {(['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED'] as const).map(status => (
                    <Card key={status} className="border-l-4" style={{ borderLeftColor: status === 'IN_PROGRESS' ? '#22c55e' : status === 'PLANNING' ? '#3b82f6' : status === 'ON_HOLD' ? '#eab308' : '#94a3b8' }}>
                        <CardContent className="pt-4 pb-3">
                            <p className="text-xs text-muted-foreground">{STATUS_CONFIG[status].label}</p>
                            <p className="text-2xl font-bold">{projects.filter(p => p.status === status).length}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Projects List */}
            <Card>
                <CardHeader>
                    <CardTitle>All Projects</CardTitle>
                    <CardDescription>{filtered.length} project{filtered.length !== 1 ? 's' : ''} found</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" /> Loading projects...
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                            <FolderKanban className="h-8 w-8 opacity-40" />
                            <p className="text-sm">{search ? 'No projects match your search.' : 'No projects yet. Create your first one!'}</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {filtered.map(project => (
                                <div
                                    key={project.id}
                                    id={`project-row-${project.id}`}
                                    className="flex items-center justify-between py-3 px-1 hover:bg-accent/50 rounded-lg cursor-pointer transition-colors group"
                                    onClick={() => router.push(`/projects/${project.id}`)}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                            <FolderKanban className="h-4 w-4 text-primary" />
                                        </div>
                                        <div>
                                            <p className="font-medium">{project.name}</p>
                                            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <Briefcase className="h-3 w-3" />
                                                    {project.customer?.name}
                                                </span>
                                                {project.startDate && (
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        {new Date(project.startDate).toLocaleDateString('en-ZA')}
                                                    </span>
                                                )}
                                                {project.budget && (
                                                    <span className="flex items-center gap-1">
                                                        <DollarSign className="h-3 w-3" />
                                                        {formatCurrency(project.budget)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Badge
                                            variant="outline"
                                            className={cn('text-xs', STATUS_CONFIG[project.status].className)}
                                        >
                                            {STATUS_CONFIG[project.status].label}
                                        </Badge>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
