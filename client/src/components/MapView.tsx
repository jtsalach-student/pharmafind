import type { ComponentType, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, Polyline, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchRoadRoute, type RoadRoute } from '../lib/routing';

// Fix Leaflet default marker icons for Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom colored icons for Pharmacy, Driver, and User
const createCustomIcon = (color: string, symbol: string) => {
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 34px;
        height: 34px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 16px;
        font-weight: bold;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        border: 3px solid white;
      ">
        ${symbol}
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17]
  });
};

const pharmacyIcon = createCustomIcon('#059669', '🏥');
const userIcon = createCustomIcon('#2563eb', '📍');
const driverIcon = createCustomIcon('#ea580c', '🏍️');

const TileLayerAny = TileLayer as any;
const PolylineAny = Polyline as any;
const CircleMarkerAny = CircleMarker as any;
const MarkerAny = Marker as any;

export type Point = {
  lat: number;
  lng: number;
  label: string;
  type?: 'pharmacy' | 'user' | 'driver' | 'waypoint';
};

const LeafletContainer = MapContainer as unknown as ComponentType<{
  center: [number, number];
  zoom: number;
  className: string;
  children: ReactNode;
}>;

interface MapViewProps {
  points: Point[];
  center: [number, number];
  driverPosition?: [number, number];
  showRoute?: boolean;
  className?: string;
}

export function MapView({
  points,
  center,
  driverPosition,
  showRoute = true,
  className = 'h-72 w-full rounded-2xl border'
}: MapViewProps) {
  const [roadRoute, setRoadRoute] = useState<RoadRoute | null>(null);

  useEffect(() => {
    if (!showRoute || points.length < 2) {
      setRoadRoute(null);
      return;
    }

    let isMounted = true;
    const startPoint: [number, number] = [points[0].lat, points[0].lng];
    const endPoint: [number, number] = [points[points.length - 1].lat, points[points.length - 1].lng];

    fetchRoadRoute(startPoint, endPoint).then((route) => {
      if (isMounted && route) {
        setRoadRoute(route);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [points, showRoute]);

  const getMarkerIcon = (point: Point) => {
    if (point.type === 'pharmacy') return pharmacyIcon;
    if (point.type === 'driver') return driverIcon;
    if (point.type === 'user') return userIcon;
    return undefined; // default Leaflet marker
  };

  return (
    <LeafletContainer center={center} zoom={13} className={className}>
      <TileLayerAny
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      {/* Main road network polyline */}
      {roadRoute && roadRoute.coordinates.length > 0 && (
        <>
          {/* Shadow/Glow line */}
          <PolylineAny
            positions={roadRoute.coordinates}
            color="#0284c7"
            weight={6}
            opacity={0.35}
          />
          {/* Solid road route */}
          <PolylineAny
            positions={roadRoute.coordinates}
            color="#0284c7"
            weight={4}
            opacity={0.9}
          />
        </>
      )}

      {/* Render Point Markers */}
      {points.map((p) => {
        const icon = getMarkerIcon(p);
        return (
          <MarkerAny
            key={`${p.lat}-${p.lng}-${p.label}`}
            position={[p.lat, p.lng]}
            icon={icon}
          >
            <Popup>
              <div className="font-sans text-xs">
                <p className="font-bold text-slate-900">{p.label}</p>
                <p className="text-slate-500">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</p>
              </div>
            </Popup>
          </MarkerAny>
        );
      })}

      {/* Render Animated/Live Driver Marker if provided */}
      {driverPosition && (
        <>
          <CircleMarkerAny
            center={driverPosition}
            radius={18}
            fillColor="#ea580c"
            fillOpacity={0.2}
            color="#ea580c"
            weight={1}
          />
          <MarkerAny position={driverPosition} icon={driverIcon}>
            <Popup>
              <div className="font-sans text-xs">
                <p className="font-bold text-orange-600">🏍️ Driver Location</p>
                <p className="text-slate-500">Live en route</p>
              </div>
            </Popup>
          </MarkerAny>
        </>
      )}
    </LeafletContainer>
  );
}
