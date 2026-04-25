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
import { Plus } from "lucide-react";

interface User {
    id: string;
    email: string;
    role: string;
    status: string;
}

const inviteSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(['ADMIN', 'DISPATCHER', 'OFFICE', 'TECHNICIAN']),
});

type InviteForm = z.infer<typeof inviteSchema>;

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [isOpen, setIsOpen] = useState(false);

    const fetchUsers = async () => {
        try {
            const res = await api.get("/users");
            setUsers(res.data.data.users);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const {
        register,
        handleSubmit,
        reset,
        formState: { isSubmitting },
    } = useForm<InviteForm>({
        resolver: zodResolver(inviteSchema),
        defaultValues: { role: 'TECHNICIAN' }
    });

    const onSubmit = async (data: InviteForm) => {
        try {
            await api.post("/users", data);
            setIsOpen(false);
            reset();
            fetchUsers();
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium">Team Members</h3>
                    <p className="text-sm text-muted-foreground">
                        Manage your team access and roles.
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
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" {...register("email")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">Temporary Password</Label>
                                <Input id="password" type="password" {...register("password")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role">Role</Label>
                                <select {...register("role")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                                    <option value="TECHNICIAN">Technician</option>
                                    <option value="DISPATCHER">Dispatcher</option>
                                    <option value="OFFICE">Office</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
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
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell>{user.email}</TableCell>
                                <TableCell className="font-medium">{user.role}</TableCell>
                                <TableCell>{user.status}</TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="sm">Edit</Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

