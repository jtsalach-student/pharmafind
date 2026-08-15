export type Coordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
};

const EARTH_RADIUS_KM = 6371;

/**
 * Calculate great-circle distance between two coordinates in kilometers
 */
export function calculateDistance(from: Coordinates, to: Coordinates): number {
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Estimate travel time in minutes based on distance and average urban speed.
 */
export function estimateDeliveryTime(distanceKm: number): number {
  const URBAN_SPEED_KMH = 35;
  const etaMinutes = Math.round((distanceKm / URBAN_SPEED_KMH) * 60);
  return Math.max(1, etaMinutes);
}

/**
 * Calculate delivery fee based on distance.
 * Formula: Base Fee (GH₵ 2.00) + (Distance × GH₵ 1.50)
 */
export function calculateDeliveryFee(distanceKm: number): number {
  const BASE_FEE = 2.0;
  const RATE_PER_KM = 1.5;
  const fee = BASE_FEE + (Math.max(0, distanceKm) * RATE_PER_KM);
  return Number(fee.toFixed(2));
}

/**
 * Request device geolocation with a timeout
 */
export async function getDeviceLocation(timeoutMs: number = 10000): Promise<Coordinates | null> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => resolve(null), timeoutMs);

    if (!navigator.geolocation) {
      clearTimeout(timeoutId);
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeoutId);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        });
      },
      () => {
        clearTimeout(timeoutId);
        resolve(null);
      },
      { timeout: timeoutMs, enableHighAccuracy: false, maximumAge: 300000 }
    );
  });
}

/**
 * Store patient location in localStorage and Supabase (if available)
 */
export function storePatientLocation(coords: Coordinates): void {
  try {
    localStorage.setItem('pharmafind_patient_location', JSON.stringify({
      ...coords,
      storedAt: new Date().toISOString()
    }));
  } catch {
    console.warn('Failed to store patient location');
  }
}

/**
 * Retrieve stored patient location from localStorage
 */
export function getStoredPatientLocation(): (Coordinates & { storedAt: string }) | null {
  try {
    const stored = localStorage.getItem('pharmafind_patient_location');
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Clear stored patient location
 */
export function clearStoredPatientLocation(): void {
  try {
    localStorage.removeItem('pharmafind_patient_location');
  } catch {
    // Silently fail
  }
}

/**
 * Resolve user location from stored patient/user location or live browser geolocation
 */
export async function resolveUserLocation(): Promise<Coordinates> {
  // 1. Check patient stored location
  const stored = getStoredPatientLocation();
  if (stored && Number.isFinite(stored.latitude) && Number.isFinite(stored.longitude)) {
    return { latitude: stored.latitude, longitude: stored.longitude };
  }

  // 2. Check general user location
  try {
    const generalStored = localStorage.getItem('pharmafind_user_location');
    if (generalStored) {
      const parsed = JSON.parse(generalStored);
      if (parsed && Number.isFinite(parsed.latitude) && Number.isFinite(parsed.longitude)) {
        return { latitude: parsed.latitude, longitude: parsed.longitude };
      }
    }
  } catch {}

  // 3. Try live browser geolocation
  const live = await getDeviceLocation(6000);
  if (live && Number.isFinite(live.latitude) && Number.isFinite(live.longitude)) {
    storePatientLocation(live);
    return live;
  }

  // 4. Safe Accra baseline (Legon / Greater Accra) if device denied
  return { latitude: 5.6506, longitude: -0.1870 };
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

