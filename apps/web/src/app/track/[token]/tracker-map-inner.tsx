"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { latLng, latLngBounds, type LatLngTuple } from "leaflet";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { TrackerMapProps } from "./tracker-map";

const TECH_COLOUR = "#7c3aed";
const HOME_COLOUR = "#0f172a";

// Fit both points once; after that only pan when the tech drives out of view,
// so a customer's own zoom isn't undone by every 20s refresh.
function KeepInView({ tech, home }: TrackerMapProps) {
    const map = useMap();
    const fitted = useRef(false);

    useEffect(() => {
        const techPoint = latLng(tech.lat, tech.lng);
        if (!fitted.current) {
            fitted.current = true;
            if (home) {
                map.fitBounds(latLngBounds([techPoint, latLng(home.lat, home.lng)]), { padding: [40, 40], maxZoom: 15 });
            } else {
                map.setView(techPoint, 14);
            }
            return;
        }
        if (!map.getBounds().contains(techPoint)) map.panTo(techPoint);
    }, [tech.lat, tech.lng, home, map]);

    return null;
}

export default function TrackerMapInner({ tech, home }: TrackerMapProps) {
    const center: LatLngTuple = [tech.lat, tech.lng];
    return (
        <div className="relative isolate h-64 overflow-hidden rounded-xl sm:h-80" role="region" aria-label="Map of your technician's location">
            <MapContainer center={center} zoom={13} scrollWheelZoom={false} className="h-full w-full">
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <KeepInView tech={tech} home={home} />
                {home ? (
                    <CircleMarker
                        center={[home.lat, home.lng]}
                        radius={8}
                        pathOptions={{ color: "#ffffff", fillColor: HOME_COLOUR, fillOpacity: 1, weight: 3 }}
                    >
                        <Tooltip direction="top" offset={[0, -8]}>
                            Your address
                        </Tooltip>
                    </CircleMarker>
                ) : null}
                <CircleMarker
                    center={center}
                    radius={10}
                    pathOptions={{ color: "#ffffff", fillColor: TECH_COLOUR, fillOpacity: 1, weight: 3 }}
                >
                    <Tooltip permanent direction="top" offset={[0, -10]}>
                        {tech.label}
                    </Tooltip>
                </CircleMarker>
            </MapContainer>
        </div>
    );
}
