import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { createWorker } from 'tesseract.js';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { saveFileLocally } from '../storage/index.js';
import { writeAudit } from '../utils/audit.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const allowedMimes = ['image/jpeg', 'image/png', 'application/pdf'];
const allowedExt = ['.jpg', '.jpeg', '.png', '.pdf'];

router.post('/', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: { message: 'file is required', requestId: req.requestId } });
      return;
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (!allowedMimes.includes(req.file.mimetype) || !allowedExt.includes(ext)) {
      res.status(400).json({ error: { message: 'Invalid file type', requestId: req.requestId } });
      return;
    }

    const fileName = `${randomUUID()}-${req.file.originalname}`;
    const filePath = await saveFileLocally(fileName, req.file.buffer);

    let ocrText = '';
    let confidence = 0;

    if (req.file.mimetype.startsWith('image/')) {
      const worker = await createWorker('eng');
      const result = await worker.recognize(req.file.buffer);
      ocrText = result.data.text;
      confidence = result.data.confidence;
      await worker.terminate();
    }

    const prescription = await prisma.prescription.create({
      data: {
        userId: req.user!.id,
        filePath,
        originalFileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        status: 'PENDING_REVIEW',
        ocrText,
        ocrConfidence: confidence
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      action: 'PRESCRIPTION_UPLOADED',
      targetEntity: 'Prescription',
      targetId: prescription.id,
      outcome: 'SUCCESS'
    });

    res.status(201).json({ prescription, message: 'OCR output requires pharmacist review' });
  } catch (error) {
    next(error);
  }
});

router.get('/my', requireAuth, async (req, res, next) => {
  try {
    const prescriptions = await prisma.prescription.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' } });
    res.json({ items: prescriptions });
  } catch (error) {
    next(error);
  }
});

router.get('/pending', requireAuth, requireRoles(Role.PHARMACIST), async (req, res, next) => {
  try {
    const pharmacist = await prisma.pharmacist.findUnique({ where: { userId: req.user!.id } });
    if (!pharmacist) {
      res.status(403).json({ error: { message: 'Pharmacist profile missing', requestId: req.requestId } });
      return;
    }

    const items = await prisma.prescription.findMany({
      where: { status: 'PENDING_REVIEW', pharmacyId: pharmacist.pharmacyId },
      include: { user: { select: { username: true } } }
    });
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

const reviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'CLARIFICATION_REQUESTED']),
  reason: z.string().min(3)
});

router.patch('/:id/review', requireAuth, requireRoles(Role.PHARMACIST), async (req, res, next) => {
  try {
    const prescriptionId = String(req.params.id);
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid review payload', requestId: req.requestId } });
      return;
    }

    const pharmacist = await prisma.pharmacist.findUnique({ where: { userId: req.user!.id } });
    if (!pharmacist) {
      res.status(403).json({ error: { message: 'Pharmacist profile missing', requestId: req.requestId } });
      return;
    }

    const prescription = await prisma.prescription.findUnique({ where: { id: prescriptionId } });
    if (!prescription || prescription.pharmacyId !== pharmacist.pharmacyId) {
      res.status(404).json({ error: { message: 'Prescription not found', requestId: req.requestId } });
      return;
    }

    const updated = await prisma.prescription.update({
      where: { id: prescriptionId },
      data: {
        status: parsed.data.decision,
        reviewReason: parsed.data.reason,
        reviewedById: req.user!.id,
        reviewedAt: new Date()
      }
    });

    await writeAudit({
      actorId: req.user!.id,
      action: 'PRESCRIPTION_REVIEWED',
      targetEntity: 'Prescription',
      targetId: updated.id,
      outcome: 'SUCCESS',
      metadata: { decision: parsed.data.decision }
    });

    res.json({ prescription: updated });
  } catch (error) {
    next(error);
  }
});

export default router;
