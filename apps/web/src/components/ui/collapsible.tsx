"use client";

import * as React from "react";
import { cn } from "../../lib/utils";

// Lightweight, dependency-free collapsible (no @radix-ui/react-collapsible in
// this app). Mirrors the small API surface the estimate options panel needs:
// Collapsible / CollapsibleTrigger / CollapsibleContent.

type CollapsibleContextValue = {
    open: boolean;
    setOpen: (v: boolean) => void;
};

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(null);

function useCollapsible() {
    const ctx = React.useContext(CollapsibleContext);
    if (!ctx) throw new Error("Collapsible components must be used within <Collapsible>");
    return ctx;
}

interface CollapsibleProps extends React.HTMLAttributes<HTMLDivElement> {
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

const Collapsible = React.forwardRef<HTMLDivElement, CollapsibleProps>(
    ({ defaultOpen = false, open: controlledOpen, onOpenChange, children, ...props }, ref) => {
        const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
        const open = controlledOpen ?? uncontrolled;
        const setOpen = (v: boolean) => {
            if (controlledOpen === undefined) setUncontrolled(v);
            onOpenChange?.(v);
        };
        return (
            <CollapsibleContext.Provider value={{ open, setOpen }}>
                <div ref={ref} {...props}>
                    {children}
                </div>
            </CollapsibleContext.Provider>
        );
    }
);
Collapsible.displayName = "Collapsible";

const CollapsibleTrigger = React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ onClick, type, ...props }, ref) => {
    const { open, setOpen } = useCollapsible();
    return (
        <button
            ref={ref}
            type={type ?? "button"}
            aria-expanded={open}
            onClick={(e) => {
                setOpen(!open);
                onClick?.(e);
            }}
            {...props}
        />
    );
});
CollapsibleTrigger.displayName = "CollapsibleTrigger";

const CollapsibleContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, children, ...props }, ref) => {
        const { open } = useCollapsible();
        if (!open) return null;
        return (
            <div ref={ref} className={cn(className)} {...props}>
                {children}
            </div>
        );
    }
);
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
