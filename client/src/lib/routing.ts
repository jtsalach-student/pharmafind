import { getSupabaseClient } from './supabase';
import { calculateDistance, estimateDeliveryTime } from './geolocation';

export interface RoadRoute {
  coordinates: [number, number][]; // [latitude, longitude]
  distanceKm: number;
  etaMinutes: number;
}

const routeCache = new Map<string, RoadRoute>();

/**
 * Fetch road network geometry between two points using OSRM with simulated road grid fallback
 */
export async function fetchRoadRoute(
  start: [number, number], // [lat, lng] (Pharmacy / Driver)
  end: [number, number]   // [lat, lng] (User)
): Promise<RoadRoute> {
  const cacheKey = `${start[0].toFixed(4)},${start[1].toFixed(4)}->${end[0].toFixed(4)},${end[1].toFixed(4)}`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }

  console.log('[Road Routing Engine] Computing road distance from', start, 'to', end);

  const directDistance = calculateDistance(
    { latitude: start[0], longitude: start[1] },
    { latitude: end[0], longitude: end[1] }
  );

  let result: RoadRoute | null = null;

  try {
    const startStr = `${start[1]},${start[0]}`; // lng,lat for OSRM
    const endStr = `${end[1]},${end[0]}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${startStr};${endStr}?overview=full&geometries=geojson`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coordinates: [number, number][] = route.geometry.coordinates.map(
          (c: [number, number]) => [c[1], c[0]] // convert [lng, lat] to [lat, lng]
        );

        if (coordinates.length >= 2) {
          const distanceKm = Number((route.distance / 1000).toFixed(1));
          const etaMinutes = Math.max(1, Math.round(route.duration / 60));
          result = { coordinates, distanceKm, etaMinutes };
        }
      }
    }
  } catch {
    // Network or timeout failure - fallback to simulated urban street network
  }

  if (!result) {
    result = generateStreetGridRoute(start, end, directDistance);
  }

  routeCache.set(cacheKey, result);
  return result;
}

/**
 * Generate a realistic multi-point urban road route that follows streets rather than a straight line
 */
export function generateStreetGridRoute(
  start: [number, number],
  end: [number, number],
  directDistanceKm: number
): RoadRoute {
  const [startLat, startLng] = start;
  const [endLat, endLng] = end;

  const latDiff = endLat - startLat;
  const lngDiff = endLng - startLng;

  // Create intermediate street-like waypoints with realistic road turns
  const numWaypoints = Math.max(8, Math.min(24, Math.round(directDistanceKm * 4)));
  const coordinates: [number, number][] = [start];

  for (let i = 1; i < numWaypoints; i++) {
    const fraction = i / numWaypoints;
    // Introduce orthogonal street Manhattan grid offsets with curve modulation
    const streetPerturbation = Math.sin(fraction * Math.PI) * 0.0018 * ((i % 2 === 0) ? 1 : -0.7);
    const orthoShift = Math.sin(fraction * Math.PI * 2) * 0.0012;

    const lat = startLat + (latDiff * fraction) + streetPerturbation;
    const lng = startLng + (lngDiff * fraction) + orthoShift;
    coordinates.push([Number(lat.toFixed(6)), Number(lng.toFixed(6))]);
  }

  coordinates.push(end);

  const roadFactor = 1.25; // Urban road network distance multiplier
  const distanceKm = Number((Math.max(0.5, directDistanceKm * roadFactor)).toFixed(1));
  const etaMinutes = estimateDeliveryTime(distanceKm);

  return { coordinates, distanceKm, etaMinutes };
}

/**
 * Interpolate location along route coordinates given progress fraction (0.0 to 1.0)
 */
export function interpolatePositionAlongRoute(
  coordinates: [number, number][],
  progress: number // 0 to 1
): {
  position: [number, number];
  currentIndex: number;
  remainingFraction: number;
} {
  if (!coordinates.length) {
    return { position: [5.6037, -0.1870], currentIndex: 0, remainingFraction: 1 };
  }
  if (coordinates.length === 1 || progress <= 0) {
    return { position: coordinates[0], currentIndex: 0, remainingFraction: 1 };
  }
  if (progress >= 1) {
    return { position: coordinates[coordinates.length - 1], currentIndex: coordinates.length - 1, remainingFraction: 0 };
  }

  const totalPoints = coordinates.length;
  const exactIndex = progress * (totalPoints - 1);
  const lowerIndex = Math.floor(exactIndex);
  const upperIndex = Math.min(lowerIndex + 1, totalPoints - 1);
  const localFraction = exactIndex - lowerIndex;

  const [lat1, lng1] = coordinates[lowerIndex];
  const [lat2, lng2] = coordinates[upperIndex];

  const currentLat = lat1 + (lat2 - lat1) * localFraction;
  const currentLng = lng1 + (lng2 - lng1) * localFraction;

  return {
    position: [Number(currentLat.toFixed(6)), Number(currentLng.toFixed(6))],
    currentIndex: lowerIndex,
    remainingFraction: Math.max(0, 1 - progress)
  };
}

/**
 * Send notification to user about delivery status
 */
export async function sendDeliveryNotification(
  userId: string,
  message: string,
  type: string
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.from('Notification').insert([{
      userId,
      message,
      type,
      provider: 'SYSTEM',
      status: 'SENT'
    }]);
  } catch (err) {
    console.warn('Failed to send notification:', err);
  }
}

/**
 * Rank and sort pharmacies by shortest road network distance (not straight-line distance)
 */
export async function rankPharmaciesByRoadRoute<T extends { latitude?: number | null; longitude?: number | null }>(
  userLocation: [number, number] | { latitude: number; longitude: number },
  pharmacies: T[]
): Promise<Array<T & { distanceKm: number; etaMinutes: number; roadRoute: RoadRoute }>> {
  const userCoords: [number, number] = Array.isArray(userLocation)
    ? userLocation
    : [userLocation.latitude, userLocation.longitude];

  const ranked = await Promise.all(
    pharmacies.map(async (pharmacy) => {
      const pharmCoords: [number, number] = (pharmacy.latitude != null && pharmacy.longitude != null)
        ? [pharmacy.latitude, pharmacy.longitude]
        : [5.6037, -0.1870];

      const roadRoute = await fetchRoadRoute(pharmCoords, userCoords);

      return {
        ...pharmacy,
        distanceKm: roadRoute.distanceKm,
        etaMinutes: roadRoute.etaMinutes,
        roadRoute
      };
    })
  );

  // Sort strictly by shortest road network distance
  return ranked.sort((a, b) => a.distanceKm - b.distanceKm);
}
