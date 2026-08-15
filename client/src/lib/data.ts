import { getSupabaseClient, type AppRole } from './supabase';
import { calculateDistance, type Coordinates } from './geolocation';
import { fetchRoadRoute } from './routing';

/**
 * Determine if a pharmacy is currently open based on Ghana/Accra local time.
 * Handles both normal hours (e.g. 07:00–22:00) and overnight spans (e.g. 22:00–06:00).
 * Falls back to CLOSED when times are missing or unparseable.
 */
export function isPharmacyOpen(opensAt: string | null | undefined, closesAt: string | null | undefined): boolean {
  if (!opensAt || !closesAt) return false; // Missing hours → treat as CLOSED, never recommend

  try {
    // Use Accra/Ghana time (UTC+0 year-round; no DST)
    const nowUtc = new Date();
    const nowAccra = new Date(nowUtc.toLocaleString('en-US', { timeZone: 'Africa/Accra' }));
    const currentMinutes = nowAccra.getHours() * 60 + nowAccra.getMinutes();

    const [openH, openM] = opensAt.split(':').map(Number);
    const [closeH, closeM] = closesAt.split(':').map(Number);

    if ([openH, openM, closeH, closeM].some((n) => !Number.isFinite(n))) return false;

    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    // Overnight span: e.g. 22:00 → 06:00
    if (closeMinutes <= openMinutes) {
      return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
    }

    // Normal span: e.g. 07:00 → 22:00
    return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  } catch {
    return false; // Parse error → treat as CLOSED
  }
}

/**
 * Return true if an inventory item is expired relative to today (Accra time).
 */
function isInventoryExpired(expiryDate: string | null | undefined): boolean {
  if (!expiryDate) return false;

  try {
    const nowUtc = new Date();
    const todayAccra = new Date(nowUtc.toLocaleString('en-US', { timeZone: 'Africa/Accra' }));
    todayAccra.setHours(0, 0, 0, 0);

    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);

    return expiry < todayAccra;
  } catch {
    return false;
  }
}

export type DashboardStats = {
  label: string;
  value: string;
  detail: string;
};

export type PharmacyRecord = {
  id: string;
  name: string;
  address?: string;
  location?: string;
  facility?: string;
  phone?: string;
  latitude?: number;
  longitude?: number;
  opensAt?: string;
  closesAt?: string;
  isOpen?: boolean;
};

export type DrugRecord = {
  id: string;
  genericName: string;
  brandName: string;
  category?: string;
  price?: number | string;
  isEmergency?: boolean;
  requiresRx?: boolean;
  drugType?: string;
  strength?: string;
  indication?: string;
};

export type PrescriptionRecord = {
  id: string;
  userId: string;
  status: string;
  filePath?: string;
  originalFileName?: string;
  createdAt: string;
  drugId?: string;
  quantity?: number;
  drug?: {
    id: string;
    genericName: string;
    brandName: string;
    category?: string;
    drugType?: string;
    strength?: string;
    indication?: string;
  };
};

export type DeliveryRecord = {
  id: string;
  userId: string;
  prescriptionId: string;
  status: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  deliveryAddress?: string;
  phoneNumber?: string;
  createdAt: string;
  requestedAt?: string;
  updatedAt?: string;
  gpsLocations?: Array<{ latitude: number; longitude: number; createdAt: string }>;
  prescription?: {
    id: string;
    userId: string;
    drugId?: string;
    pharmacyId?: string;
    quantity?: number;
    status: string;
    drug?: DrugRecord;
    pharmacy?: PharmacyRecord;
  };
};

