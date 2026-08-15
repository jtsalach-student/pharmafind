import React, { useEffect, useState, useRef } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  Play,
  Truck,
  User,
  Boxes,
  PackageCheck,
  CheckCheck
} from 'lucide-react';
import { getUser } from '../lib/auth';
import { getSupabaseClient } from '../lib/supabase';
import { calculateDeliveryFee, calculateDistance, resolveUserLocation, getDeviceLocation } from '../lib/geolocation';
import { fetchRoadRoute, interpolatePositionAlongRoute, sendDeliveryNotification, type RoadRoute } from '../lib/routing';
import { MapView, type Point } from '../components/MapView';
import { createInAppNotification, notifyUsersWithRole } from '../lib/notifications';

export interface DeliveryItem {
  id: string;
  orderId: string;
  userId: string;
  userName: string;
  phoneNumber: string;
  deliveryAddress: string;
  prescriptionId: string;
  drugName: string;
  drugType?: string;
  strength?: string;
  pharmacyId?: string;
  pharmacyName: string;
  pharmacyAddress?: string;
  pharmacyPhone?: string;
  pharmacyCoords: [number, number];
  userCoords: [number, number];
  distanceKm: number;
  etaMinutes: number;
  medicineCount: number;
  medicineTotal: number;
  deliveryFee: number;
  orderTotal: number;
  createdAt: string;
  status: 'REQUESTED' | 'ASSIGNED' | 'COLLECTED' | 'IN_TRANSIT' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED';
  driverId?: string | null;
}

export interface ActiveDeliveryState {
  id: string;
  orderId: string;
  userId: string;
  userName: string;
  phoneNumber: string;
  deliveryAddress: string;
  drugName: string;
  pharmacyName: string;
  pharmacyAddress: string;
  pharmacyPhone: string;
  pharmacyCoords: [number, number];
  userCoords: [number, number];
  status: 'ASSIGNED' | 'COLLECTED' | 'IN_TRANSIT' | 'DELIVERED' | 'COMPLETED';
  progressPercent: number; // 0 to 100
  driverPosition: [number, number];
  distanceRemainingKm: number;
  etaMinutesRemaining: number;
  deliveryFee: number;
  orderTotal: number;
  currentLeg: 'TO_PHARMACY' | 'TO_USER';
  roadRoute: RoadRoute | null;
}

