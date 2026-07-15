"use client";

import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";

const DISMISS_KEY = "fieldio-install-dismissed";

type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos(): boolean {
    if (typeof navigator === "undefined") return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
    if (typeof window === "undefined") return false;
    return (
        window.matchMedia("(display-mode: standalone)").matches ||
        // iOS Safari
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
}

/**
 * Dismissible "Install app" banner.
 *  - Android/desktop Chromium: captures `beforeinstallprompt` and triggers the
 *    native install dialog on tap.
 *  - iOS Safari (no beforeinstallprompt): shows an "Add to Home Screen" hint.
 * Dismissal is remembered in localStorage. Hidden when already installed.
 * Self-contained: safe to mount once from a layout.
 */
export function InstallPrompt() {
    const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
    const [visible, setVisible] = useState(false);
    const [ios, setIos] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (isStandalone()) return;
        if (window.localStorage.getItem(DISMISS_KEY) === "1") return;

        if (isIos()) {
            setIos(true);
            setVisible(true);
            return;
        }

        const onBeforeInstall = (e: Event) => {
            e.preventDefault();
            setDeferred(e as BeforeInstallPromptEvent);
            setVisible(true);
        };
        const onInstalled = () => setVisible(false);

        window.addEventListener("beforeinstallprompt", onBeforeInstall);
        window.addEventListener("appinstalled", onInstalled);
        return () => {
            window.removeEventListener("beforeinstallprompt", onBeforeInstall);
            window.removeEventListener("appinstalled", onInstalled);
        };
    }, []);

    const dismiss = () => {
        setVisible(false);
        try {
            window.localStorage.setItem(DISMISS_KEY, "1");
        } catch {
            /* private mode — best effort */
        }
    };

    const install = async () => {
        if (!deferred) return;
        await deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <div
            className="fixed inset-x-0 z-50 px-4"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 4.5rem)" }}
            role="dialog"
            aria-label="Install Fieldio"
        >
            <div className="mx-auto flex max-w-md items-center gap-3 rounded-xl border border-border bg-white p-3 shadow-lg">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                    <Download className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">Install Fieldio</p>
                    {ios ? (
                        <p className="text-xs text-muted-foreground">
                            Tap <Share className="inline h-3.5 w-3.5 align-text-bottom" /> then
                            &nbsp;“Add to Home Screen”.
                        </p>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            Add it to your home screen for offline field work.
                        </p>
                    )}
                </div>
                {!ios && (
                    <button
                        onClick={install}
                        className="shrink-0 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                        Install
                    </button>
                )}
                <button
                    onClick={dismiss}
                    aria-label="Dismiss"
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-slate-100"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
