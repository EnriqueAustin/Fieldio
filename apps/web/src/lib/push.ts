import api from "./api";
import { useAuthStore } from "../store/auth";

/**
 * Web Push helpers for job alerts while the app is closed. The service worker
 * (public/sw.js) shows the notification; these only manage the subscription.
 * The SW is registered in production builds only (see PwaLifecycle), so in dev
 * `getPushRegistration()` resolves to null and callers should hide push UI.
 */

export type PushSupport =
    | "supported"
    | "unsupported"
    // iOS Safari only allows push for an app added to the home screen.
    | "ios-needs-install";

/** VAPID keys are URL-safe base64; PushManager wants the raw bytes. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = window.atob(base64);
    const bytes = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
}

const isIos = () =>
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac with touch.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function getPushSupport(): PushSupport {
    if (typeof window === "undefined") return "unsupported";
    if (isIos() && !isStandalone()) return "ios-needs-install";
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return "unsupported";
    }
    return "supported";
}

/** The active SW registration, or null when none is registered (e.g. dev builds). */
export async function getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
    try {
        return (await navigator.serviceWorker.getRegistration()) ?? null;
    } catch {
        return null;
    }
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
    const reg = await getPushRegistration();
    if (!reg || !("pushManager" in reg)) return null;
    try {
        return await reg.pushManager.getSubscription();
    } catch {
        return null;
    }
}

// Must match PUSH_HANDLER_VERSION in public/sw.js.
const REQUIRED_PUSH_HANDLER_VERSION = 1;

/** Ask a worker which push handler version it ships (0 = none / no answer). */
function askPushHandlerVersion(worker: ServiceWorker, timeoutMs = 1500): Promise<number> {
    return new Promise((resolve) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => resolve(0), timeoutMs);
        channel.port1.onmessage = (event: MessageEvent<{ push?: unknown }>) => {
            clearTimeout(timer);
            resolve(typeof event.data?.push === "number" ? event.data.push : 0);
        };
        try {
            worker.postMessage({ type: "GET_CAPABILITIES" }, [channel.port2]);
        } catch {
            clearTimeout(timer);
            resolve(0);
        }
    });
}

/**
 * Whether the ACTIVE worker can display our pushes. Until the user accepts the
 * "update available" toast, an older worker without a push handler is still
 * in charge and would show a generic browser notification instead.
 */
export async function activeWorkerHandlesPush(reg: ServiceWorkerRegistration): Promise<boolean> {
    if (!reg.active) return false;
    return (await askPushHandlerVersion(reg.active)) >= REQUIRED_PUSH_HANDLER_VERSION;
}

/**
 * Check for a newer worker and wait briefly for it to finish installing.
 * Returns the waiting worker (activate it with SKIP_WAITING; PwaLifecycle
 * reloads the page once it takes over), or null if there is none.
 */
export async function findWaitingWorker(reg: ServiceWorkerRegistration): Promise<ServiceWorker | null> {
    try {
        await reg.update();
    } catch {
        // Offline: fall through to whatever is already downloaded.
    }
    const installing = reg.installing;
    if (installing) {
        await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 10_000);
            installing.addEventListener("statechange", () => {
                if (installing.state !== "installing") {
                    clearTimeout(timer);
                    resolve();
                }
            });
        });
    }
    return reg.waiting ?? null;
}

export class PushSetupError extends Error {
    constructor(
        message: string,
        readonly reason: "unsupported" | "denied" | "disabled" | "needs-update" | "failed"
    ) {
        super(message);
    }
}

/**
 * Ask for permission (call from a tap, never on load), subscribe this browser
 * and register it with the API. Re-registering an existing subscription is
 * harmless: the server upserts by endpoint.
 */