export const DriverDashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'pending' | 'active' | 'completed' | 'map'>('pending');
  
  const [allDeliveries, setAllDeliveries] = useState<DeliveryItem[]>([]);
  const [activeDelivery, setActiveDelivery] = useState<ActiveDeliveryState | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [previewDelivery, setPreviewDelivery] = useState<DeliveryItem | null>(null);
  
  const [driverCurrentCoords, setDriverCurrentCoords] = useState<[number, number]>([5.6037, -0.1870]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [effectiveDriverId, setEffectiveDriverId] = useState<string>('driver-active-session');

  const simulationIntervalRef = useRef<number | null>(null);
  const notifiedNearDestRef = useRef<boolean>(false);

  // Obtain driver GPS location
  useEffect(() => {
    void getDeviceLocation(6000).then((loc) => {
      if (loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) {
        setDriverCurrentCoords([loc.latitude, loc.longitude]);
      }
    });
  }, []);

  // Main loader: reads real delivery requests directly from database
  const loadDashboardData = async () => {
    try {
      setError(null);
      const client = getSupabaseClient();
      const currentUser = getUser();
      const userId = currentUser?.id;

      // Identify or auto-provision driver profile
      let resolvedDriverId = effectiveDriverId;
      if (userId) {
        const { data: driverRow } = await client
          .from('Driver')
          .select('id')
          .eq('userId', userId)
          .maybeSingle();

        if (driverRow?.id) {
          resolvedDriverId = driverRow.id;
          setEffectiveDriverId(driverRow.id);
        } else {
          const { data: newDriver } = await client
            .from('Driver')
            .insert([{ userId, vehicleType: 'Motorcycle', isAvailable: true }])
            .select('id')
            .maybeSingle();
          if (newDriver?.id) {
            resolvedDriverId = newDriver.id;
            setEffectiveDriverId(newDriver.id);
          }
        }
      }

      // Fetch all DeliveryRequests directly from database
      const { data: deliveryRows, error: reqError } = await client
        .from('DeliveryRequest')
        .select('id, userId, prescriptionId, status, driverId, requestedAt, updatedAt')
        .order('requestedAt', { ascending: false })
        .limit(50);

      if (reqError) {
        throw new Error(`Database query failed: ${reqError.message}`);
      }

      const rows = deliveryRows ?? [];
      const prescIds = [...new Set(rows.map((r) => r.prescriptionId).filter(Boolean))];
      const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))];

      // Fetch Prescriptions, Users, Pharmacies, Drugs, Inventories in parallel
      const [prescRes, userRes, userLoc] = await Promise.all([
        prescIds.length > 0
          ? client.from('Prescription').select('*').in('id', prescIds)
          : Promise.resolve({ data: [] as any[] }),
        userIds.length > 0
          ? client.from('User').select('id, fullName, username, phone').in('id', userIds)
          : Promise.resolve({ data: [] as any[] }),
        resolveUserLocation()
      ]);

      const prescriptions = prescRes.data ?? [];
      const users = userRes.data ?? [];
      const resolvedUserCoords: [number, number] = [userLoc.latitude, userLoc.longitude];

      const pharmacyIds = [...new Set(prescriptions.map((p) => p.pharmacyId).filter(Boolean))];
      const drugIds = [...new Set(prescriptions.map((p) => p.drugId).filter(Boolean))];

      const [pharmRes, drugRes, invRes] = await Promise.all([
        pharmacyIds.length > 0
          ? client.from('Pharmacy').select('id, name, address, latitude, longitude, phone').in('id', pharmacyIds)
          : Promise.resolve({ data: [] as any[] }),
        drugIds.length > 0
          ? client.from('Drug').select('id, genericName, brandName, price, drugType, strength, indication').in('id', drugIds)
          : Promise.resolve({ data: [] as any[] }),
        (pharmacyIds.length > 0 && drugIds.length > 0)
          ? client.from('Inventory').select('pharmacyId, drugId, price').in('pharmacyId', pharmacyIds).in('drugId', drugIds)
          : Promise.resolve({ data: [] as any[] })
      ]);

      const userMap = new Map(users.map((u) => [u.id, u]));
      const prescMap = new Map(prescriptions.map((p) => [p.id, p]));
      const pharmMap = new Map((pharmRes.data ?? []).map((p) => [p.id, p]));
      const drugMap = new Map((drugRes.data ?? []).map((d) => [d.id, d]));
      const invMap = new Map((invRes.data ?? []).map((i) => [`${i.pharmacyId}-${i.drugId}`, i]));

      const formattedDeliveries: DeliveryItem[] = rows.map((row) => {
        const presc = prescMap.get(row.prescriptionId);
        const user = userMap.get(row.userId);
        const pharm = presc?.pharmacyId ? pharmMap.get(presc.pharmacyId) : undefined;
        const drug = presc?.drugId ? drugMap.get(presc.drugId) : undefined;
        const inv = (presc?.pharmacyId && presc?.drugId) ? invMap.get(`${presc.pharmacyId}-${presc.drugId}`) : undefined;

        const unitPrice = Number(inv?.price ?? drug?.price ?? 0);
        const count = Number(presc?.quantity ?? 1);
        const medTotal = unitPrice * count;

        const pharmCoords: [number, number] = (pharm?.latitude != null && pharm?.longitude != null)
          ? [pharm.latitude, pharm.longitude]
          : [5.6037, -0.1870];

        const dist = Number(calculateDistance(
          { latitude: pharmCoords[0], longitude: pharmCoords[1] },
          { latitude: resolvedUserCoords[0], longitude: resolvedUserCoords[1] }
        ).toFixed(1));

        const fee = calculateDeliveryFee(dist);

        return {
          id: row.id,
          orderId: `ORD-${row.id.slice(0, 8).toUpperCase()}`,
          userId: row.userId,
          userName: user?.fullName || user?.username || 'Customer',
          phoneNumber: user?.phone || '024 000 0000',
          deliveryAddress: pharm?.address ? `Near ${pharm.address}, Accra` : 'Legon, Accra',
          prescriptionId: row.prescriptionId,
          drugName: drug ? `${drug.genericName}${drug.brandName ? ` (${drug.brandName})` : ''}` : 'Prescription Medication',
          drugType: drug?.drugType,
          strength: drug?.strength,
          pharmacyId: pharm?.id,
          pharmacyName: pharm?.name ?? 'PharmaFind Pharmacy',
          pharmacyAddress: pharm?.address ?? 'Accra Central',
          pharmacyPhone: pharm?.phone ?? '024 111 2222',
          pharmacyCoords: pharmCoords,
          userCoords: resolvedUserCoords,
          distanceKm: dist,
          etaMinutes: Math.max(5, Math.round(dist * 3.5)),
          medicineCount: count,
          medicineTotal: medTotal,
          deliveryFee: fee,
          orderTotal: Number((medTotal + fee).toFixed(2)),
          createdAt: row.requestedAt || new Date().toISOString(),
          status: row.status as any,
          driverId: row.driverId
        };
      });

      setAllDeliveries(formattedDeliveries);

      // Check active delivery for this driver
      const activeItem = formattedDeliveries.find(
        (d) => ['ASSIGNED', 'COLLECTED', 'IN_TRANSIT', 'DELIVERED'].includes(d.status) &&
               (d.driverId === resolvedDriverId || d.driverId === userId || (activeDelivery && d.id === activeDelivery.id))
      ) || formattedDeliveries.find(
        (d) => ['ASSIGNED', 'COLLECTED', 'IN_TRANSIT'].includes(d.status)
      );

      if (activeItem) {
        const isHeadingToPharmacy = activeItem.status === 'ASSIGNED';
        const startPoint: [number, number] = isHeadingToPharmacy ? driverCurrentCoords : activeItem.pharmacyCoords;
        const endPoint: [number, number] = isHeadingToPharmacy ? activeItem.pharmacyCoords : activeItem.userCoords;

        fetchRoadRoute(startPoint, endPoint).then((roadRoute) => {
          setActiveDelivery((prev) => {
            if (prev && prev.id === activeItem.id && (prev.status === 'DELIVERED' || prev.status === activeItem.status)) {
              return prev; // keep current state, especially DELIVERED
            }
            const isDelivered = activeItem.status === 'DELIVERED' || prev?.status === 'DELIVERED';
            return {
              id: activeItem.id,
              orderId: activeItem.orderId,
              userId: activeItem.userId,
              userName: activeItem.userName,
              phoneNumber: activeItem.phoneNumber,
              deliveryAddress: activeItem.deliveryAddress,
              drugName: activeItem.drugName,
              pharmacyName: activeItem.pharmacyName,
              pharmacyAddress: activeItem.pharmacyAddress ?? 'Accra',
              pharmacyPhone: activeItem.pharmacyPhone ?? '024 111 2222',
              pharmacyCoords: activeItem.pharmacyCoords,
              userCoords: activeItem.userCoords,
              status: isDelivered ? 'DELIVERED' : (activeItem.status as any),
              progressPercent: isDelivered ? 100 : (activeItem.status === 'IN_TRANSIT' ? 25 : 5),
              driverPosition: isDelivered ? activeItem.userCoords : (isHeadingToPharmacy ? driverCurrentCoords : activeItem.pharmacyCoords),
              distanceRemainingKm: isDelivered ? 0 : roadRoute.distanceKm,
              etaMinutesRemaining: isDelivered ? 0 : roadRoute.etaMinutes,
              deliveryFee: activeItem.deliveryFee,
              orderTotal: activeItem.orderTotal,
              currentLeg: isHeadingToPharmacy ? 'TO_PHARMACY' : 'TO_USER',
              roadRoute
            };
          });
        });
      } else {
        setActiveDelivery(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load delivery requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboardData();

    // Subscribe to realtime updates on DeliveryRequest table
    const client = getSupabaseClient();
    const channel = client.channel('driver-dashboard-live-realtime');
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'DeliveryRequest' }, () => {
      void loadDashboardData();
    });
    void channel.subscribe();

    const pollInterval = setInterval(() => {
      void loadDashboardData();
    }, 3500);

    return () => {
      clearInterval(pollInterval);
      client.removeChannel(channel);
    };
  }, [dismissedIds, effectiveDriverId]);

  // Real-time simulated driver movement along road coordinates (when in transit)
  useEffect(() => {
    if (!activeDelivery || activeDelivery.status !== 'IN_TRANSIT' || !activeDelivery.roadRoute) {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
      return;
    }

    const coordinates = activeDelivery.roadRoute.coordinates;
    const totalDistance = activeDelivery.roadRoute.distanceKm;

    simulationIntervalRef.current = window.setInterval(() => {
      setActiveDelivery((prev) => {
        if (!prev || prev.status !== 'IN_TRANSIT') return prev;

        const nextProgress = Math.min(100, prev.progressPercent + 2.5);
        const fraction = nextProgress / 100;
        const { position } = interpolatePositionAlongRoute(coordinates, fraction);

        const distRemaining = Number((totalDistance * (1 - fraction)).toFixed(1));
        const etaRemaining = Math.max(1, Math.round(distRemaining * 3.2));

        // When nearing destination (>80%), notify customer
        if (nextProgress >= 80 && !notifiedNearDestRef.current) {
          notifiedNearDestRef.current = true;
          void sendDeliveryNotification(
            prev.userId,
            `Driver Near Destination: Your rider is approaching your delivery address (~2 minutes away)!`,
            'DRIVER_NEAR_DESTINATION'
          );
        }

        // Auto-transition to DELIVERED when progress reaches 100%
        if (nextProgress >= 100) {
          void handleMarkDelivered(prev.id);
        }

        return {
          ...prev,
          progressPercent: nextProgress,
          driverPosition: position,
          distanceRemainingKm: distRemaining,
          etaMinutesRemaining: etaRemaining
        };
      });
    }, 2000);

    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }
    };
  }, [activeDelivery?.status, activeDelivery?.roadRoute]);

  // Step 1: Accept Request -> Driver heads to Pharmacy to pick up medicine
  const handleAccept = async (delivery: DeliveryItem) => {
    try {
      setActionLoading(true);
      setError(null);
      notifiedNearDestRef.current = false;
      const client = getSupabaseClient();

      const updatePayload: Record<string, any> = {
        status: 'ASSIGNED',
        updatedAt: new Date().toISOString()
      };
      if (effectiveDriverId && !effectiveDriverId.startsWith('driver-active')) {
        updatePayload.driverId = effectiveDriverId;
      }

      const { error: updateError } = await client
        .from('DeliveryRequest')
        .update(updatePayload)
        .eq('id', delivery.id);

      if (updateError) {
        console.warn('Accept delivery database notice:', updateError.message);
      }

      // Notify customer that driver was assigned and is heading to the pharmacy
      await sendDeliveryNotification(
        delivery.userId,
        `Driver Assigned: Courier has accepted order #${delivery.orderId} and is navigating to ${delivery.pharmacyName} for collection.`,
        'DRIVER_ASSIGNED'
      );

      // Notify driver session
      const userSession = getUser();
      if (userSession?.id) {
        void createInAppNotification(
          userSession.id,
          `Delivery Assignment Active: You accepted Order #${delivery.orderId}. Navigate to ${delivery.pharmacyName} for pickup.`,
          'DRIVER_ASSIGNED'
        );
      }

      setSuccessNotice(`Order #${delivery.orderId} accepted! Navigation to pharmacy active.`);
      setActiveTab('map');
      await loadDashboardData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to accept delivery.');
    } finally {
      setActionLoading(false);
    }
  };

  // Step 2: Driver Arrived at Pharmacy -> Collect Medicine & Mark Collected
  const handleMarkCollected = async (deliveryId: string) => {
    try {
      setActionLoading(true);
      setError(null);
      const client = getSupabaseClient();

      const { error: updateErr } = await client
        .from('DeliveryRequest')
        .update({
          status: 'COLLECTED',
          collectedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .eq('id', deliveryId);

      if (updateErr) {
        console.warn('Mark collected database notice:', updateErr.message);
      }

      if (activeDelivery) {
        await sendDeliveryNotification(
          activeDelivery.userId,
          `Driver Collected Medicine: Rider has collected your medication package from ${activeDelivery.pharmacyName}. Ready for departure!`,
          'DRIVER_COLLECTED_MEDICINE'
        );
      }

      setSuccessNotice('Medication collected! Ready to start delivery to customer.');
      await loadDashboardData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm medicine collection.');
    } finally {
      setActionLoading(false);
    }
  };

  // Step 3: Start Delivery -> Transitions to IN_TRANSIT, routes Pharmacy -> User
  const handleStartDelivery = async (deliveryId: string) => {
    try {
      setActionLoading(true);
      setError(null);
      const client = getSupabaseClient();

      const { error: updateErr } = await client
        .from('DeliveryRequest')
        .update({
          status: 'IN_TRANSIT',
          updatedAt: new Date().toISOString()
        })
        .eq('id', deliveryId);

      if (updateErr) {
        console.warn('Start delivery database notice:', updateErr.message);
      }

      if (activeDelivery) {
        await sendDeliveryNotification(
          activeDelivery.userId,
          `Delivery Started: Rider has departed ${activeDelivery.pharmacyName} and is en route to your delivery address.`,
          'DELIVERY_STARTED'
        );
      }

      setSuccessNotice('Delivery started! Live road navigation to customer active.');
      setActiveTab('map');
      await loadDashboardData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start delivery.');
    } finally {
      setActionLoading(false);
    }
  };

  // Step 4: Mark Delivered
  const handleMarkDelivered = async (deliveryId: string) => {
    try {
      setActionLoading(true);
      setError(null);
      const client = getSupabaseClient();

      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
        simulationIntervalRef.current = null;
      }

      const { error: updateErr } = await client
        .from('DeliveryRequest')
        .update({
          status: 'DELIVERED',
          deliveredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
        .eq('id', deliveryId);

      if (updateErr) {
        console.warn('Mark delivered database notice:', updateErr.message);
      }

      setActiveDelivery((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          status: 'DELIVERED',
          progressPercent: 100,
          driverPosition: prev.userCoords,
          distanceRemainingKm: 0,
          etaMinutesRemaining: 0
        };
      });

      if (activeDelivery) {
        await sendDeliveryNotification(
          activeDelivery.userId,
          `Delivered: Your rider has arrived at your address with your package for order #${activeDelivery.orderId}.`,
          'DELIVERED'
        );
      }

      setSuccessNotice('Order marked as Delivered! Please click Complete & Close Order.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as delivered.');
    } finally {
      setActionLoading(false);
    }
  };

  // Step 5: Complete & Close Order
  const handleCompleteOrder = async (deliveryId: string) => {
    try {
      setActionLoading(true);
      setError(null);
      const client = getSupabaseClient();

      const { error: updateErr } = await client
        .from('DeliveryRequest')
        .update({
          status: 'COMPLETED',
          updatedAt: new Date().toISOString()
        })
        .eq('id', deliveryId);

      if (updateErr) {
        console.warn('Complete order database notice:', updateErr.message);
      }

      if (activeDelivery) {
        await sendDeliveryNotification(
          activeDelivery.userId,
          `Order Completed: Delivery confirmed and completed. Thank you for using PharmaFind!`,
          'ORDER_COMPLETED'
        );

        // Notify pharmacists and admins
        void notifyUsersWithRole(
          'PHARMACIST',
          `Order Completed: Order #${activeDelivery.orderId} (${activeDelivery.drugName}) was delivered and closed.`,
          'ORDER_COMPLETED'
        );

        void notifyUsersWithRole(
          'SYSTEM_ADMIN',
          `Order Completed: Order #${activeDelivery.orderId} delivered to ${activeDelivery.userName}.`,
          'ORDER_COMPLETED'
        );
      }

      setActiveDelivery(null);
      setSuccessNotice('Order successfully completed and archived.');
      setActiveTab('completed');
      await loadDashboardData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete order.');
    } finally {
      setActionLoading(false);
    }
  };

  const pendingRequests = allDeliveries.filter((d) => ['REQUESTED', 'ASSIGNED'].includes(d.status) && !dismissedIds.has(d.id));
  const completedHistory = allDeliveries.filter((d) => ['DELIVERED', 'COMPLETED'].includes(d.status));

  // Dynamic Map Points
  const mapPoints: Point[] = activeDelivery
    ? (activeDelivery.currentLeg === 'TO_PHARMACY'
        ? [
            { lat: activeDelivery.driverPosition[0], lng: activeDelivery.driverPosition[1], label: 'Your Current Position', type: 'driver' },
            { lat: activeDelivery.pharmacyCoords[0], lng: activeDelivery.pharmacyCoords[1], label: `${activeDelivery.pharmacyName} (Pickup)`, type: 'pharmacy' }
          ]
        : [
            { lat: activeDelivery.pharmacyCoords[0], lng: activeDelivery.pharmacyCoords[1], label: `${activeDelivery.pharmacyName} (Origin)`, type: 'pharmacy' },
            { lat: activeDelivery.userCoords[0], lng: activeDelivery.userCoords[1], label: `${activeDelivery.userName} (Destination)`, type: 'user' }
          ])
    : previewDelivery
    ? [
        { lat: previewDelivery.pharmacyCoords[0], lng: previewDelivery.pharmacyCoords[1], label: previewDelivery.pharmacyName, type: 'pharmacy' },
        { lat: previewDelivery.userCoords[0], lng: previewDelivery.userCoords[1], label: previewDelivery.userName, type: 'user' }
      ]
    : [
        { lat: driverCurrentCoords[0], lng: driverCurrentCoords[1], label: 'Your Location', type: 'driver' }
      ];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Header Banner */}
      <section className="rounded-[30px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Rider Portal</div>
            <h1 className="mt-2 flex items-center gap-3 text-3xl font-black tracking-tight text-slate-900">
              <Truck className="h-8 w-8 text-amber-500" />
              Delivery Driver Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Pharmacy pickup, road-network navigation, and customer delivery handoff.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              Rider Online
            </span>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700">
              GPS: {driverCurrentCoords[0].toFixed(4)}, {driverCurrentCoords[1].toFixed(4)}
            </div>
          </div>
        </div>

        {/* Status notice */}
        {successNotice && (
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-emerald-50 p-3.5 text-xs font-bold text-emerald-800 border border-emerald-200">
            <span>✓ {successNotice}</span>
            <button type="button" onClick={() => setSuccessNotice(null)} className="text-emerald-600 hover:text-emerald-900">
              ✕
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-red-50 p-3.5 text-xs font-bold text-red-800 border border-red-200">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* Tabs Switcher */}
      <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
            activeTab === 'pending' ? 'bg-amber-500 text-white shadow-md shadow-amber-200' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Clock className="h-4 w-4" />
          Pickup Requests ({pendingRequests.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
            activeTab === 'active' ? 'bg-sky-600 text-white shadow-md shadow-sky-200' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Truck className="h-4 w-4" />
          Active Mission {activeDelivery ? '(1 Active)' : '(0)'}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('map')}
          className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
            activeTab === 'map' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Navigation className="h-4 w-4" />
          Live Road Navigation
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
            activeTab === 'completed' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <CheckCircle className="h-4 w-4" />
          Delivered History ({completedHistory.length})
        </button>
      </div>

      {/* ACTIVE MISSION HERO (Visible whenever there is an active delivery) */}
      {activeDelivery && (
        <section className="mt-6 rounded-[30px] border-2 border-sky-400 bg-gradient-to-br from-sky-50 via-white to-indigo-50 p-6 shadow-lg shadow-sky-100">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-sky-100 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-sky-500 animate-ping" />
                <span className="text-xs font-bold uppercase tracking-wider text-sky-700">Active Delivery Workflow</span>
              </div>
              <h2 className="mt-1 text-2xl font-black text-slate-900">{activeDelivery.orderId}</h2>
              <p className="text-xs font-semibold text-slate-600">{activeDelivery.drugName}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-wider ${
                activeDelivery.status === 'ASSIGNED'
                  ? 'bg-amber-100 text-amber-800'
                  : activeDelivery.status === 'COLLECTED'
                  ? 'bg-teal-100 text-teal-800'
                  : activeDelivery.status === 'IN_TRANSIT'
                  ? 'bg-sky-100 text-sky-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}>
                {activeDelivery.status === 'ASSIGNED'
                  ? '🛵 1. Navigating to Pharmacy'
                  : activeDelivery.status === 'COLLECTED'
                  ? '📦 2. Medicine Collected'
                  : activeDelivery.status === 'IN_TRANSIT'
                  ? '🚀 3. In Transit to Customer'
                  : '✓ 4. Delivered to Destination'}
              </span>

              <span className="rounded-full bg-white px-3.5 py-1.5 text-xs font-black text-emerald-700 shadow-sm border border-slate-200">
                Fee: GH₵ {activeDelivery.deliveryFee.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Workflow Steps Indicator */}
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className={`rounded-2xl p-3 text-center border ${
              activeDelivery.status === 'ASSIGNED' ? 'border-amber-400 bg-amber-50 shadow-sm' : 'border-slate-200 bg-white opacity-60'
            }`}>
              <p className="text-[10px] font-bold uppercase text-amber-800">Step 1</p>
              <p className="text-xs font-black text-slate-900">Pickup at Pharmacy</p>
            </div>

            <div className={`rounded-2xl p-3 text-center border ${
              activeDelivery.status === 'COLLECTED' ? 'border-teal-400 bg-teal-50 shadow-sm' : 'border-slate-200 bg-white opacity-60'
            }`}>
              <p className="text-[10px] font-bold uppercase text-teal-800">Step 2</p>
              <p className="text-xs font-black text-slate-900">Package Collected</p>
            </div>

            <div className={`rounded-2xl p-3 text-center border ${
              activeDelivery.status === 'IN_TRANSIT' ? 'border-sky-400 bg-sky-50 shadow-sm' : 'border-slate-200 bg-white opacity-60'
            }`}>
              <p className="text-[10px] font-bold uppercase text-sky-800">Step 3</p>
              <p className="text-xs font-black text-slate-900">In Transit to User</p>
            </div>

            <div className={`rounded-2xl p-3 text-center border ${
              activeDelivery.status === 'DELIVERED' ? 'border-emerald-400 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-white opacity-60'
            }`}>
              <p className="text-[10px] font-bold uppercase text-emerald-800">Step 4</p>
              <p className="text-xs font-black text-slate-900">Handoff & Complete</p>
            </div>
          </div>

          {/* Info & Action Controls */}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {/* Pharmacy details */}
            <div className="rounded-2xl bg-white p-4 border border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pickup Location</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Pharmacy</span>
              </div>
              <p className="font-black text-slate-900 text-sm">{activeDelivery.pharmacyName}</p>
              <p className="text-xs text-slate-600 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                {activeDelivery.pharmacyAddress}
              </p>
              <p className="text-xs text-slate-600 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-slate-400" />
                <a href={`tel:${activeDelivery.pharmacyPhone}`} className="text-blue-600 font-semibold hover:underline">
                  {activeDelivery.pharmacyPhone}
                </a>
              </p>
            </div>

            {/* Customer details */}
            <div className="rounded-2xl bg-white p-4 border border-slate-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Destination</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Customer</span>
              </div>
              <p className="font-black text-slate-900 text-sm">{activeDelivery.userName}</p>
              <p className="text-xs text-slate-600 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                {activeDelivery.deliveryAddress}
              </p>
              <p className="text-xs text-slate-600 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-slate-400" />
                <a href={`tel:${activeDelivery.phoneNumber}`} className="text-blue-600 font-semibold hover:underline">
                  {activeDelivery.phoneNumber}
                </a>
              </p>
            </div>
          </div>

          {/* Action Trigger Buttons */}
          <div className="mt-6 flex flex-wrap gap-3">
            {activeDelivery.status === 'ASSIGNED' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleMarkCollected(activeDelivery.id)}
                className="primary-button flex-1 bg-amber-600 hover:bg-amber-700 font-black py-3"
              >
                <PackageCheck className="mr-2 h-5 w-5" />
                {actionLoading ? 'Updating...' : '✓ Arrived at Pharmacy & Collect Medicine'}
              </button>
            )}

            {activeDelivery.status === 'COLLECTED' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleStartDelivery(activeDelivery.id)}
                className="primary-button flex-1 bg-teal-600 hover:bg-teal-700 font-black py-3"
              >
                <Play className="mr-2 h-5 w-5" />
                {actionLoading ? 'Starting...' : '🚀 Start Delivery to Customer'}
              </button>
            )}

            {activeDelivery.status === 'IN_TRANSIT' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleMarkDelivered(activeDelivery.id)}
                className="primary-button flex-1 bg-sky-600 hover:bg-sky-700 font-black py-3"
              >
                <CheckCircle className="mr-2 h-5 w-5" />
                {actionLoading ? 'Marking...' : '✓ Mark Delivered to Customer'}
              </button>
            )}

            {activeDelivery.status === 'DELIVERED' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleCompleteOrder(activeDelivery.id)}
                className="primary-button flex-1 bg-emerald-600 hover:bg-emerald-700 font-black py-3"
              >
                <CheckCheck className="mr-2 h-5 w-5" />
                {actionLoading ? 'Closing...' : '✓ Complete & Close Order'}
              </button>
            )}
          </div>
        </section>
      )}

      {/* TAB 1: PENDING PICKUP REQUESTS */}
      {activeTab === 'pending' && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-slate-900">Available Delivery Orders</h2>
            <span className="text-xs font-bold text-slate-500">{pendingRequests.length} orders waiting</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center rounded-[28px] border border-slate-200 bg-slate-50 p-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : pendingRequests.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
              <Boxes className="mx-auto h-8 w-8 text-slate-400 mb-2" />
              <p className="font-bold text-slate-700">No pending delivery requests.</p>
              <p className="mt-1 text-xs text-slate-500">New customer orders will appear here automatically.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pendingRequests.map((delivery) => (
                <div
                  key={delivery.id}
                  className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm space-y-4 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Order</span>
                      <h3 className="text-lg font-black text-slate-900">{delivery.orderId}</h3>
                      <p className="text-xs font-semibold text-slate-500">{delivery.pharmacyName}</p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                      GH₵ {delivery.deliveryFee.toFixed(2)} Fee
                    </span>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-3 space-y-1">
                    <p className="text-xs font-bold text-slate-900">{delivery.drugName}</p>
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>Distance: {delivery.distanceKm.toFixed(1)} km</span>
                      <span className="font-bold text-sky-700">~{delivery.etaMinutes} mins</span>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-slate-600">
                    <p className="flex items-center gap-1.5 font-medium">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      {delivery.userName}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      {delivery.deliveryAddress}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex gap-2">
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleAccept(delivery)}
                      className="primary-button flex-1 bg-amber-600 hover:bg-amber-700 text-xs py-2.5 font-black"
                    >
                      Accept & Navigate
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewDelivery(delivery);
                        setActiveTab('map');
                      }}
                      className="secondary-button text-xs py-2.5"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setDismissedIds((prev) => new Set([...prev, delivery.id]))}
                      className="secondary-button text-xs py-2.5 text-slate-400 hover:text-slate-700"
                      title="Dismiss request"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2 & TAB 3: LIVE ROAD MAP NAVIGATION */}
      {(activeTab === 'map' || activeTab === 'active') && (
        <div className="mt-6 space-y-6">
          <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  {activeDelivery
                    ? (activeDelivery.currentLeg === 'TO_PHARMACY'
                        ? 'Navigation Leg 1: Driver → Pharmacy (Pickup)'
                        : 'Navigation Leg 2: Pharmacy → Customer (Delivery)')
                    : previewDelivery
                    ? `Route Preview: ${previewDelivery.pharmacyName} → ${previewDelivery.userName}`
                    : 'Driver Patrol Map'}
                </h2>
                <p className="text-xs text-slate-500">Live street network routing and turn-by-turn simulation</p>
              </div>

              {activeDelivery && (
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-black text-sky-800 animate-pulse">
                    {activeDelivery.distanceRemainingKm} km remaining
                  </span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                    ~{activeDelivery.etaMinutesRemaining} min ETA
                  </span>
                </div>
              )}
            </div>

            {/* Map Component */}
            <MapView
              points={mapPoints}
              center={activeDelivery ? activeDelivery.driverPosition : driverCurrentCoords}
              driverPosition={activeDelivery ? activeDelivery.driverPosition : driverCurrentCoords}
              showRoute={true}
              className="h-96 w-full rounded-2xl border"
            />
          </div>
        </div>
      )}

      {/* TAB 4: COMPLETED DELIVERIES HISTORY */}
      {activeTab === 'completed' && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-slate-900">Completed Deliveries</h2>
            <span className="text-xs font-bold text-slate-500">{completedHistory.length} orders finished</span>
          </div>

          {completedHistory.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
              <CheckCircle className="mx-auto h-8 w-8 text-slate-400 mb-2" />
              <p className="font-bold text-slate-700">No completed orders yet.</p>
              <p className="mt-1 text-xs text-slate-500">Completed deliveries will be catalogued here.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {completedHistory.map((order) => (
                <div
                  key={order.id}
                  className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Completed</span>
                      <h3 className="text-lg font-black text-slate-900">{order.orderId}</h3>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                      ✓ Done
                    </span>
                  </div>

                  <p className="text-xs font-bold text-slate-800">{order.drugName}</p>
                  <p className="text-xs text-slate-500">Customer: {order.userName}</p>
                  <p className="text-xs text-slate-500">Pharmacy: {order.pharmacyName}</p>
                  <p className="text-xs font-bold text-emerald-700 border-t border-slate-100 pt-2">
                    Earned Delivery Fee: GH₵ {order.deliveryFee.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
};

export default DriverDashboardPage;
