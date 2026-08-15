import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { emergencyScore } from '../utils/emergency.js';
import { roadDistanceKm } from '../utils/geo.js';
import { isOpenNow } from '../utils/time.js';

const emergencyList = [
  'Salbutamol Inhaler',
  'EpiPen',
  'Adrenaline Injection',
  'Insulin',
  'Glucagon',
  'ORS',
  'Hydrocortisone Injection',
  'Nitroglycerin Tablets'
];

const router = Router();

const searchSchema = z.object({
  q: z.string().min(1),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  openNow: z.coerce.boolean().optional()
});

router.get('/search', async (req, res, next) => {
  try {
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid query', requestId: req.requestId } });
      return;
    }

    const { q, lat, lng, openNow } = parsed.data;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const inventory = await prisma.inventory.findMany({
      where: {
        isActive: true,
        isAvailable: true,
        quantity: { gt: 0 },
        OR: [
          { expiryDate: null },
          { expiryDate: { gte: today } }
        ],
        drug: {
          OR: [
            { genericName: { contains: q, mode: 'insensitive' } },
            { brandName: { contains: q, mode: 'insensitive' } },
            { category: { contains: q, mode: 'insensitive' } }
          ]
        }
      },
      include: { pharmacy: true, drug: true }
    });

    const results = inventory
      .map((item) => {
        const distanceKm = lat !== undefined && lng !== undefined
          ? roadDistanceKm(lat, lng, item.pharmacy.latitude, item.pharmacy.longitude)
          : null;
        const open = isOpenNow(item.pharmacy.opensAt, item.pharmacy.closesAt);

        return {
          pharmacyId: item.pharmacy.id,
          pharmacyName: item.pharmacy.name,
          address: item.pharmacy.address,
          phone: item.pharmacy.phone,
          latitude: item.pharmacy.latitude,
          longitude: item.pharmacy.longitude,
          stockQuantity: item.quantity,
          inventoryPrice: item.quantity ? item.price || item.drug.price : item.drug.price,
          expiryDate: item.expiryDate,
          batchNumber: item.batchNumber,
          openingStatus: open,
          distanceKm,
          drug: {
            id: item.drug.id,
            genericName: item.drug.genericName,
            brandName: item.drug.brandName,
            category: item.drug.category,
            drugType: item.drug.drugType,
            strength: item.drug.strength,
            indication: item.drug.indication,
            price: item.drug.price,
            requiresRx: item.drug.requiresRx,
            isEmergency: item.drug.isEmergency
          }
        };
      })
      .filter((item) => (openNow ? item.openingStatus : true))
      // Open pharmacies first, then by shortest road-network distance
      .sort((a, b) => {
        if (a.openingStatus !== b.openingStatus) return a.openingStatus ? -1 : 1;
        return (a.distanceKm ?? Number.MAX_VALUE) - (b.distanceKm ?? Number.MAX_VALUE);
      });

    res.json({ results });
  } catch (error) {
    next(error);
  }
});

router.get('/emergency/search', async (req, res, next) => {
  try {
    const parsed = z.object({ lat: z.coerce.number(), lng: z.coerce.number() }).safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'lat and lng are required', requestId: req.requestId } });
      return;
    }

    const today2 = new Date();
    today2.setHours(0, 0, 0, 0);

    const inventory = await prisma.inventory.findMany({
      where: {
        isActive: true,
        isAvailable: true,
        quantity: { gt: 0 },
        OR: [
          { expiryDate: null },
          { expiryDate: { gte: today2 } }
        ],
        drug: {
          OR: [
            { isEmergency: true },
            ...emergencyList.map((name) => ({ brandName: { contains: name, mode: 'insensitive' as const } }))
          ]
        }
      },
      include: { pharmacy: true, drug: true }
    });

    const results = inventory
      .map((item) => {
        const distanceKm = roadDistanceKm(parsed.data.lat, parsed.data.lng, item.pharmacy.latitude, item.pharmacy.longitude);
        const open = isOpenNow(item.pharmacy.opensAt, item.pharmacy.closesAt);
        return {
          pharmacyId: item.pharmacy.id,
          pharmacyName: item.pharmacy.name,
          drugName: item.drug.brandName || item.drug.genericName,
          drugType: item.drug.drugType,
          strength: item.drug.strength,
          indication: item.drug.indication,
          stockQuantity: item.quantity,
          inventoryPrice: item.price || item.drug.price,
          expiryDate: item.expiryDate,
          batchNumber: item.batchNumber,
          distanceKm,
          openingStatus: open,
          emergencyScore: emergencyScore(item.quantity, open, distanceKm)
        };
      })
      // Open pharmacies first, then by emergency score, then road distance
      .sort((a, b) => {
        if (a.openingStatus !== b.openingStatus) return a.openingStatus ? -1 : 1;
        if (b.emergencyScore !== a.emergencyScore) return b.emergencyScore - a.emergencyScore;
        if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
        return b.stockQuantity - a.stockQuantity;
      });

    res.json({
      disclaimer:
        'PharmaFind provides medicine availability information and is not a replacement for emergency medical services or clinical advice.',
      results
    });
  } catch (error) {
    next(error);
  }
});

export default router;
