"use client";

import { useEffect, useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";
import api from "../../../lib/api";
import { toast } from "../../ui/use-toast";
import type { TechnicianJob } from "./types";

// Live location for the customer's tracking page and the dispatch map.
// POPIA: the device only watches its position while one of the tech's jobs is
// EN_ROUTE, never in the background on other statuses, and the field console
// shows an indicator the whole time (see active-job-header.tsx).

/** Send at most this often while driving... */
const SEND_EVERY_MS = 30_000;
/** ...or sooner once the tech has moved this far... */
const SEND_AFTER_MOVED_M = 150;
/** ...but never more often than this. */
const MIN_GAP_MS = 10_000;
/** Hidden longer than this → stop the GPS; resume when visible again. */
const HIDDEN_STOP_MS = 2 * 60_000;
/** Fixes coarser than this would make the customer's map jump around. */
const MAX_ACCURACY_M = 2_000;
const EXPLAINER_KEY = "fieldio.location-explainer-shown";

const WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 15_000, timeout: 30_000 };

export type LocationSharingStatus =
    /** No EN_ROUTE job — nothing is collected. */
    | "off"
    /** Watching and sending fixes. */
    | "sharing"
    /** Stopped while the app is in the background; resumes when visible. */
    | "paused"
    /** The tech (or the browser) blocked location. */
    | "denied"
    /** No geolocation on this device. */
    | "unsupported";

// Tiny shared store so the job header can show the indicator without the
// status being threaded through every component in between.
let currentStatus: LocationSharingStatus = "off";
const listeners = new Set<() => void>();

function setStatus(next: LocationSharingStatus) {
    if (next === currentStatus) return;
    currentStatus = next;
    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Current location-sharing state, for indicators. */
export function useLocationSharingStatus(): LocationSharingStatus {
    return useSyncExternalStore(subscribe, () => currentStatus, () => "off");
}

function metresBetween(a: GeolocationCoordinates, b: GeolocationCoordinates) {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function showExplainerOnce() {
    try {
        if (window.localStorage.getItem(EXPLAINER_KEY)) return;
        window.localStorage.setItem(EXPLAINER_KEY, "1");
    } catch {
        // Storage blocked (private mode): still explain, at most once per mount.
    }
    toast({
        title: "Location is off",
        description:
            "Allow location so customers can see you're on the way. It's only shared while a job is “On the way”.",
    });
}

/**
 * Shares the technician's position while they have a job EN_ROUTE. Mount once
 * in the field console with the tech's (optimistically updated) job list.
 */
export function useLocationSharing(jobs: TechnicianJob[]) {
    const enRouteJobId = jobs.find((job) => job.status === "EN_ROUTE")?.id ?? null;

    useEffect(() => {
        if (!enRouteJobId) {
            setStatus("off");
            return;
        }
        if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
            setStatus("unsupported");
            return;
        }

        let watchId: number | null = null;
        let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
        let lastSent: { at: number; coords: GeolocationCoordinates } | null = null;
        let inFlight = false;
        let denied = false;
        let disposed = false;

        const send = (position: GeolocationPosition) => {
            const { coords } = position;
            if (coords.accuracy > MAX_ACCURACY_M) return;
            const now = Date.now();
            if (lastSent) {
                const elapsed = now - lastSent.at;
                const moved = metresBetween(lastSent.coords, coords);
                if (elapsed < MIN_GAP_MS) return;
                if (elapsed < SEND_EVERY_MS && moved < SEND_AFTER_MOVED_M) return;
            }
            // A live position is worthless later: offline fixes are dropped, never queued.
            if (inFlight || !onlineManager.isOnline()) return;
            inFlight = true;
            api.post("/tracking/ping", {
                lat: coords.latitude,
                lng: coords.longitude,
                accuracy: Math.round(coords.accuracy),
                jobId: enRouteJobId,
            })
                .then(() => {
                    lastSent = { at: Date.now(), coords };
                })
                // A 409 means the job just left EN_ROUTE (the next render stops
                // us); network errors simply retry on the next fix.
                .catch(() => undefined)
                .finally(() => {
                    inFlight = false;
                });
        };

        const onError = (error: GeolocationPositionError) => {
            if (error.code !== error.PERMISSION_DENIED) return; // timeouts/no signal: keep watching
            denied = true;
            stopWatching();
            setStatus("denied");
            showExplainerOnce();
        };

        const startWatching = () => {
            if (disposed || denied || watchId !== null) return;
            setStatus("sharing");
            // Send a fix straight away (first one on flipping to EN_ROUTE, or on resume).
            lastSent = null;
            watchId = navigator.geolocation.watchPosition(send, onError, WATCH_OPTIONS);
        };

        const stopWatching = () => {
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
            watchId = null;
        };

        const onVisibility = () => {
            if (document.visibilityState === "hidden") {
                if (hiddenTimer) clearTimeout(hiddenTimer);
                hiddenTimer = setTimeout(() => {
                    stopWatching();
                    if (!denied) setStatus("paused");
                }, HIDDEN_STOP_MS);
                return;
            }
            if (hiddenTimer) clearTimeout(hiddenTimer);
            hiddenTimer = null;
            startWatching();
        };

        // If the tech re-allows location in browser settings, pick it up without a reload.
        let permission: PermissionStatus | null = null;
        const onPermissionChange = () => {
            if (permission?.state === "granted" && denied) {
                denied = false;
                startWatching();
            }
        };

        const begin = async () => {
            try {
                permission = await navigator.permissions?.query({ name: "geolocation" });
            } catch {
                permission = null; // Older Safari: no Permissions API for geolocation.
            }
            if (disposed) return;
            if (permission) permission.addEventListener("change", onPermissionChange);
            if (permission?.state === "denied") {
                // Already blocked: don't trigger another prompt, just explain once.
                denied = true;
                setStatus("denied");
                showExplainerOnce();
                return;
            }
            if (document.visibilityState === "visible") startWatching();
            else setStatus("paused");
        };

        document.addEventListener("visibilitychange", onVisibility);
        void begin();

        return () => {
            disposed = true;
            stopWatching();
            if (hiddenTimer) clearTimeout(hiddenTimer);
            document.removeEventListener("visibilitychange", onVisibility);
            permission?.removeEventListener("change", onPermissionChange);
            setStatus("off");
        };
    }, [enRouteJobId]);
}