export async function getDashboardData(role: AppRole) {
  const supabase = getSupabaseClient();

  const fetchers = {
    USER: async () => {
      const [{ count: prescriptionCount }, { count: deliveryCount }, { count: pharmacyCount }] = await Promise.all([
        supabase.from('Prescription').select('*', { count: 'exact', head: true }),
        supabase.from('DeliveryRequest').select('*', { count: 'exact', head: true }),
        supabase.from('Pharmacy').select('*', { count: 'exact', head: true })
      ]);

      return {
        stats: [
          { label: 'My prescriptions', value: String(prescriptionCount ?? 0), detail: 'Active items' },
          { label: 'Deliveries', value: String(deliveryCount ?? 0), detail: 'In progress' },
          { label: 'Nearby pharmacies', value: String(pharmacyCount ?? 0), detail: 'Available' }
        ]
      };
    },
    PHARMACIST: async () => {
      const [{ count: reviewCount }, { count: prescriptionCount }, { count: pharmacyCount }] = await Promise.all([
        supabase.from('Prescription').select('*', { count: 'exact', head: true }).eq('status', 'PENDING_REVIEW'),
        supabase.from('Prescription').select('*', { count: 'exact', head: true }),
        supabase.from('Pharmacy').select('*', { count: 'exact', head: true })
      ]);

      return {
        stats: [
          { label: 'Pending reviews', value: String(reviewCount ?? 0), detail: 'Need approval' },
          { label: 'Prescriptions', value: String(prescriptionCount ?? 0), detail: 'Total records' },
          { label: 'Pharmacies', value: String(pharmacyCount ?? 0), detail: 'Network' }
        ]
      };
    },
    PHARMACY_ADMIN: async () => {
      const [{ count: patientCount }, { count: prescriptionCount }, { count: deliveryCount }] = await Promise.all([
        supabase.from('User').select('*', { count: 'exact', head: true }).eq('role', 'USER'),
        supabase.from('Prescription').select('*', { count: 'exact', head: true }),
        supabase.from('DeliveryRequest').select('*', { count: 'exact', head: true })
      ]);

      return {
        stats: [
          { label: 'Users', value: String(patientCount ?? 0), detail: 'Registered' },
          { label: 'Prescriptions', value: String(prescriptionCount ?? 0), detail: 'Handled' },
          { label: 'Deliveries', value: String(deliveryCount ?? 0), detail: 'Scheduled' }
        ]
      };
    },
    DRIVER: async () => {
      const [{ count: deliveryCount }, { count: activeCount }, { count: completedCount }] = await Promise.all([
        supabase.from('DeliveryRequest').select('*', { count: 'exact', head: true }),
        supabase.from('DeliveryRequest').select('*', { count: 'exact', head: true }).eq('status', 'IN_TRANSIT'),
        supabase.from('DeliveryRequest').select('*', { count: 'exact', head: true }).eq('status', 'COMPLETED')
      ]);

      return {
        stats: [
          { label: 'Assignments', value: String(deliveryCount ?? 0), detail: 'Open routes' },
          { label: 'In transit', value: String(activeCount ?? 0), detail: 'Active' },
          { label: 'Delivered', value: String(completedCount ?? 0), detail: 'Completed' }
        ]
      };
    },
    SYSTEM_ADMIN: async () => {
      const [{ count: userCount }, { count: prescriptionCount }, { count: deliveryCount }] = await Promise.all([
        supabase.from('User').select('*', { count: 'exact', head: true }),
        supabase.from('Prescription').select('*', { count: 'exact', head: true }),
        supabase.from('DeliveryRequest').select('*', { count: 'exact', head: true })
      ]);

      return {
        stats: [
          { label: 'Users', value: String(userCount ?? 0), detail: 'Registered accounts' },
          { label: 'Prescriptions', value: String(prescriptionCount ?? 0), detail: 'Tracked orders' },
          { label: 'Deliveries', value: String(deliveryCount ?? 0), detail: 'In network' }
        ]
      };
    }
  };

  return fetchers[role]();
}

