import { AnimatePresence, motion } from 'framer-motion';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Nav } from './components/Nav';
import { ProtectedRoute, RoleProtectedRoute } from './components/ProtectedRoute';
import { CartProvider } from './contexts/CartContext';
import { getToken } from './lib/auth';
import { AdminAuditPage } from './pages/AdminAuditPage';
import { CheckEmailPage } from './pages/CheckEmailPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { DashboardPage } from './pages/DashboardPage';
import { PaymentPage } from './pages/PaymentPage';
import { DeliveryTrackingPage } from './pages/DeliveryTrackingPage';
import { MockDeliveryTrackingPage } from './pages/MockDeliveryTrackingPage';
import DriverDashboardPage from './pages/DriverDashboardPage';
import { EmergencyPage } from './pages/EmergencyPage';
import { EnvDebugPage } from './pages/EnvDebugPage';
import { GenericPage } from './pages/GenericPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { InventoryPage } from './pages/InventoryPage';
import { LoginPage } from './pages/LoginPage';
import { PharmacistReviewPage } from './pages/PharmacistReviewPage';
import { PharmacyDetailsPage } from './pages/PharmacyDetailsPage';
import { PrescriptionUploadPage } from './pages/PrescriptionUploadPage';
import { RegisterPage } from './pages/RegisterPage';
import { RoutePage } from './pages/RoutePage';
import { SearchPage } from './pages/SearchPage';

function AppRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <Routes location={location}>
          <Route path="/" element={<Navigate to={getToken() ? '/dashboard' : '/login'} replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/check-email" element={<CheckEmailPage />} />

          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
          <Route path="/checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
          <Route path="/emergency" element={<EmergencyPage />} />
          <Route path="/pharmacy/:pharmacyId" element={<PharmacyDetailsPage />} />
          <Route path="/route/:pharmacyId" element={<RoutePage />} />
          <Route path="/prescriptions/upload" element={<ProtectedRoute><PrescriptionUploadPage /></ProtectedRoute>} />
          <Route path="/payment" element={<ProtectedRoute><PaymentPage /></ProtectedRoute>} />
          <Route path="/prescriptions/history" element={<ProtectedRoute><GenericPage title="User prescription history" /></ProtectedRoute>} />
          <Route path="/deliveries/request" element={<ProtectedRoute><GenericPage title="Delivery request" /></ProtectedRoute>} />
          <Route path="/deliveries/track" element={<ProtectedRoute><DeliveryTrackingPage /></ProtectedRoute>} />
          <Route path="/mock-delivery/:deliveryId" element={<ProtectedRoute><MockDeliveryTrackingPage /></ProtectedRoute>} />
          <Route path="/delivery/:deliveryId" element={<ProtectedRoute><MockDeliveryTrackingPage /></ProtectedRoute>} />
          <Route path="/driver-dashboard" element={<RoleProtectedRoute allowedRoles={['DRIVER', 'SYSTEM_ADMIN']}><DriverDashboardPage /></RoleProtectedRoute>} />
          <Route path="/driver-tracking/:deliveryId" element={<RoleProtectedRoute allowedRoles={['DRIVER', 'SYSTEM_ADMIN']}><MockDeliveryTrackingPage /></RoleProtectedRoute>} />
          <Route path="/debug/env" element={<EnvDebugPage />} />
          <Route path="/payments" element={<ProtectedRoute><GenericPage title="Payment" /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
          <Route path="/admin" element={<RoleProtectedRoute allowedRoles={['SYSTEM_ADMIN']}><AdminAuditPage /></RoleProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />
          <Route path="/pharmacist" element={<RoleProtectedRoute allowedRoles={['PHARMACIST', 'SYSTEM_ADMIN']}><PharmacistReviewPage /></RoleProtectedRoute>} />
          <Route path="/driver" element={<RoleProtectedRoute allowedRoles={['DRIVER', 'SYSTEM_ADMIN']}><DriverDashboardPage /></RoleProtectedRoute>} />
          <Route path="/system" element={<RoleProtectedRoute allowedRoles={['SYSTEM_ADMIN']}><AdminAuditPage /></RoleProtectedRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  const hasSession = Boolean(getToken());

  return (
    <CartProvider>
      <>
        {hasSession && <Nav />}
        <AppRoutes />
      </>
    </CartProvider>
  );
}

export default App;
