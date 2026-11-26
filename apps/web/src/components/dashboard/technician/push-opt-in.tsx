"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, X } from "lucide-react";
import { Card, CardContent } from "../../ui/card";
import api from "../../../lib/api";
import { useAuthStore } from "../../../store/auth";
import {
    PushSetupError,
    activeWorkerHandlesPush,
    findWaitingWorker,
    getExistingSubscription,
    getPushRegistration,
    getPushSupport,
    reconcilePushOwner,
    subscribeToPush,
} from "../../../lib/push";

const DISMISS_KEY = "fieldio-push-optin-dismissed";

type CardState =
    | { kind: "hidden" }
    | { kind: "offer" }
    | { kind: "working" }
    | { kind: "ios-install" }
    | { kind: "denied" }
    // The running service worker predates push support; a newer one is waiting.
    | { kind: "update"; worker: ServiceWorker }
    | { kind: "error"; message: string }
    | { kind: "enabled" };

const readDismissed = () => {
    try {
        return window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
        return false;
    }
};

/**
 * "Get job alerts on this phone" card for the tech home. Permission is only
 * requested when the tech taps the button, never on load. Hides itself when
 * there is no service worker (dev builds), when push is off on the server,
 * when this phone already gets alerts, or once dismissed.
 */
export function PushOptIn() {
    const userId = useAuthStore((s) => s.user?.id);
    const [state, setState] = useState<CardState>({ kind: "hidden" });

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        const show = (next: CardState) => {
            if (!cancelled) setState(next);
        };

        (async () => {
            if (readDismissed()) return;
            const reg = await getPushRegistration();
            if (!reg) return;

            const support = getPushSupport();
            if (support === "ios-needs-install") return show({ kind: "ios-install" });
            if (support === "unsupported") return;

            try {
                const { data } = await api.get("/push/public-key");
                if (!data?.data?.publicKey) return;
            } catch {
                return; // Offline or push not configured: nothing useful to offer.
            }

            // A subscription left by someone else on this phone is removed first,
            // so "already on" below really means "on for this user".
            await reconcilePushOwner(userId);
            if (Notification.permission === "denied") return show({ kind: "denied" });
            if (Notification.permission === "granted" && (await getExistingSubscription())) return;

            if (!(await activeWorkerHandlesPush(reg))) {
                const waiting = await findWaitingWorker(reg);
                if (waiting) show({ kind: "update", worker: waiting });
                return;
            }
            show({ kind: "offer" });
        })();

        return () => {
            cancelled = true;
        };
    }, [userId]);

    // PwaLifecycle reloads the page once the new worker takes control.
    const applyUpdate = (worker: ServiceWorker) => {
        setState({ kind: "working" });
        worker.postMessage({ type: "SKIP_WAITING" });
    };

    const dismiss = () => {
        setState({ kind: "hidden" });
        try {
            window.localStorage.setItem(DISMISS_KEY, "1");
        } catch {
            /* private mode: best effort */
        }
    };

    const enable = async () => {
        setState({ kind: "working" });
        try {
            await subscribeToPush();
            setState({ kind: "enabled" });
        } catch (error) {
            if (error instanceof PushSetupError && error.reason === "denied") {
                setState({ kind: "denied" });
            } else if (error instanceof PushSetupError && error.reason === "needs-update") {
                const reg = await getPushRegistration();
                const waiting = reg ? await findWaitingWorker(reg) : null;
                setState(waiting ? { kind: "update", worker: waiting } : { kind: "error", message: error.message });
            } else {
                setState({
                    kind: "error",
                    message: error instanceof Error ? error.message : "Couldn't turn on job alerts.",
                });
            }
        }
    };

    if (state.kind === "hidden") return null;

    const muted = state.kind === "denied" || state.kind === "ios-install";
    const Icon = muted ? BellOff : Bell;

    return (
        <Card className="border-blue-200 bg-blue-50/60">
            <CardContent className="flex items-start gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1 space-y-2" aria-live="polite">
                    <p className="text-sm font-semibold text-foreground">
                        {state.kind === "enabled" ? "Job alerts are on" : "Get job alerts on this phone"}
                    </p>
                    {state.kind === "offer" || state.kind === "working" ? (
                        <>
                            <p className="text-sm text-muted-foreground">
                                Hear about new and moved jobs even when Fieldio is closed.
                            </p>
                            <button
                                type="button"
                                onClick={enable}
                                disabled={state.kind === "working"}
                                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition active:scale-[0.99] disabled:opacity-60"
                            >
                                {state.kind === "working" && <Loader2 className="h-4 w-4 animate-spin" />}
                                Turn on job alerts
                            </button>
                        </>
                    ) : null}
                    {state.kind === "ios-install" && (
                        <p className="text-sm text-muted-foreground">
                            Add Fieldio to your home screen first to get alerts: tap Share, then
                            &ldquo;Add to Home Screen&rdquo;, and open Fieldio from there.
                        </p>
                    )}
                    {state.kind === "update" && (
                        <>
                            <p className="text-sm text-muted-foreground">
                                A Fieldio update is ready. Update first, then turn on job alerts.
                            </p>
                            <button
                                type="button"
                                onClick={() => applyUpdate(state.worker)}
                                className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition active:scale-[0.99]"
                            >
                                Update Fieldio
                            </button>
                        </>
                    )}
                    {state.kind === "denied" && (
                        <p className="text-sm text-muted-foreground">
                            Notifications are blocked for Fieldio. Allow them in your phone&rsquo;s settings for
                            this app or site, then come back here.
                        </p>
                    )}
                    {state.kind === "error" && (
                        <>
                            <p className="text-sm text-red-700">{state.message}</p>
                            <button
                                type="button"
                                onClick={enable}
                                className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold transition active:scale-[0.99]"
                            >
                                Try again
                            </button>
                        </>
                    )}
                    {state.kind === "enabled" && (
                        <p className="text-sm text-muted-foreground">
                            You&rsquo;ll get a notification when the office assigns or moves your jobs.
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Dismiss job alerts card"
                    className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                >
                    <X className="h-4 w-4" />
                </button>
            </CardContent>
        </Card>
    );
}