export async function getPharmacies(): Promise<PharmacyRecord[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.from('Pharmacy').select('*').order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getNearbyPharmacies(
  patientLocation: Coordinates,
  radiusKm: number = 10
): Promise<(PharmacyRecord & { distanceKm: number; etaMinutes: number; isOpen: boolean })[]> {
  const supabase = getSupabaseClient();

  // Fetch pharmacies with opening hours so we can compute open status
  const { data, error } = await supabase
    .from('Pharmacy')
    .select('id, name, address, phone, latitude, longitude, opensAt, closesAt');
  if (error) throw error;

  const pharmacies = (data ?? []) as PharmacyRecord[];

  const results = await Promise.all(
    pharmacies.map(async (pharmacy) => {
      if (pharmacy.latitude == null || pharmacy.longitude == null) return null;

      const roadRoute = await fetchRoadRoute(
        [pharmacy.latitude, pharmacy.longitude],
        [patientLocation.latitude, patientLocation.longitude]
      );

      if (roadRoute.distanceKm > radiusKm) return null;

      return {
        ...pharmacy,
        distanceKm: roadRoute.distanceKm,
        etaMinutes: roadRoute.etaMinutes,
        isOpen: isPharmacyOpen(pharmacy.opensAt, pharmacy.closesAt)
      };
    })
  );

  return results
    .filter((p): p is PharmacyRecord & { distanceKm: number; etaMinutes: number; isOpen: boolean } => Boolean(p))
    // Open first, then by road distance
    .sort((a, b) => {
      if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
      return a.distanceKm - b.distanceKm;
    });
}

export type DrugStockResult = {
  drugId: string;
  drugName: string;
  brandName: string;
  drugType?: string;
  strength?: string;
  indication?: string;
  category?: string;
  requiresRx?: boolean;
  isEmergency?: boolean;
  price: number;
  pharmacyId: string;
  pharmacyName: string;
  pharmacyIsOpen: boolean;
  pharmacyOpensAt?: string;
  pharmacyClosesAt?: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  stock: number;
  inventoryPrice?: number;
  expiryDate?: string;
  batchNumber?: string;
  distanceKm: number;
  etaMinutes: number;
};

export async function searchDrugAvailability(patientLocation: Coordinates, query: string): Promise<DrugStockResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const supabase = getSupabaseClient();

  const { data: drugs, error: drugError } = await supabase
    .from('Drug')
    .select('id, genericName, brandName, category, isEmergency, requiresRx, price, drugType, strength, indication')
    .or(`genericName.ilike.%${trimmed}%,brandName.ilike.%${trimmed}%`)
    .limit(20);

  if (drugError) {
    throw drugError;
  }

  if (!drugs || drugs.length === 0) {
    return [];
  }

  const drugIds = drugs.map((drug) => drug.id);

  // Filter: active, available, has quantity
  const { data: inventoryData, error: inventoryError } = await supabase
    .from('Inventory')
    .select('id, quantity, price, expiryDate, batchNumber, pharmacyId, drugId, isActive, isAvailable')
    .in('drugId', drugIds)
    .eq('isActive', true)
    .eq('isAvailable', true)
    .gt('quantity', 0);

  if (inventoryError) {
    throw inventoryError;
  }

  if (!inventoryData || inventoryData.length === 0) {
    return [];
  }

  // Filter out expired inventory
  const validInventory = inventoryData.filter(item =>
    !isInventoryExpired(item.expiryDate) &&
    Number(item.quantity ?? 0) > 0 &&
    item.isActive === true &&
    item.isAvailable === true
  );

  if (validInventory.length === 0) {
    return [];
  }

  const pharmacyIds = [...new Set(validInventory.map((item) => item.pharmacyId))];
  const { data: pharmacies, error: pharmacyError } = await supabase
    .from('Pharmacy')
    .select('id, name, address, phone, latitude, longitude, opensAt, closesAt')
    .in('id', pharmacyIds);

  if (pharmacyError) {
    throw pharmacyError;
  }

  const pharmacyMap = new Map((pharmacies ?? []).map((pharmacy) => [pharmacy.id, pharmacy]));
  const drugMap = new Map((drugs ?? []).map((drug) => [drug.id, drug]));

  const results = await Promise.all(
    validInventory.map(async (entry) => {
      const drug = drugMap.get(entry.drugId);
      const pharmacy = pharmacyMap.get(entry.pharmacyId);

      if (!drug || !pharmacy || pharmacy.latitude == null || pharmacy.longitude == null) {
        return null;
      }

      // Compute road network distance and ETA via routing engine
      const roadRoute = await fetchRoadRoute(
        [pharmacy.latitude, pharmacy.longitude],
        [patientLocation.latitude, patientLocation.longitude]
      );

      const isOpen = isPharmacyOpen(pharmacy.opensAt, pharmacy.closesAt);

      const numericDrugPrice = Number(drug.price ?? 0);
      const numericInventoryPrice = Number(entry.price ?? 0);
      const effectivePrice = Number.isFinite(numericInventoryPrice) && numericInventoryPrice > 0
        ? numericInventoryPrice
        : (Number.isFinite(numericDrugPrice) && numericDrugPrice > 0 ? numericDrugPrice : 0);

      return {
        drugId: drug.id,
        drugName: drug.genericName,
        brandName: drug.brandName,
        drugType: drug.drugType,
        strength: drug.strength,
        indication: drug.indication,
        category: drug.category,
        requiresRx: drug.requiresRx,
        isEmergency: drug.isEmergency,
        price: effectivePrice,
        pharmacyId: pharmacy.id,
        pharmacyName: pharmacy.name,
        pharmacyIsOpen: isOpen,
        pharmacyOpensAt: pharmacy.opensAt ?? undefined,
        pharmacyClosesAt: pharmacy.closesAt ?? undefined,
        address: pharmacy.address ?? 'Address unavailable',
        phone: pharmacy.phone || 'No phone listed',
        latitude: pharmacy.latitude,
        longitude: pharmacy.longitude,
        stock: Number(entry.quantity ?? 0),
        inventoryPrice: effectivePrice,
        expiryDate: entry.expiryDate,
        batchNumber: entry.batchNumber,
        distanceKm: roadRoute.distanceKm,
        etaMinutes: roadRoute.etaMinutes
      } as DrugStockResult;
    })
  );

  return results
    .filter((item): item is DrugStockResult => Boolean(item))
    // Sort: open pharmacies first → then by shortest road network distance
    .sort((a, b) => {
      if (a.pharmacyIsOpen !== b.pharmacyIsOpen) return a.pharmacyIsOpen ? -1 : 1;
      return a.distanceKm - b.distanceKm;
    });
}

