export const earthRadiusKm = 6371;

/**
 * Straight-line (crow-flies) Haversine distance in km.
 * Kept as a primitive — prefer `roadDistanceKm` for any user-visible ranking.
 */
export const haversineDistanceKm = (
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLon = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

/**
 * Estimated road-network distance in km.
 * Applies an urban road-factor of 1.3× to the Haversine straight-line distance,
 * consistent with the OSRM-based routing used on the client side.
 * Use this for sorting and delivery-fee calculations.
 */
export const URBAN_ROAD_FACTOR = 1.3;

export const roadDistanceKm = (
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number => haversineDistanceKm(fromLat, fromLng, toLat, toLng) * URBAN_ROAD_FACTOR;

/**
 * Estimated road-network ETA in minutes at an average urban speed of 30 km/h.
 */
export const roadEtaMinutes = (distanceKm: number): number =>
  Math.ceil((distanceKm / 30) * 60);
