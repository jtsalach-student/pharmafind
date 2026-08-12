import { Navigate, Route, Routes } from 'react-router-dom';
import { Nav } from './components/Nav';
import { EmergencyPage } from './pages/EmergencyPage';
import { GenericPage } from './pages/GenericPage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { PrescriptionUploadPage } from './pages/PrescriptionUploadPage';
import { RegisterPage } from './pages/RegisterPage';
import { SearchPage } from './pages/SearchPage';

function App() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/emergency" element={<EmergencyPage />} />
        <Route path="/prescriptions/upload" element={<PrescriptionUploadPage />} />
        <Route path="/prescriptions/history" element={<GenericPage title="User prescription history" />} />
        <Route path="/deliveries/request" element={<GenericPage title="Delivery request" />} />
        <Route path="/deliveries/track" element={<GenericPage title="Delivery tracking" />} />
        <Route path="/payments" element={<GenericPage title="Payment" />} />
        <Route path="/notifications" element={<GenericPage title="User notifications" />} />
        <Route path="/admin/dashboard" element={<GenericPage title="Pharmacy admin dashboard" />} />
        <Route path="/inventory" element={<GenericPage title="Inventory management" />} />
        <Route path="/pharmacist/review" element={<GenericPage title="Pharmacist prescription review" />} />
        <Route path="/driver/deliveries" element={<GenericPage title="Driver deliveries and GPS updates" />} />
        <Route path="/system/audit-logs" element={<GenericPage title="System admin audit logs" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
