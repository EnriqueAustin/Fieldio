"use client";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { format } from "date-fns";
import { MapPin, Clock, Calendar, CheckCircle } from "lucide-react";
import Link from 'next/link';

interface TechnicianViewProps {
    user: any;
    stats: any;
}

export function TechnicianView({ user, stats }: TechnicianViewProps) {
    // Mock data for now, ideally this comes from the stats or a specific query
    const today = new Date();

    return (
        <div className="space-y-6 pb-20"> {/* pb-20 for mobile nav clearance */}
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold tracking-tight">Good Morning, {user.firstName || 'Tech'}!</h2>
                <p className="text-muted-foreground">
                    Here is your schedule for {format(today, 'EEEE, MMMM do')}.
                </p>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-4">
                <Button className="h-24 flex flex-col gap-2" variant="outline">
                    <Clock className="h-6 w-6" />
                    <span>Clock In</span>
                </Button>
                <Button className="h-24 flex flex-col gap-2" variant="outline">
                    <MapPin className="h-6 w-6" />
                    <span>Nearby Parts</span>
                </Button>
            </div>

            {/* Next Job Card */}
            <Card className="border-l-4 border-l-blue-500">
                <CardHeader>
                    <CardTitle className="text-sm font-medium text-blue-500 uppercase tracking-wider">
                        Up Next
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <h3 className="text-xl font-bold">Leaking Sink Repair</h3>
                        <p className="text-muted-foreground">123 Main St, Springfield</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4" />
                        <span>10:00 AM - 11:30 AM</span>
                    </div>
                    <div className="flex gap-2 pt-2">
                        <Button className="flex-1">Start Job</Button>
                        <Button variant="secondary" className="flex-1">Navigate</Button>
                    </div>
                </CardContent>
            </Card>

            {/* Today's Schedule List */}
            <div>
                <h3 className="font-semibold mb-4">Your Schedule</h3>
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <Card key={i}>
                            <CardContent className="p-4 flex items-center justify-between">
                                <div>
                                    <div className="font-medium">Water Heater Flush</div>
                                    <div className="text-sm text-muted-foreground">2:00 PM • 456 Oak Ave</div>
                                </div>
                                <Button size="sm" variant="ghost">View</Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
