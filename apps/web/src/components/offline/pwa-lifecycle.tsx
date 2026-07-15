"use client";

import { useEffect, useRef } from "react";
import { useToast } from "../../hooks/use-toast";
import { ToastAction } from "../ui/toast";

/**
 * Registers the hand-written service worker and drives the "update available"
 * flow. The SW parks in `waiting` (it does not auto-skipWaiting); when we see a
 * waiting worker we surface a toast. Accepting it posts SKIP_WAITING and the
 * subsequent `controllerchange` reloads the page exactly once.
 *
 * Mounted once from the root layout. No-op outside production / unsupported
 * browsers, so it's safe to render everywhere.
 */
export function PwaLifecycle() {
    const { toast } = useToast();
    const reloadingRef = useRef(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!("serviceWorker" in navigator)) return;
        if (process.env.NODE_ENV !== "production") return;

        let cancelled = false;

        const promptUpdate = (worker: ServiceWorker) => {
            toast({
                title: "Update available",
                description: "A new version of Fieldio is ready.",
                duration: Infinity,
                action: (
                    <ToastAction
                        altText="Reload to update"
                        onClick={() => worker.postMessage({ type: "SKIP_WAITING" })}
                    >
                        Reload
                    </ToastAction>
                ),
            });
        };

        const register = async () => {
            try {
                const reg = await navigator.serviceWorker.register("/sw.js");

                // A worker is already waiting (updated on a previous visit).
                if (reg.waiting && navigator.serviceWorker.controller) {
                    promptUpdate(reg.waiting);
                }

                // A new worker started installing after this load.
                reg.addEventListener("updatefound", () => {
                    const installing = reg.installing;
                    if (!installing) return;
                    installing.addEventListener("statechange", () => {
                        if (
                            installing.state === "installed" &&
                            navigator.serviceWorker.controller &&
                            !cancelled
                        ) {
                            promptUpdate(installing);
                        }
                    });
                });
            } catch {
                // Registration failures are non-fatal — app still works online.
            }
        };

        // Reload once the new SW takes control.
        const onControllerChange = () => {
            if (reloadingRef.current) return;
            reloadingRef.current = true;
            window.location.reload();
        };
        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

        if (document.readyState === "complete") {
            register();
        } else {
            window.addEventListener("load", register, { once: true });
        }

        return () => {
            cancelled = true;
            navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
        };
    }, [toast]);

    return null;
}
