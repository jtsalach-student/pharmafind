import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import authRoutes from './routes/auth.js';
import drugRoutes from './routes/drugs.js';
import pharmacyRoutes from './routes/pharmacies.js';
import prescriptionRoutes from './routes/prescriptions.js';
import adminRoutes from './routes/admin.js';
import inventoryRoutes from './routes/inventory.js';
import deliveryRoutes from './routes/deliveries.js';
import driverRoutes from './routes/drivers.js';
import paymentRoutes from './routes/payments.js';
import notificationRoutes from './routes/notifications.js';
import auditRoutes from './routes/audit.js';
import { errorHandler, notFound } from './middleware/error.js';
import { attachRequestId } from './middleware/request-id.js';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
app.use(attachRequestId);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/drugs', drugRoutes);
app.use('/api/pharmacies', pharmacyRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit-logs', auditRoutes);

app.use(notFound);
app.use(errorHandler);
