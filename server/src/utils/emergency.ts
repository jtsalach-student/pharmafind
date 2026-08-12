const stockScore = (qty: number): number => {
  if (qty <= 0) return 0;
  if (qty <= 5) return 20;
  if (qty <= 15) return 40;
  return 60;
};

const distanceScore = (distanceKm: number): number => {
  if (distanceKm <= 0.5) return 100;
  if (distanceKm <= 1) return 80;
  if (distanceKm <= 2) return 60;
  if (distanceKm <= 3) return 40;
  return 20;
};

export const emergencyScore = (qty: number, isOpen: boolean, distanceKm: number): number =>
  stockScore(qty) + (isOpen ? 100 : 0) + distanceScore(distanceKm);
