"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "../ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "../ui/popover";
import { ScrollArea } from "../ui/scroll-area";
import { socket } from "../../lib/socket"; // Assume we need to export the socket instance globally or use context
import { useToast } from "../ui/use-toast";

// Need to export socket from somewhere accessible or use the one from SchedulePage? 
// Better pattern: Create a SocketContext provider, but for now we'll import if possible or re-init (careful with multiple connections).
// Actually, let's create a simple useSocket hook or similar.
// For this file, assuming we have a global socket instance or we init it here.

export function NotificationBell() {
    const [notifications, setNotifications] = useState<any[]>([]);
    const { toast } = useToast();

    useEffect(() => {
        // Ideally this socket is the same instance as in SchedulePage
        if (!socket.connected) {
            socket.connect();
        }

        socket.on('notification:received', (data: any) => {
            // Here we should filter if it's for THIS user.
            // For MVP demo, all company users see it.
            setNotifications(prev => [data, ...prev]);

            toast({
                title: data.title,
                description: data.message,
            });
        });

        return () => {
            socket.off('notification:received');
        };
    }, [toast]);

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {notifications.length > 0 && (
                        <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-600 border border-white" />
                    )}
                    <span className="sr-only">Notifications</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
                <h4 className="font-medium leading-none mb-4">Notifications</h4>
                <ScrollArea className="h-60">
                    {notifications.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No new notifications.</p>
                    ) : (
                        <div className="space-y-2">
                            {notifications.map((n, i) => (
                                <div key={i} className="text-sm border-b pb-2 last:border-0 hover:bg-muted p-2 rounded">
                                    <div className="font-semibold">{n.title}</div>
                                    <div className="text-muted-foreground text-xs">{n.message}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
}

