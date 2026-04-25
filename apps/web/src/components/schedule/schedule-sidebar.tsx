"use client";

import { useEffect, useState } from "react";
import api from "../../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Draggable } from "@fullcalendar/interaction";

interface User {
    id: string;
    email: string;
    role: string;
    status: string;
}

export function ScheduleSidebar() {
    const [techs, setTechs] = useState<User[]>([]);

    useEffect(() => {
        const fetchTechs = async () => {
            try {
                const res = await api.get('/users');
                // Filter client side for now or query param later
                const technicians = res.data.data.users.filter((u: User) => u.role === 'TECHNICIAN');
                setTechs(technicians);
            } catch (e) {
                console.error(e);
            }
        };
        fetchTechs();

        // Initialize Draggable for external events (Technicians to Jobs)
        // Note: This requires the calendar to identify these valid drop targets
        // For V1, we just list them. implementing drag-to-assign is complex 
        // without "ExternalEvent" setup on the calendar ref side.
        // We will just display availability for now.
    }, []);

    return (
        <div className="w-64 flex flex-col gap-4">
            <Card>
                <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium">Technicians</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {techs.length === 0 && <p className="text-xs text-muted-foreground">No technicians found.</p>}
                    {techs.map((tech) => (
                        <div key={tech.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer border">
                            <Avatar className="h-6 w-6 text-[10px]">
                                <AvatarFallback>{tech.email[0].toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="overflow-hidden">
                                <p className="text-sm font-medium truncate">{tech.email}</p>
                                <p className="text-[10px] text-muted-foreground">Available</p>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Card className="flex-1">
                <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium">Unassigned Jobs</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-xs text-muted-foreground italic">Drag jobs here to unschedule (Stub)</p>
                </CardContent>
            </Card>
        </div>
    );
}

