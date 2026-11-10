// Pure day-route planning: ordering, distances and drive-time estimates.
// No database or network access — everything here is unit-testable.
//
// All distances are straight-line (haversine) and all drive times are rough
// estimates from an average urban speed. Callers must present them as
// approximate; we deliberately avoid a paid maps/routing API.

/** Every tunable estimate lives here so the UI, tracker and planner agree. */
export const ROUTE_ESTIMATE = {
    /** Average urban driving speed used for every drive-time estimate. */
    AVG_SPEED_KMH: 35,
    /** Fixed allowance per leg for parking, gate access, traffic lights. */
    LEG_BUFFER_MIN: 5,
    /** A booking window this long or longer counts as "any time" (flexible). */
    FLEXIBLE_WINDOW_MIN: 6 * 60,
    /** Google Maps directions URLs accept at most 9 intermediate waypoints. */
    MAX_WAYPOINTS: 9,
    /** A location ping older than this is too stale for a live ETA. */
    LIVE_PING_MAX_AGE_MIN: 15,
} as const;

export interface LatLng {
    lat: number;
    lng: number;
}

export interface RouteStopInput {
    id: string;
    lat: number | null;
    lng: number | null;
    scheduledStart: Date | null;
    scheduledEnd: Date | null;
    /** Job already under way (EN_ROUTE / ON_SITE) — always visited first. */
    inProgress?: boolean;
}

export type StopKind = 'inProgress' | 'fixed' | 'flexible';

export interface RouteLeg {
    distanceKm: number;
    driveMinutes: number;
}

export interface PlannedStop<T extends RouteStopInput> {
    stop: T;
    order: number;
    kind: StopKind;
    noLocation: boolean;
    /** Leg from the previous located point (or the origin). Null for the first
     *  stop when there is no origin, and for stops without coordinates. */
    leg: RouteLeg | null;
}

