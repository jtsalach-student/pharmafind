import { getSupabaseClient, type AppRole } from './supabase';
import { calculateDistance, estimateDeliveryTime, type Coordinates } from './geolocation';

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
};

export type PrescriptionRecord = {
  id: string;
  userId: string;
  status: string;
  filePath?: string;
  originalFileName?: string;
  createdAt: string;
};

export type DeliveryRecord = {
  id: string;
  userId: string;
  prescriptionId: string;
  status: string;
  latitude?: number;
  longitude?: number;
  createdAt: string;
  requestedAt?: string;
  updatedAt?: string;
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
          { label: 'Patients', value: String(patientCount ?? 0), detail: 'Registered' },
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

export async function getNearbyPharmacies(patientLocation: Coordinates, radiusKm: number = 10): Promise<(PharmacyRecord & { distanceKm: number; etaMinutes: number })[]> {
  const pharmacies = await getPharmacies();

  return pharmacies
    .map((pharmacy) => {
      if (!pharmacy.latitude || !pharmacy.longitude) return null;

      const distance = calculateDistance(
        { latitude: patientLocation.latitude, longitude: patientLocation.longitude },
        { latitude: pharmacy.latitude, longitude: pharmacy.longitude }
      );

      if (distance > radiusKm) return null;

      return {
        ...pharmacy,
        distanceKm: parseFloat(distance.toFixed(2)),
        etaMinutes: estimateDeliveryTime(distance)
      };
    })
    .filter((p) => p !== null)
    .sort((a, b) => (a?.distanceKm ?? 0) - (b?.distanceKm ?? 0));
}

export type DrugStockResult = {
  drugId: string;
  drugName: string;
  brandName: string;
  price: number;
  pharmacyId: string;
  pharmacyName: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  stock: number;
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
    .select('id, genericName, brandName, category, isEmergency, requiresRx, price')
    .or(`genericName.ilike.%${trimmed}%,brandName.ilike.%${trimmed}%`)
    .limit(20);

  if (drugError) {
    throw drugError;
  }

  if (!drugs || drugs.length === 0) {
    return [];
  }

  const drugIds = drugs.map((drug) => drug.id);

  const { data: inventoryData, error: inventoryError } = await supabase
    .from('Inventory')
    .select('id, quantity, pharmacyId, drugId')
    .in('drugId', drugIds)
    .gt('quantity', 0);

  if (inventoryError) {
    throw inventoryError;
  }

  if (!inventoryData || inventoryData.length === 0) {
    return [];
  }

  const pharmacyIds = [...new Set(inventoryData.map((item) => item.pharmacyId))];
  const { data: pharmacies, error: pharmacyError } = await supabase
    .from('Pharmacy')
    .select('id, name, address, phone, latitude, longitude')
    .in('id', pharmacyIds);

  if (pharmacyError) {
    throw pharmacyError;
  }

  const pharmacyMap = new Map((pharmacies ?? []).map((pharmacy) => [pharmacy.id, pharmacy]));
  const drugMap = new Map((drugs ?? []).map((drug) => [drug.id, drug]));

  return inventoryData
    .map((entry) => {
      const drug = drugMap.get(entry.drugId);
      const pharmacy = pharmacyMap.get(entry.pharmacyId);

      if (!drug || !pharmacy || pharmacy.latitude == null || pharmacy.longitude == null) {
        return null;
      }

      const distanceKm = calculateDistance(patientLocation, {
        latitude: pharmacy.latitude,
        longitude: pharmacy.longitude
      });

      return {
        drugId: drug.id,
        drugName: drug.genericName,
        brandName: drug.brandName,
        price: Number(drug.price ?? 0),
        pharmacyId: pharmacy.id,
        pharmacyName: pharmacy.name,
        address: pharmacy.address ?? 'Address unavailable',
        phone: pharmacy.phone || 'No phone listed',
        latitude: pharmacy.latitude,
        longitude: pharmacy.longitude,
        stock: Number(entry.quantity ?? 0),
        distanceKm: Number(distanceKm.toFixed(1)),
        etaMinutes: estimateDeliveryTime(distanceKm)
      } satisfies DrugStockResult;
    })
    .filter((item): item is DrugStockResult => Boolean(item))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export async function getPrescriptions(): Promise<PrescriptionRecord[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.from('Prescription').select('*').order('createdAt', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPrescriptionById(id: string) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.from('Prescription').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function getDeliveries(): Promise<DeliveryRecord[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.from('DeliveryRequest').select('*').order('requestedAt', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getDeliveryById(id: string) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.from('DeliveryRequest').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function getInventory(pharmacyId?: string) {
  const supabase = getSupabaseClient();

  // Query inventory items with their IDs for related records
  let query = supabase.from('Inventory').select('id, pharmacyId, drugId, quantity, isAvailable, isActive, createdAt, updatedAt');

  if (pharmacyId) {
    query = query.eq('pharmacyId', pharmacyId);
  }

  const { data: inventoryData, error } = await query.order('createdAt', { ascending: false });
  if (error) throw error;

  if (!inventoryData || inventoryData.length === 0) {
    return [];
  }

  // Fetch related drug and pharmacy data separately
  const drugIds = [...new Set(inventoryData.map(item => item.drugId))];
  const pharmacyIds = [...new Set(inventoryData.map(item => item.pharmacyId))];

  const [{ data: drugs }, { data: pharmacies }] = await Promise.all([
    supabase.from('Drug').select('id, genericName, brandName, category, isEmergency').in('id', drugIds),
    supabase.from('Pharmacy').select('id, name, address, latitude, longitude').in('id', pharmacyIds)
  ]);

  // Manually join the data
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
