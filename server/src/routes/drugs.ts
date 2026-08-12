import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { emergencyScore } from '../utils/emergency.js';
import { haversineDistanceKm } from '../utils/geo.js';
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

    const inventory = await prisma.inventory.findMany({
      where: {
        isActive: true,
        isAvailable: true,
        quantity: { gt: 0 },
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
          ? haversineDistanceKm(lat, lng, item.pharmacy.latitude, item.pharmacy.longitude)
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
          openingStatus: open,
          distanceKm,
          drug: {
            id: item.drug.id,
            genericName: item.drug.genericName,
            brandName: item.drug.brandName,
            category: item.drug.category
          }
        };
      })
      .filter((item) => (openNow ? item.openingStatus : true))
      .sort((a, b) => (a.distanceKm ?? Number.MAX_VALUE) - (b.distanceKm ?? Number.MAX_VALUE));

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

    const inventory = await prisma.inventory.findMany({
      where: {
        isActive: true,
        isAvailable: true,
        quantity: { gt: 0 },
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
        const distanceKm = haversineDistanceKm(parsed.data.lat, parsed.data.lng, item.pharmacy.latitude, item.pharmacy.longitude);
        const open = isOpenNow(item.pharmacy.opensAt, item.pharmacy.closesAt);
        return {
          pharmacyId: item.pharmacy.id,
          pharmacyName: item.pharmacy.name,
          drugName: item.drug.brandName || item.drug.genericName,
          stockQuantity: item.quantity,
          distanceKm,
          openingStatus: open,
          emergencyScore: emergencyScore(item.quantity, open, distanceKm)
        };
      })
      .sort((a, b) => {
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
