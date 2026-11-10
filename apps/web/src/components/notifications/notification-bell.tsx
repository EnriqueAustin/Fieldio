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
import { socket } from "../../lib/socket";
import { useToast } from "../ui/use-toast";
import { useAuthStore } from "../../store/auth";

// The server only delivers notification:received to this user's own room.
export function NotificationBell() {
    const [notifications, setNotifications] = useState<any[]>([]);
    const { toast } = useToast();
    const accessToken = useAuthStore((s) => s.accessToken);

    useEffect(() => {
        if (!accessToken) return;
        if (!socket.connected) {
            socket.connect();
        }

        const onNotification = (data: any) => {
            setNotifications(prev => [data, ...prev]);

            toast({
                title: data.title,
                description: data.message,
            });
        };
        socket.on('notification:received', onNotification);

        return () => {
            socket.off('notification:received', onNotification);
        };
    }, [toast, accessToken]);

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