export async function getPrescriptions(): Promise<PrescriptionRecord[]> {
  const supabase = getSupabaseClient();

  const { data: prescriptions, error } = await supabase
    .from('Prescription')
    .select('id, userId, status, filePath, originalFileName, createdAt, drugId, quantity, deliveryRequests:DeliveryRequest(id, status)')
    .order('createdAt', { ascending: false });
  
  if (error) throw error;
  
  if (!prescriptions || prescriptions.length === 0) {
    return [];
  }

  // Fetch related drug data if drugIds exist
  const drugIds = [...new Set((prescriptions as any[]).map(p => p.drugId).filter(Boolean))];
  
  if (drugIds.length === 0) {
    return prescriptions as PrescriptionRecord[];
  }

  const { data: drugs, error: drugError } = await supabase
    .from('Drug')
    .select('id, genericName, brandName, category, drugType, strength, indication')
    .in('id', drugIds);

  if (drugError) throw drugError;

  const drugMap = new Map((drugs ?? []).map(d => [d.id, d]));

  return (prescriptions as any[]).map(p => ({
    ...p,
    drug: p.drugId ? drugMap.get(p.drugId) : undefined
  })) as PrescriptionRecord[];
}

export async function getPrescriptionById(id: string) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.from('Prescription').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function getDeliveries(): Promise<DeliveryRecord[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('DeliveryRequest')
    .select(`
      *,
      prescription:Prescription(
        id,
        userId,
        drugId,
        pharmacyId,
        quantity,
        status
      ),
      gpsLocations:GPSLocation(
        latitude,
        longitude,
        createdAt
      )
    `)
    .order('requestedAt', { ascending: false });
  
  if (error) throw error;
  
  const deliveries = data ?? [];
  
  if (deliveries.length > 0) {
    const drugIds = [...new Set((deliveries as any[]).map(d => d.prescription?.drugId).filter(Boolean))];
    const pharmacyIds = [...new Set((deliveries as any[]).map(d => d.prescription?.pharmacyId).filter(Boolean))];
    
    const [drugsResult, pharmaciesResult, inventoryResult] = await Promise.all([
      drugIds.length > 0
        ? supabase.from('Drug').select('id, genericName, brandName, category, isEmergency, requiresRx, price, drugType, strength, indication').in('id', drugIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      pharmacyIds.length > 0
        ? supabase.from('Pharmacy').select('id, name, address, latitude, longitude, opensAt, closesAt').in('id', pharmacyIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      (pharmacyIds.length > 0 && drugIds.length > 0)
        ? supabase.from('Inventory').select('pharmacyId, drugId, price').in('pharmacyId', pharmacyIds).in('drugId', drugIds)
        : Promise.resolve({ data: [] as any[], error: null })
    ]);

    const drugMap = new Map((drugsResult.data ?? []).map(d => [d.id, d]));
    const pharmacyMap = new Map((pharmaciesResult.data ?? []).map(p => [p.id, p]));
    const inventoryMap = new Map((inventoryResult.data ?? []).map(i => [`${i.pharmacyId}-${i.drugId}`, i]));

    return (deliveries as any[]).map(d => {
      const presc = d.prescription;
      const drug = presc?.drugId ? drugMap.get(presc.drugId) : undefined;
      const pharmacy = presc?.pharmacyId ? pharmacyMap.get(presc.pharmacyId) : undefined;
      const inv = (presc?.pharmacyId && presc?.drugId) ? inventoryMap.get(`${presc.pharmacyId}-${presc.drugId}`) : undefined;

      const effectivePrice = Number(inv?.price ?? drug?.price ?? 0);

      // Use stored delivery distanceKm if available, otherwise a road-factor estimate
      let distanceKm = d.distanceKm ?? 2.5;
      if (!d.distanceKm && pharmacy?.latitude != null && pharmacy?.longitude != null) {
        // Use road-factor Haversine as a sync fallback (async fetchRoadRoute not feasible here)
        const URBAN_ROAD_FACTOR = 1.3;
        distanceKm = Number(
          (calculateDistance(
            { latitude: 5.6037, longitude: -0.1870 }, // Accra baseline
            { latitude: pharmacy.latitude, longitude: pharmacy.longitude }
          ) * URBAN_ROAD_FACTOR).toFixed(1)
        );
      }

      return {
        ...d,
        distanceKm,
        deliveryAddress: d.deliveryAddress ?? pharmacy?.address ?? 'Customer Location',
        prescription: presc ? {
          ...presc,
          pharmacy,
          drug: drug ? {
            ...drug,
            price: effectivePrice
          } : undefined
        } : undefined
      };
    }) as DeliveryRecord[];
  }
  
  return deliveries as DeliveryRecord[];
}

export async function getDeliveryById(id: string) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.from('DeliveryRequest').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function getInventory(pharmacyId?: string) {
  const supabase = getSupabaseClient();

  let query = supabase.from('Inventory').select('id, pharmacyId, drugId, quantity, price, expiryDate, batchNumber, isAvailable, isActive, createdAt, updatedAt');

  if (pharmacyId) {
    query = query.eq('pharmacyId', pharmacyId);
  }

  const { data: inventoryData, error } = await query.order('createdAt', { ascending: false });
  if (error) throw error;

  if (!inventoryData || inventoryData.length === 0) {
    return [];
  }

  const drugIds = [...new Set(inventoryData.map(item => item.drugId))];
  const pharmacyIds = [...new Set(inventoryData.map(item => item.pharmacyId))];

  const [{ data: drugs }, { data: pharmacies }] = await Promise.all([
    supabase.from('Drug').select('id, genericName, brandName, category, isEmergency, drugType, strength, indication').in('id', drugIds),
    supabase.from('Pharmacy').select('id, name, address, latitude, longitude, opensAt, closesAt').in('id', pharmacyIds)
  ]);

  const drugMap = new Map((drugs ?? []).map(d => [d.id, d]));
  const pharmacyMap = new Map((pharmacies ?? []).map(p => [p.id, p]));

  return inventoryData.map(item => ({
    ...item,
    drug: drugMap.get(item.drugId),
    pharmacy: pharmacyMap.get(item.pharmacyId)
  }));
}

export async function getAuditLogs() {
  const supabase = getSupabaseClient();

  const { data: auditData, error: auditError } = await supabase.from('AuditLog').select('*').order('createdAt', { ascending: false }).limit(50);
  if (auditError) throw auditError;
  return auditData ?? [];
}

export type AdminOperationsData = {
  users: {
    total: number;
    patients: number;
    pharmacists: number;
    drivers: number;
    admins: number;
    list: Array<{
      id: string;
      username: string;
      email: string;
      fullName?: string;
      phone?: string;
      role: string;
      createdAt: string;
    }>;
  };
  pharmacies: {
    total: number;
    openNow: number;
    closedNow: number;
    list: PharmacyRecord[];
  };
  drugs: {
    total: number;
    emergencyCount: number;
    rxRequiredCount: number;
    list: DrugRecord[];
  };
  inventory: {
    totalRecords: number;
    totalStockUnits: number;
    lowStockCount: number;
    outOfStockCount: number;
    list: any[];
  };
  deliveries: {
    total: number;
    requested: number;
    inTransit: number;
    delivered: number;
    completed: number;
    list: any[];
  };
  prescriptions: {
    total: number;
    pendingReview: number;
    approved: number;
    rejected: number;
    list: any[];
  };
  auditLogs: any[];
};

export async function getAdminOperationsData(): Promise<AdminOperationsData> {
  const supabase = getSupabaseClient();

  const [
    usersRes,
    pharmaciesRes,
    drugsRes,
    inventoryRes,
    deliveriesRes,
    prescriptionsRes,
    auditLogsRes
  ] = await Promise.allSettled([
    supabase.from('User').select('id, username, email, fullName, phone, role, createdAt').order('createdAt', { ascending: false }).limit(100),
    supabase.from('Pharmacy').select('*').order('name', { ascending: true }),
    supabase.from('Drug').select('*').order('genericName', { ascending: true }),
    supabase.from('Inventory').select('id, pharmacyId, drugId, quantity, price, expiryDate, batchNumber, isAvailable, isActive, createdAt').order('createdAt', { ascending: false }),
    supabase.from('DeliveryRequest').select('id, userId, prescriptionId, pharmacyId, driverId, status, deliveryAddress, phoneNumber, totalCost, deliveryFee, createdAt').order('createdAt', { ascending: false }).limit(50),
    supabase.from('Prescription').select('id, userId, pharmacyId, drugId, status, originalFileName, quantity, createdAt, reviewReason').order('createdAt', { ascending: false }).limit(50),
    supabase.from('AuditLog').select('*').order('createdAt', { ascending: false }).limit(50)
  ]);

  const rawUsers = usersRes.status === 'fulfilled' && usersRes.value.data ? usersRes.value.data : [];
  const rawPharmacies = pharmaciesRes.status === 'fulfilled' && pharmaciesRes.value.data ? pharmaciesRes.value.data : [];
  const rawDrugs = drugsRes.status === 'fulfilled' && drugsRes.value.data ? drugsRes.value.data : [];
  const rawInventory = inventoryRes.status === 'fulfilled' && inventoryRes.value.data ? inventoryRes.value.data : [];
  const rawDeliveries = deliveriesRes.status === 'fulfilled' && deliveriesRes.value.data ? deliveriesRes.value.data : [];
  const rawPrescriptions = prescriptionsRes.status === 'fulfilled' && prescriptionsRes.value.data ? prescriptionsRes.value.data : [];
  const rawAuditLogs = auditLogsRes.status === 'fulfilled' && auditLogsRes.value.data ? auditLogsRes.value.data : [];

  // Users metrics
  const patientsCount = rawUsers.filter(u => u.role === 'USER').length;
  const pharmacistsCount = rawUsers.filter(u => u.role === 'PHARMACIST').length;
  const driversCount = rawUsers.filter(u => u.role === 'DRIVER').length;
  const adminsCount = rawUsers.filter(u => u.role === 'SYSTEM_ADMIN' || u.role === 'PHARMACY_ADMIN').length;

  // Pharmacy open/closed metrics
  let openNowCount = 0;
  let closedNowCount = 0;
  const processedPharmacies = (rawPharmacies as PharmacyRecord[]).map(p => {
    const open = isPharmacyOpen(p.opensAt, p.closesAt);
    if (open) openNowCount++;
    else closedNowCount++;
    return { ...p, isOpen: open };
  });

  // Drugs metrics
  const emergencyDrugsCount = (rawDrugs as DrugRecord[]).filter(d => Boolean(d.isEmergency)).length;
  const rxDrugsCount = (rawDrugs as DrugRecord[]).filter(d => Boolean(d.requiresRx)).length;

  // Inventory metrics & mapping
  const drugMap = new Map((rawDrugs as DrugRecord[]).map(d => [d.id, d]));
  const pharmacyMap = new Map((rawPharmacies as PharmacyRecord[]).map(p => [p.id, p]));

  let totalStockUnits = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  const processedInventory = rawInventory.map(item => {
    const qty = Number(item.quantity ?? 0);
    totalStockUnits += qty;
    if (qty <= 0) outOfStockCount++;
    else if (qty < 10) lowStockCount++;

    return {
      ...item,
      quantity: qty,
      drug: drugMap.get(item.drugId),
      pharmacy: pharmacyMap.get(item.pharmacyId)
    };
  });

  // Delivery metrics
  const requestedCount = rawDeliveries.filter(d => d.status === 'REQUESTED').length;
  const inTransitCount = rawDeliveries.filter(d => d.status === 'IN_TRANSIT').length;
  const deliveredCount = rawDeliveries.filter(d => d.status === 'DELIVERED').length;
  const completedCount = rawDeliveries.filter(d => d.status === 'COMPLETED').length;

  // Prescriptions metrics
  const pendingReviewCount = rawPrescriptions.filter(p => p.status === 'PENDING_REVIEW').length;
  const approvedPrescCount = rawPrescriptions.filter(p => p.status === 'APPROVED').length;
  const rejectedPrescCount = rawPrescriptions.filter(p => p.status === 'REJECTED').length;

  return {
    users: {
      total: rawUsers.length,
      patients: patientsCount,
      pharmacists: pharmacistsCount,
      drivers: driversCount,
      admins: adminsCount,
      list: rawUsers
    },
    pharmacies: {
      total: rawPharmacies.length,
      openNow: openNowCount,
      closedNow: closedNowCount,
      list: processedPharmacies
    },
    drugs: {
      total: rawDrugs.length,
      emergencyCount: emergencyDrugsCount,
      rxRequiredCount: rxDrugsCount,
      list: rawDrugs as DrugRecord[]
    },
    inventory: {
      totalRecords: rawInventory.length,
      totalStockUnits,
      lowStockCount,
      outOfStockCount,
      list: processedInventory
    },
    deliveries: {
      total: rawDeliveries.length,
      requested: requestedCount,
      inTransit: inTransitCount,
      delivered: deliveredCount,
      completed: completedCount,
      list: rawDeliveries
    },
    prescriptions: {
      total: rawPrescriptions.length,
      pendingReview: pendingReviewCount,
      approved: approvedPrescCount,
      rejected: rejectedPrescCount,
      list: rawPrescriptions
    },
    auditLogs: rawAuditLogs
  };
}