export interface PlannedRoute<T extends RouteStopInput> {
    stops: PlannedStop<T>[];
    totalDistanceKm: number;
    totalDriveMinutes: number;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function haversineKm(a: LatLng, b: LatLng): number {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Approximate drive minutes for a straight-line distance. Zero distance (same
 *  site) costs nothing; anything else gets the per-leg buffer. */
export function estimateDriveMinutes(distanceKm: number): number {
    if (distanceKm < 0.05) return 0;
    return Math.ceil((distanceKm / ROUTE_ESTIMATE.AVG_SPEED_KMH) * 60 + ROUTE_ESTIMATE.LEG_BUFFER_MIN);
}

export function estimateLeg(from: LatLng, to: LatLng): RouteLeg {
    const km = haversineKm(from, to);
    return { distanceKm: round1(km), driveMinutes: estimateDriveMinutes(km) };
}

const hasCoords = (s: RouteStopInput): boolean =>
    typeof s.lat === 'number' && typeof s.lng === 'number' && Number.isFinite(s.lat) && Number.isFinite(s.lng);

const pointOf = (s: RouteStopInput): LatLng => ({ lat: s.lat as number, lng: s.lng as number });

const timeOf = (s: RouteStopInput) => (s.scheduledStart ? s.scheduledStart.getTime() : Number.POSITIVE_INFINITY);
const byTime = (a: RouteStopInput, b: RouteStopInput) => timeOf(a) - timeOf(b) || a.id.localeCompare(b.id);

/** A job with a specific appointment time keeps its chronological slot. Wide
 *  windows ("any time today") and unscheduled jobs are flexible. */
export function isFixedAppointment(s: RouteStopInput): boolean {
    if (!s.scheduledStart) return false;
    if (!s.scheduledEnd) return true;
    const windowMin = (s.scheduledEnd.getTime() - s.scheduledStart.getTime()) / 60_000;
    return windowMin < ROUTE_ESTIMATE.FLEXIBLE_WINDOW_MIN;
}

const dist = (a: LatLng | null, b: LatLng | null) => (a && b ? haversineKm(a, b) : 0);

/** Cost of an open path through `points`, optionally pinned to start/end. */
function pathCost(start: LatLng | null, points: LatLng[], end: LatLng | null): number {
    let total = 0;
    let prev = start;
    for (const p of points) {
        total += dist(prev, p);
        prev = p;
    }
    return total + dist(prev, end);
}

/** Nearest-neighbour from `start` (or from the earliest-booked stop when there
 *  is no start), then 2-opt with both endpoints held in place. */
function orderSegment<T extends RouteStopInput>(start: LatLng | null, stops: T[], end: LatLng | null): T[] {
    if (stops.length <= 1) return [...stops];

    const remaining = [...stops].sort(byTime);
    const ordered: T[] = [];
    let current = start;
    if (!current) {
        const first = remaining.shift()!;
        ordered.push(first);
        current = pointOf(first);
    }
    while (remaining.length) {
        let bestIdx = 0;
        let bestKm = Number.POSITIVE_INFINITY;
        remaining.forEach((s, i) => {
            const km = haversineKm(current!, pointOf(s));
            if (km < bestKm - 1e-9) {
                bestKm = km;
                bestIdx = i;
            }
        });
        const [next] = remaining.splice(bestIdx, 1);
        ordered.push(next);
        current = pointOf(next);
    }

    // 2-opt: reverse any sub-run that shortens the path. When there is no start
    // point the first stop is the de-facto start and stays put.
    const lockedHead = start ? 0 : 1;
    let route = ordered;
    let improved = true;
    let guard = 0;
    while (improved && guard++ < 100) {
        improved = false;
        for (let i = lockedHead; i < route.length - 1; i++) {
            for (let k = i + 1; k < route.length; k++) {
                const candidate = [...route.slice(0, i), ...route.slice(i, k + 1).reverse(), ...route.slice(k + 1)];
                if (
                    pathCost(start, candidate.map(pointOf), end) <
                    pathCost(start, route.map(pointOf), end) - 1e-9
                ) {
                    route = candidate;
                    improved = true;
                }
            }
        }
    }
    return route;
}

/**
 * Orders a technician's day.
 *  - In-progress jobs come first, then appointments with a fixed time in
 *    chronological order; that sequence is never reshuffled.
 *  - Flexible jobs are each slotted into the gap between anchors where they add
 *    the least distance, then ordered within that gap by nearest-neighbour + 2-opt.
 *  - Jobs without coordinates go last in time order, flagged `noLocation`.
 */
export function planRoute<T extends RouteStopInput>(stops: T[], origin: LatLng | null): PlannedRoute<T> {
    const located = stops.filter(hasCoords);
    const unlocated = stops.filter((s) => !hasCoords(s)).sort(byTime);

    const pinned = located.filter((s) => s.inProgress).sort(byTime);
    const fixed = located.filter((s) => !s.inProgress && isFixedAppointment(s)).sort(byTime);
    const flexible = located.filter((s) => !s.inProgress && !isFixedAppointment(s));
    const anchors = [...pinned, ...fixed];

    // Gap g sits between anchors[g-1] (or the origin) and anchors[g] (or the
    // open end of the day). Flexible stops may not jump ahead of in-progress work.
    const gapStart = (g: number) => (g === 0 ? origin : pointOf(anchors[g - 1]));
    const gapEnd = (g: number) => (g < anchors.length ? pointOf(anchors[g]) : null);
    const gaps: T[][] = anchors.map(() => [] as T[]).concat([[]]);
    const firstGap = pinned.length;

    for (const s of [...flexible].sort(byTime)) {
        const p = pointOf(s);
        let best = firstGap;
        let bestCost = Number.POSITIVE_INFINITY;
        for (let g = firstGap; g < gaps.length; g++) {
            const a = gapStart(g);
            const b = gapEnd(g);
            const cost = dist(a, p) + dist(p, b) - dist(a, b);
            if (cost < bestCost - 1e-9) {
                bestCost = cost;
                best = g;
            }
        }
        gaps[best].push(s);
    }

    const sequence: { stop: T; kind: StopKind }[] = [];
    for (let g = 0; g < gaps.length; g++) {
        for (const s of orderSegment(gapStart(g), gaps[g], gapEnd(g))) {
            sequence.push({ stop: s, kind: 'flexible' });
        }
        if (g < anchors.length) {
            const anchor = anchors[g];
            sequence.push({ stop: anchor, kind: anchor.inProgress ? 'inProgress' : 'fixed' });
        }
    }

    let prev: LatLng | null = origin;
    let totalKm = 0;
    let totalMin = 0;
    const planned: PlannedStop<T>[] = sequence.map(({ stop, kind }, i) => {
        const here = pointOf(stop);
        const leg = prev ? estimateLeg(prev, here) : null;
        if (leg && prev) {
            totalKm += haversineKm(prev, here);
            totalMin += leg.driveMinutes;
        }
        prev = here;
        return { stop, order: i + 1, kind, noLocation: false, leg };
    });

    for (const stop of unlocated) {
        planned.push({
            stop,
            order: planned.length + 1,
            kind: stop.inProgress ? 'inProgress' : isFixedAppointment(stop) ? 'fixed' : 'flexible',
            noLocation: true,
            leg: null,
        });
    }

    return { stops: planned, totalDistanceKm: round1(totalKm), totalDriveMinutes: totalMin };
}

const coord = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/**
 * Google Maps multi-stop directions link for the located stops, in order.
 * Without an origin Maps starts from the device's current location, which is
 * what a technician wants anyway. Routes longer than the waypoint cap are cut
 * off (`truncated`) — the tech re-opens Maps from the card after that stop.
 */
export function buildGoogleMapsRouteUrl(
    origin: LatLng | null,
    points: LatLng[],
): { url: string; truncated: boolean } | null {
    if (points.length === 0) return null;
    const maxStops = ROUTE_ESTIMATE.MAX_WAYPOINTS + 1;
    const truncated = points.length > maxStops;
    const used = points.slice(0, maxStops);
    const destination = used[used.length - 1];
    const waypoints = used.slice(0, -1);

    const params = ['api=1'];
    if (origin) params.push(`origin=${encodeURIComponent(coord(origin))}`);
    params.push(`destination=${encodeURIComponent(coord(destination))}`);
    if (waypoints.length) params.push(`waypoints=${encodeURIComponent(waypoints.map(coord).join('|'))}`);
    params.push('travelmode=driving');
    return { url: `https://www.google.com/maps/dir/?${params.join('&')}`, truncated };
}

/** Live ETA from the tech's latest ping to the site, or `basis: 'none'`. */
export function estimateLiveEta(opts: {
    status: string;
    ping: { lat: number; lng: number; createdAt: Date } | null;
    site: { lat: number | null; lng: number | null } | null;
    now?: Date;
}): { minutes: number | null; distanceKm: number | null; basis: 'live' | 'none' } {
    const none = { minutes: null, distanceKm: null, basis: 'none' as const };
    const { status, ping, site } = opts;
    if (status !== 'EN_ROUTE' || !ping || !site) return none;
    if (typeof site.lat !== 'number' || typeof site.lng !== 'number') return none;
    const ageMin = ((opts.now ?? new Date()).getTime() - new Date(ping.createdAt).getTime()) / 60_000;
    if (ageMin < -1 || ageMin > ROUTE_ESTIMATE.LIVE_PING_MAX_AGE_MIN) return none;
    const leg = estimateLeg(ping, { lat: site.lat, lng: site.lng });
    return { minutes: leg.driveMinutes, distanceKm: leg.distanceKm, basis: 'live' };
}
