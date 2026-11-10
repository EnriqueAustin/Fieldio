/**
 * Turn-by-turn navigation links for the field console.
 *
 * West Coast jobs are rural plots and farms whose street text does not geocode,
 * so whenever the property carries real coordinates (Property.geoLat/geoLng) we
 * navigate to the exact point and fall back to the address string only when it
 * doesn't. Both helpers emit *directions* intents (not a map search), so the
 * phone's map app opens straight into navigation from the tech's location.
 */

export interface MapsDestination {
    lat?: number | null;
    lng?: number | null;
    address?: string | null;
}

/** True only when both coordinates are real, finite numbers. */
function hasCoords(d: MapsDestination): d is MapsDestination & { lat: number; lng: number } {
    return (
        typeof d.lat === "number" &&
        Number.isFinite(d.lat) &&
        typeof d.lng === "number" &&
        Number.isFinite(d.lng)
    );
}

/** Google Maps directions deep link — coordinates when present, else the address. */
export function googleMapsLink(d: MapsDestination): string {
    const destination = hasCoords(d) ? `${d.lat},${d.lng}` : (d.address ?? "").trim();
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/** Waze navigation deep link — coordinates when present (ll + navigate), else a
 *  free-text query. Waze has no address-in-ll form, so a plotless address uses q. */
export function wazeLink(d: MapsDestination): string {
    if (hasCoords(d)) {
        return `https://waze.com/ul?ll=${d.lat},${d.lng}&navigate=yes`;
    }
    return `https://waze.com/ul?q=${encodeURIComponent((d.address ?? "").trim())}&navigate=yes`;
}