export async function subscribeToPush(): Promise<PushSubscription> {
    if (getPushSupport() !== "supported") {
        throw new PushSetupError("Push alerts are not supported on this device.", "unsupported");
    }
    const reg = await getPushRegistration();
    if (!reg) throw new PushSetupError("The app is still installing. Try again in a moment.", "unsupported");
    if (!(await activeWorkerHandlesPush(reg))) {
        throw new PushSetupError("Update Fieldio first to turn on job alerts.", "needs-update");
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
        throw new PushSetupError("Notifications are blocked for Fieldio.", "denied");
    }

    const { data } = await api.get("/push/public-key");
    const publicKey: string | null = data?.data?.publicKey ?? null;
    if (!publicKey) throw new PushSetupError("Job alerts are not switched on for this account yet.", "disabled");

    try {
        const subscription =
            (await reg.pushManager.getSubscription()) ??
            (await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey),
            }));
        await api.post("/push/subscriptions", subscription.toJSON());
        return subscription;
    } catch (error) {
        if (error instanceof PushSetupError) throw error;
        throw new PushSetupError("Couldn't turn on job alerts. Check your signal and try again.", "failed");
    }
}

/**
 * Stop alerts on this browser: remove it on the server (while still signed in)
 * and drop the browser subscription. Best-effort; never throws.
 */
export async function unsubscribeFromPush(): Promise<void> {
    const subscription = await getExistingSubscription();
    if (!subscription) return;
    try {
        await api.delete("/push/subscriptions", { data: { endpoint: subscription.endpoint } });
    } catch {
        // Offline or already signed out: the browser unsubscribe below still
        // stops delivery, and the server prunes the dead endpoint on next send.
    }
    try {
        await subscription.unsubscribe();
    } catch {
        // Nothing more we can do; the endpoint will 410 and be pruned.
    }
}

/** Drop the browser subscription without calling the API (session already gone). */
async function dropLocalSubscription(): Promise<void> {
    const subscription = await getExistingSubscription();
    try {
        // The push service now answers 410 for this endpoint, so the API
        // deletes its row on the next send.
        await subscription?.unsubscribe();
    } catch {
        /* best effort */
    }
}

let reconciled: { userId: string; promise: Promise<void> } | null = null;

/**
 * Make sure this browser's subscription belongs to the signed-in user. A phone
 * can change hands (session expiry, a different login) without the previous
 * user's explicit logout; their alerts, with customer names, must not keep
 * arriving. If the server doesn't have this endpoint for this user, remove it
 * on the server (by endpoint, which only this browser knows) and locally; the
 * new user can opt in again from the tech home. Runs once per user per load.
 */
export function reconcilePushOwner(userId: string): Promise<void> {
    if (reconciled?.userId === userId) return reconciled.promise;
    const promise = (async () => {
        const subscription = await getExistingSubscription();
        if (!subscription) return;
        try {
            const { data } = await api.post("/push/subscriptions/status", { endpoint: subscription.endpoint });
            if (data?.data?.mine) return;
        } catch {
            // Offline: we can't tell who owns it. Retry on the next call.
            reconciled = null;
            return;
        }
        await unsubscribeFromPush();
    })();
    reconciled = { userId, promise };
    return promise;
}

// Follow the session: reconcile on every sign-in (any role), and drop the
// subscription locally whenever the user is cleared, including a forced logout
// after a rejected refresh, where the API can no longer be called.
if (typeof window !== "undefined") {
    const reconcileIfSignedIn = (state: ReturnType<typeof useAuthStore.getState>) => {
        if (state.user?.id && state.accessToken) void reconcilePushOwner(state.user.id);
    };
    let lastUserId = useAuthStore.getState().user?.id ?? null;
    reconcileIfSignedIn(useAuthStore.getState());
    useAuthStore.subscribe((state) => {
        const userId = state.user?.id ?? null;
        if (!userId && lastUserId) {
            reconciled = null;
            void dropLocalSubscription();
        }
        lastUserId = userId;
        reconcileIfSignedIn(state);
    });
}
