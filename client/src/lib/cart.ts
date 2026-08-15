// Cart types and utilities
import { calculateDeliveryFee } from './geolocation';

export type CartItem = {
  id: string; // unique identifier: drugId-pharmacyId-batchNumber
  drugId: string;
  drugName: string;
  brandName: string;
  drugType?: string;
  strength?: string;
  indication?: string;
  category?: string;
  requiresRx?: boolean;
  isEmergency?: boolean;
  
  pharmacyId: string;
  pharmacyName: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  opensAt?: string;
  closesAt?: string;
  pharmacyIsOpen?: boolean;
  
  unitPrice: number; // from Inventory.price
  quantity: number; // user selected quantity
  availableQuantity: number; // max available in inventory
  expiryDate?: string;
  batchNumber?: string;
  distanceKm: number;
  etaMinutes: number;
  
  subtotal: number; // unitPrice * quantity
};

export type Cart = {
  items: CartItem[];
  totalItems: number;
  totalCost: number; // sum of all subtotals + delivery fee
  deliveryFee: number;
  medicationTotal: number; // sum of all subtotals
};

export type PharmacyMatchResult = {
  pharmacyId: string;
  pharmacyName: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  opensAt?: string;
  closesAt?: string;
  pharmacyIsOpen?: boolean;
  distanceKm: number;
  etaMinutes: number;
  
  matchedItems: CartItem[]; // items this pharmacy has
  matchedCount: number; // how many items this pharmacy has
  totalCount: number; // total items in cart
  hasAllItems: boolean; // true if pharmacy has all items
  totalCostForPharmacy: number; // sum of matched items subtotals
  availabilityScore: number; // 0-100, based on matchedCount/totalCount
};

export type PharmacyMatchAnalysis = {
  fullMatches: PharmacyMatchResult[]; // pharmacies with all items
  partialMatches: PharmacyMatchResult[]; // pharmacies with some items
  bestRecommendation?: PharmacyMatchResult; // top recommended pharmacy
};

// Calculate cart totals
export function calculateCartTotals(items: CartItem[], deliveryFeeOverride?: number): Cart {
  const medicationTotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  
  let deliveryFee: number;
  if (deliveryFeeOverride !== undefined) {
    deliveryFee = deliveryFeeOverride;
  } else if (items.length > 0) {
    const maxDistanceKm = Math.max(...items.map(i => i.distanceKm ?? 0));
    deliveryFee = calculateDeliveryFee(maxDistanceKm);
  } else {
    deliveryFee = calculateDeliveryFee(0);
  }

  const totalCost = medicationTotal + deliveryFee;

  return {
    items,
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
    totalCost: Number(totalCost.toFixed(2)),
    deliveryFee: Number(deliveryFee.toFixed(2)),
    medicationTotal: Number(medicationTotal.toFixed(2))
  };
}

// Create unique ID for cart item
export function createCartItemId(drugId: string, pharmacyId: string, batchNumber?: string): string {
  return `${drugId}-${pharmacyId}${batchNumber ? `-${batchNumber}` : ''}`;
}

// Analyze which pharmacies have which items
export function analyzePharmacyMatches(
  cartItems: CartItem[],
  allPharmacyOptions: CartItem[]
): PharmacyMatchAnalysis {
  if (cartItems.length === 0) {
    return { fullMatches: [], partialMatches: [] };
  }

  const pharmaciesByIdMap = new Map<string, CartItem[]>();

  // Group all options by pharmacy
  allPharmacyOptions.forEach(option => {
    const key = option.pharmacyId;
    if (!pharmaciesByIdMap.has(key)) {
      pharmaciesByIdMap.set(key, []);
    }
    pharmaciesByIdMap.get(key)!.push(option);
  });

  // Build results for each pharmacy
  const pharmacyResults: PharmacyMatchResult[] = [];

  pharmaciesByIdMap.forEach((availableItems, pharmacyId) => {
    const firstOption = availableItems[0];
    
    // Check which cart items are available at this pharmacy
    const matchedItems: CartItem[] = [];
    
    cartItems.forEach(cartItem => {
      const matchingOption = availableItems.find(
        opt => opt.drugId === cartItem.drugId
      );
      
      if (matchingOption) {
        matchedItems.push({
          ...cartItem,
          unitPrice: matchingOption.unitPrice,
          availableQuantity: matchingOption.availableQuantity,
          expiryDate: matchingOption.expiryDate,
          batchNumber: matchingOption.batchNumber,
          distanceKm: matchingOption.distanceKm,
          etaMinutes: matchingOption.etaMinutes,
          subtotal: Number((cartItem.quantity * matchingOption.unitPrice).toFixed(2))
        });
      }
    });

    const matchedCount = matchedItems.length;
    const totalCount = cartItems.length;
    const hasAllItems = matchedCount === totalCount;
    const totalCostForPharmacy = matchedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const availabilityScore = Math.round((matchedCount / totalCount) * 100);

    pharmacyResults.push({
      pharmacyId,
      pharmacyName: firstOption.pharmacyName,
      address: firstOption.address,
      phone: firstOption.phone,
      latitude: firstOption.latitude,
      longitude: firstOption.longitude,
      opensAt: firstOption.opensAt,
      closesAt: firstOption.closesAt,
      pharmacyIsOpen: firstOption.pharmacyIsOpen,
      distanceKm: firstOption.distanceKm,
      etaMinutes: firstOption.etaMinutes,
      matchedItems,
      matchedCount,
      totalCount,
      hasAllItems,
      totalCostForPharmacy: Number(totalCostForPharmacy.toFixed(2)),
      availabilityScore
    });
  });

  // Separate into full and partial matches
  const fullMatches = pharmacyResults
    .filter(p => p.hasAllItems)
    .sort((a, b) => {
      // Sort full matches by distance first, then price
      if (a.distanceKm !== b.distanceKm) {
        return a.distanceKm - b.distanceKm;
      }
      return a.totalCostForPharmacy - b.totalCostForPharmacy;
    });

  const partialMatches = pharmacyResults
    .filter(p => !p.hasAllItems && p.matchedCount > 0)
    .sort((a, b) => {
      // Sort partial matches by availability score (desc), then distance (asc)
      if (a.availabilityScore !== b.availabilityScore) {
        return b.availabilityScore - a.availabilityScore;
      }
      return a.distanceKm - b.distanceKm;
    });

  // Determine best recommendation
  let bestRecommendation: PharmacyMatchResult | undefined;
  if (fullMatches.length > 0) {
    bestRecommendation = fullMatches[0];
  } else if (partialMatches.length > 0) {
    bestRecommendation = partialMatches[0];
  }

  return {
    fullMatches,
    partialMatches,
    bestRecommendation
  };
}
