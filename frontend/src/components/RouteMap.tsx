import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Stop, StopKind, TripPlan } from "../types";
import { STOP_LABEL } from "../types";

const STOP_STYLE: Record<StopKind, { color: string; glyph: string }> = {
  start: { color: "#0f1b33", glyph: "A" },
  pickup: { color: "#2c6a50", glyph: "P" },
  dropoff: { color: "#9e4023", glyph: "D" },
  fuel: { color: "#b0771a", glyph: "F" },
  break: { color: "#6e7a96", glyph: "30" },
  rest: { color: "#5b54a8", glyph: "10" },
  restart: { color: "#7a2f66", glyph: "34" },
};

function pin(kind: StopKind) {
  const { color, glyph } = STOP_STYLE[kind];
  return L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div style="
      width:26px;height:26px;border-radius:50%;
      background:${color};color:#fff;border:2.5px solid #fff;
      box-shadow:0 1px 5px rgba(15,27,51,.4);
      display:flex;align-items:center;justify-content:center;
      font:600 ${glyph.length > 1 ? 9 : 11}px 'IBM Plex Mono',monospace;
    ">${glyph}</div>`,
  });
}

function FitToRoute({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    map.fitBounds(L.latLngBounds(points), { padding: [44, 44] });
  }, [map, points]);
  return null;
}

/** The same canvas the route lands on, shown before there is one. */
export function PreviewMap({ caption }: { caption: string }) {
  return (
    <div className="relative h-[440px] overflow-hidden rounded-lg border border-rule">
      <MapContainer center={[39.5, -98.35]} zoom={4} scrollWheelZoom={false}
        dragging={false} doubleClickZoom={false} zoomControl={false}
        attributionControl={false} className="h-full w-full opacity-70">
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
      </MapContainer>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="rounded-full border border-rule bg-surface/95 px-4 py-2 text-xs
                         font-medium text-ink-mid shadow-sm">
          {caption}
        </span>
      </div>
    </div>
  );
}

export function RouteMap({ plan }: { plan: TripPlan }) {
  const points = plan.route.geometry as [number, number][];

  const located = useMemo(
    () => plan.stops.filter((s): s is Stop & { lat: number; lon: number } =>
      typeof s.lat === "number" && typeof s.lon === "number"),
    [plan.stops],
  );

  const centre = points[Math.floor(points.length / 2)] ?? [39.5, -98.35];

  return (
    <div className="relative h-[440px] overflow-hidden rounded-lg border border-rule">
      <MapContainer center={centre} zoom={5} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <FitToRoute points={points} />
        {points.length > 1 && (
          <>
            <Polyline positions={points} pathOptions={{ color: "#ffffff", weight: 7, opacity: 0.85 }} />
            <Polyline positions={points} pathOptions={{ color: "#0f1b33", weight: 3.5 }} />
          </>
        )}
        {located.map((stop) => (
          <Marker key={stop.order} position={[stop.lat, stop.lon]} icon={pin(stop.kind)}>
            <Popup>
              <div className="font-sans">
                <div className="font-semibold text-ink">{STOP_LABEL[stop.kind]}</div>
                <div className="text-ink-mid">{stop.label}</div>
                <div className="mt-1 font-mono text-xs text-ink-mute tabular">
                  {new Date(stop.arrive_at).toLocaleString([], {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                  {" · "}
                  {stop.duration_hours}h · mile {Math.round(stop.trip_miles).toLocaleString()}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] flex flex-wrap gap-1.5">
        {(Object.keys(STOP_STYLE) as StopKind[])
          .filter((kind) => located.some((s) => s.kind === kind))
          .map((kind) => (
            <span key={kind}
              className="flex items-center gap-1.5 rounded bg-white/95 px-2 py-1 text-[11px]
                         font-medium text-ink shadow-sm ring-1 ring-rule">
              <span className="h-2.5 w-2.5 rounded-full"
                style={{ background: STOP_STYLE[kind].color }} />
              {STOP_LABEL[kind]}
            </span>
          ))}
      </div>
    </div>
  );
}
