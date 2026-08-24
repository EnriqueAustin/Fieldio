"use client";

import { useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

const THRESHOLD = 72; // px pulled before a release triggers a refresh
const MAX_PULL = 110; // clamp so the indicator never drifts off-screen

/**
 * Touch pull-to-refresh for the field screens (audit P2 #12). Wraps content
 * that scrolls at the window level: a downward drag while already scrolled to
 * the top reveals a spinner and, past the threshold, runs `onRefresh`. A no-op
 * on desktop/pointer devices, which never fire the touch gestures.
 */
export function PullToRefresh({
    onRefresh,
    children,
}: {
    onRefresh: () => Promise<unknown> | unknown;
    children: ReactNode;
}) {
    const [pull, setPull] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const startY = useRef<number | null>(null);

    const onTouchStart = (e: React.TouchEvent) => {
        // Only start a pull gesture when the page is already at the very top.
        if (window.scrollY <= 0 && !refreshing) {
            startY.current = e.touches[0].clientY;
        } else {
            startY.current = null;
        }
    };

    const onTouchMove = (e: React.TouchEvent) => {
        if (startY.current === null) return;
        const delta = e.touches[0].clientY - startY.current;
        if (delta <= 0) {
            setPull(0);
            return;
        }
        // Rubber-band: ease the drag so it feels resistant near the max.
        setPull(Math.min(MAX_PULL, delta * 0.5));
    };

    const onTouchEnd = async () => {
        if (startY.current === null) return;
        startY.current = null;
        if (pull >= THRESHOLD && !refreshing) {
            setRefreshing(true);
            setPull(THRESHOLD);
            try {
                await onRefresh();
            } finally {
                setRefreshing(false);
                setPull(0);
            }
        } else {
            setPull(0);
        }
    };

    const active = pull > 0 || refreshing;

    return (
        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
            {/* Pull indicator */}
            <div
                className="flex items-center justify-center overflow-hidden text-muted-foreground transition-[height] duration-150"
                style={{ height: active ? pull : 0 }}
            >
                <RefreshCw
                    className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
                    style={{ transform: refreshing ? undefined : `rotate(${pull * 3}deg)` }}
                />
            </div>
            <div style={{ transform: active ? `translateY(${pull * 0.2}px)` : undefined }}>{children}</div>
        </div>
    );
}
