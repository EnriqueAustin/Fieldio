"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef } from "react";
import { Button } from "../../ui/button";

export function SignaturePad({
    disabled,
    onChange,
}: {
    disabled?: boolean;
    onChange: (value: string | null) => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const isDrawingRef = useRef(false);
    const hasStrokeRef = useRef(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;

        context.lineWidth = 2;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.strokeStyle = "#0f172a";
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
    }, []);

    const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY,
        };
    };

    const beginStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (disabled) return;
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        const point = pointFromEvent(event);
        isDrawingRef.current = true;
        canvas.setPointerCapture(event.pointerId);
        context.beginPath();
        context.moveTo(point.x, point.y);
    };

    const drawStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (disabled || !isDrawingRef.current) return;
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        const point = pointFromEvent(event);
        context.lineTo(point.x, point.y);
        context.stroke();
        hasStrokeRef.current = true;
    };

    const endStroke = () => {
        if (disabled) return;
        isDrawingRef.current = false;
        const canvas = canvasRef.current;
        if (!canvas) return;
        onChange(hasStrokeRef.current ? canvas.toDataURL("image/png") : null);
    };

    const clear = () => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        hasStrokeRef.current = false;
        onChange(null);
    };

    return (
        <div className="space-y-3">
            <canvas
                ref={canvasRef}
                width={800}
                height={240}
                className="h-40 w-full rounded-xl border border-dashed border-slate-300 bg-white touch-none"
                onPointerDown={beginStroke}
                onPointerMove={drawStroke}
                onPointerUp={endStroke}
                onPointerLeave={endStroke}
            />
            <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={clear} disabled={disabled}>
                    Clear signature
                </Button>
            </div>
        </div>
    );
}
