import type { ComponentType, ReactNode } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

type Point = { lat: number; lng: number; label: string };
const LeafletContainer = MapContainer as unknown as ComponentType<{
  center: [number, number];
  zoom: number;
  className: string;
  children: ReactNode;
}>;

export function MapView({ points, center }: { points: Point[]; center: [number, number] }) {
  return (
    <LeafletContainer center={center} zoom={13} className="h-72 w-full rounded border">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {points.map((p) => (
        <Marker key={`${p.lat}-${p.lng}-${p.label}`} position={[p.lat, p.lng]}>
          <Popup>{p.label}</Popup>
        </Marker>
      ))}
    </LeafletContainer>
  );
}
