// Customer-facing ETA from the technician's latest location fix to the job
// site. Pure and dependency-free so it can be unit-tested and reused by the
// public tracker and the en-route message.
//
// Straight-line distance is stretched by a road factor and divided by an
// average urban speed. It is an estimate only (no paid routing API), so it is
// rounded coarsely and always presented to customers as "about".

/** Roads are rarely straight: ~1.35x the crow-flies distance in SA metros. */
export const ETA_ROAD_FACTOR = 1.35;
/** Average urban driving speed including lights and traffic. */
export const ETA_AVG_SPEED_KMH = 35;
/** Never promise less than this — parking, gates and finding the house. */
export const ETA_MIN_MINUTES = 3;
/** Above this many minutes the ETA is rounded to ETA_ROUND_TO_MINUTES. */
export const ETA_ROUND_ABOVE_MINUTES = 15;
export const ETA_ROUND_TO_MINUTES = 5;
/** A fix older than this is too stale to estimate from. */
export const ETA_MAX_FIX_AGE_MS = 5 * 60_000;
/** Tolerated clock skew for a fix stamped slightly in the future. */
const MAX_FUTURE_SKEW_MS = 60_000;

const EARTH_RADIUS_KM = 6371;

export interface GeoPoint {
    lat: number;
    lng: number;
}

export interface LocationFix extends GeoPoint {
    createdAt: Date;
}

export const haversineKm = (a: GeoPoint, b: GeoPoint): number => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h =
        Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Rounds raw drive minutes the way they are shown to a customer. */
export const roundEtaMinutes = (rawMinutes: number): number => {
    const minutes = Math.max(ETA_MIN_MINUTES, Math.ceil(rawMinutes));
    if (minutes <= ETA_ROUND_ABOVE_MINUTES) return minutes;
    return Math.round(minutes / ETA_ROUND_TO_MINUTES) * ETA_ROUND_TO_MINUTES;
};

/** True when the fix is recent enough to estimate an arrival from. */
export const isFreshFix = (fix: { createdAt: Date } | null | undefined, now: Date = new Date()): boolean => {
    if (!fix) return false;
    const ageMs = now.getTime() - new Date(fix.createdAt).getTime();
    return ageMs >= -MAX_FUTURE_SKEW_MS && ageMs <= ETA_MAX_FIX_AGE_MS;
};

/**
 * Minutes until the technician arrives, or null when there is no fresh fix or
 * the destination has no coordinates.
 */
export const estimateEtaMinutes = (opts: {
    fix: LocationFix | null | undefined;
    destination: { lat: number | null | undefined; lng: number | null | undefined } | null | undefined;
    now?: Date;
}): number | null => {
    const { fix, destination } = opts;
    if (!fix || !isFreshFix(fix, opts.now)) return null;
    if (!destination || typeof destination.lat !== 'number' || typeof destination.lng !== 'number') return null;
    if (!Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) return null;
    const roadKm = haversineKm(fix, { lat: destination.lat, lng: destination.lng }) * ETA_ROAD_FACTOR;
    return roundEtaMinutes((roadKm / ETA_AVG_SPEED_KMH) * 60);
};

/** Short label for messages, e.g. "15 min" or "1 h 10 min". */
export const formatEta = (minutes: number): string => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
};
