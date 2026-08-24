"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";

const DAY_SECONDS = 24 * 3600;

/** Ticking elapsed-time readout. `start` is the job's actualStart; once the job
 *  is completed it freezes at `end` (actualEnd) instead of running forever.
 *  Past 24h the HH:MM:SS readout is meaningless (stale seed jobs read "829:29:25"),
 *  so we cap it to "Since {MMM d}". */
export function LiveTimer({ start, end }: { start: string; end?: string | null }) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (end) return; // frozen — no interval needed
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [end]);

    const startMs = new Date(start).getTime();
    const endMs = end ? new Date(end).getTime() : now;
    const totalSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));

    if (totalSeconds >= DAY_SECONDS) {
        return <span className="tabular-nums">Since {format(new Date(start), "MMM d")}</span>;
    }

    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, "0");

    return (
        <span className="font-mono tabular-nums">
            {h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`}
        </span>
    );
}
