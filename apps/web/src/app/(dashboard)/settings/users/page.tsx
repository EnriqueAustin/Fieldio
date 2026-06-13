"use client";

import { useEffect, useState } from "react";
import api from "../../../../lib/api";
import { Button } from "../../../../components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../../../../components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "../../../../components/ui/dialog";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, X, Wrench } from "lucide-react";

interface Branch { id: string; name: string }

interface User {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    role: string;
    status: string;
    branchId?: string | null;
    skills?: string[];
    permissions?: { canIssueCoC?: boolean } | null;
}

const inviteSchema = z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(['ADMIN', 'DISPATCHER', 'OFFICE', 'TECHNICIAN', 'CSR', 'SALES', 'ACCOUNTANT']),
    branchId: z.string().optional(),
});

type InviteForm = z.infer<typeof inviteSchema>;

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [catalog, setCatalog] = useState<string[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [skillsUser, setSkillsUser] = useState<User | null>(null);
    const [draftSkills, setDraftSkills] = useState<string[]>([]);
    const [newSkill, setNewSkill] = useState("");

    const fetchAll = async () => {
        try {
            const [u, b, c] = await Promise.all([
                api.get("/users"),
                api.get("/branches"),
                api.get("/users/skills-catalog"),
            ]);
            setUsers(u.data.data.users);
            setBranches(b.data.data.branches);
            setCatalog(c.data.data.skills);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => { fetchAll(); }, []);

    const {
        register, handleSubmit, reset, formState: { isSubmitting },
    } = useForm<InviteForm>({
        resolver: zodResolver(inviteSchema),
        defaultValues: { role: 'TECHNICIAN' }
    });

    const onSubmit = async (data: InviteForm) => {
        try {
            await api.post("/users", { ...data, branchId: data.branchId || null });
            setIsOpen(false); reset(); fetchAll();
        } catch (e) { console.error(e); }
    };

    const openSkills = (u: User) => {
        setSkillsUser(u);
        setDraftSkills([...(u.skills ?? [])]);
        setNewSkill("");
    };

    const addSkill = (s: string) => {
        const v = s.trim();
        if (!v) return;
        if (draftSkills.includes(v)) return;
        setDraftSkills([...draftSkills, v]);
        setNewSkill("");
    };

    const saveSkills = async () => {
        if (!skillsUser) return;
        try {
            await api.patch(`/users/${skillsUser.id}/skills`, { skills: draftSkills });
            setSkillsUser(null);
            fetchAll();
        } catch (e) { console.error(e); }
    };

    const updateBranch = async (userId: string, branchId: string) => {
        await api.patch(`/users/${userId}`, { branchId: branchId || null });
        fetchAll();
    };

    const toggleCoC = async (userId: string, current: boolean) => {
        await api.patch(`/users/${userId}`, { canIssueCoC: !current });
        fetchAll();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium">Team Members</h3>
                    <p className="text-sm text-muted-foreground">
                        Manage your team access, skills and branch assignments.
                    </p>
                </div>
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" /> Add Member
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Invite Team Member</DialogTitle>
                            <DialogDescription>
                                Create a new user account for your organization.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label htmlFor="firstName">First Name</Label>
                                    <Input id="firstName" {...register("firstName")} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="lastName">Last Name</Label>
                                    <Input id="lastName" {...register("lastName")} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" {...register("email")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Temporary Password</Label>
                                <Input id="password" type="password" {...register("password")} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label htmlFor="role">Role</Label>
                                    <select {...register("role")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                        <option value="TECHNICIAN">Technician</option>
                                        <option value="DISPATCHER">Dispatcher</option>
                                        <option value="OFFICE">Office</option>
                                        <option value="ADMIN">Admin</option>
                                        <option value="CSR">CSR</option>
                                        <option value="SALES">Sales</option>
                                        <option value="ACCOUNTANT">Accountant</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="branchId">Branch</Label>
                                    <select {...register("branchId")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                        <option value="">— None —</option>
                                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <Button type="submit" disabled={isSubmitting} className="w-full">
                                {isSubmitting ? "Creating..." : "Create User"}
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Branch</TableHead>
                            <TableHead>Skills</TableHead>
                            <TableHead>Issue CoC</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell>
                                    {[user.firstName, user.lastName].filter(Boolean).join(" ") || "-"}
                                </TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell className="font-medium">{user.role}</TableCell>
                                <TableCell>
                                    <select
                                        value={user.branchId ?? ""}
                                        onChange={(e) => updateBranch(user.id, e.target.value)}
                                        className="h-8 rounded border border-input bg-background px-2 text-xs"
                                    >
                                        <option value="">—</option>
                                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-1 max-w-[260px]">
                                        {(user.skills ?? []).slice(0, 4).map(s => (
                                            <span key={s} className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">{s}</span>
                                        ))}
                                        {(user.skills?.length ?? 0) > 4 && (
                                            <span className="text-[11px] text-muted-foreground">+{(user.skills!.length - 4)}</span>
                                        )}
                                        {(user.skills?.length ?? 0) === 0 && (
                                            <span className="text-[11px] text-muted-foreground">no skills</span>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <label className="inline-flex cursor-pointer items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(user.permissions?.canIssueCoC)}
                                            onChange={() => toggleCoC(user.id, Boolean(user.permissions?.canIssueCoC))}
                                            className="h-4 w-4 cursor-pointer accent-emerald-600"
                                        />
                                        <span className="text-xs text-muted-foreground">
                                            {user.permissions?.canIssueCoC ? "Allowed" : "—"}
                                        </span>
                                    </label>
                                </TableCell>
                                <TableCell>{user.status}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="sm" onClick={() => openSkills(user)}>
                                        <Wrench className="mr-1 h-3 w-3" /> Skills
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={!!skillsUser} onOpenChange={(open) => !open && setSkillsUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit skills · {skillsUser?.firstName || skillsUser?.email}</DialogTitle>
                        <DialogDescription>
                            Skills are used by Suggest Tech to match jobs to the right people.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-2 min-h-[2.5rem] rounded border border-dashed p-2">
                            {draftSkills.length === 0 && (
                                <span className="text-xs text-muted-foreground">No skills yet — add some below</span>
                            )}
                            {draftSkills.map(s => (
                                <span key={s} className="inline-flex items-center gap-1 rounded bg-slate-900 text-white px-2 py-0.5 text-xs">
                                    {s}
                                    <button onClick={() => setDraftSkills(draftSkills.filter(x => x !== s))}>
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <Input
                                value={newSkill}
                                onChange={(e) => setNewSkill(e.target.value)}
                                placeholder="e.g. Gas Safe, Drainage, Boiler Install"
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(newSkill); } }}
                            />
                            <Button type="button" onClick={() => addSkill(newSkill)}>Add</Button>
                        </div>
                        {catalog.length > 0 && (
                            <div>
                                <p className="text-xs text-muted-foreground mb-1">Click to quick-add:</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {catalog.filter(s => !draftSkills.includes(s)).map(s => (
                                        <button
                                            key={s}
                                            onClick={() => addSkill(s)}
                                            className="rounded border border-border bg-white px-2 py-0.5 text-[11px] hover:bg-slate-50"
                                        >+ {s}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="ghost" onClick={() => setSkillsUser(null)}>Cancel</Button>
                            <Button onClick={saveSkills}>Save</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
