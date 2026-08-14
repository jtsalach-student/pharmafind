import React, { useState, useEffect } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { Phone, AlertCircle, CheckCircle, Truck, Info } from 'lucide-react';

interface DriverLocation {
  latitude: number;
  longitude: number;
}

interface Notification {
  id: string;
  message: string;
  timestamp: Date;
  type: 'info' | 'success' | 'warning';
}

interface Delivery {
  id: string;
  orderId: string;
  drug: string;
  quantity: number;
  pharmacy: string;
  deliveryAddress: string;
  phoneNumber: string;
  amount: number;
  deliveryFee: number;
  total: number;
  driverName: string;
  driverPhone: string;
  vehicleType: string;
  status: 'REQUESTED' | 'ASSIGNED' | 'COLLECTED' | 'IN_TRANSIT' | 'DELIVERED';
}

type DeliveryStage = 'REQUESTED' | 'ASSIGNED' | 'COLLECTED' | 'IN_TRANSIT' | 'DELIVERED';

const PHARMACY_LOCATION: DriverLocation = { latitude: 5.6501, longitude: -0.1869 };
const DELIVERY_LOCATION: DriverLocation = { latitude: 5.6450, longitude: -0.1850 };

const STAGE_DURATIONS: Record<DeliveryStage, number> = {
  REQUESTED: 10,
  ASSIGNED: 15,
  COLLECTED: 15,
  IN_TRANSIT: 30,
  DELIVERED: 0
};

const statusOrder: DeliveryStage[] = ['REQUESTED', 'ASSIGNED', 'COLLECTED', 'IN_TRANSIT', 'DELIVERED'];

export const MockDeliveryTrackingPage: React.FC = () => {
  const { deliveryId } = useParams<{ deliveryId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [stageStartTime, setStageStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [eta, setEta] = useState(12);
  const [distance, setDistance] = useState(4.6);
  const [isDelivered, setIsDelivered] = useState(false);

  // Initialize delivery
  useEffect(() => {
    const initDelivery: Delivery = location.state?.delivery || {
      id: deliveryId || 'DL-001',
      orderId: 'ORD-001',
      drug: 'Paracetamol 500mg',
      quantity: 2,
      pharmacy: 'City Pharmacy, Accra',
      deliveryAddress: '123 Main Street, Accra',
      phoneNumber: '+233 50 123 4567',
      amount: 25.00,
      deliveryFee: 5.00,
      total: 30.00,
      driverName: 'Kwame Asante',
      driverPhone: '+233 55 987 6543',
      vehicleType: 'Motorcycle',
      status: 'REQUESTED'
    };

    setDelivery(initDelivery);
    setStageStartTime(Date.now());
    addNotification('Your delivery request has been created', 'info');
  }, [deliveryId, location]);

  // Status progression effect
  useEffect(() => {
    if (!delivery || !stageStartTime) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.floor((now - stageStartTime) / 1000);
      setElapsedSeconds(elapsed);

      const currentStageIndex = statusOrder.indexOf(delivery.status);
      if (currentStageIndex === -1) return;

      const currentStageDuration = STAGE_DURATIONS[delivery.status];

      if (elapsed >= currentStageDuration && currentStageIndex < statusOrder.length - 1) {
        const nextStatus = statusOrder[currentStageIndex + 1];
        setDelivery(prev => ({ ...prev, status: nextStatus }));
        setStageStartTime(now);

        // Add notifications for each stage
        const messages: Record<DeliveryStage, string> = {
          REQUESTED: 'Your delivery request has been created',
          ASSIGNED: 'A driver has accepted your delivery request',
          COLLECTED: 'Driver has collected your medication',
          IN_TRANSIT: 'Driver is on the way to you',
          DELIVERED: 'Driver has arrived at your location'
        };

        addNotification(messages[nextStatus], nextStatus === 'DELIVERED' ? 'success' : 'success');

        // Update ETA and distance
        const stageNum = statusOrder.indexOf(nextStatus);
        setEta(Math.max(0, 12 - stageNum * 3));
        setDistance(Math.max(0, 4.6 - stageNum * 0.8));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [delivery, stageStartTime]);

  // Track when delivered
  useEffect(() => {
    if (delivery?.status === 'DELIVERED' && !isDelivered) {
      setIsDelivered(true);
      addNotification('Delivery completed! Please confirm receipt.', 'success');
    }
  }, [delivery?.status, isDelivered]);

  const addNotification = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const notification: Notification = {
      id: Date.now().toString(),
      message,
      timestamp: new Date(),
      type
    };
    setNotifications(prev => [notification, ...prev].slice(0, 5));
  };

  const handleConfirmReceipt = () => {
    addNotification('Delivery confirmed! Thank you.', 'success');
    setTimeout(() => {
      navigate('/dashboard');
    }, 2000);
  };

  if (!delivery) return null;

  const stageIndex = statusOrder.indexOf(delivery.status);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{delivery.orderId}</h1>
            <p className="text-sm text-slate-600">
              Driven by <span className="font-semibold">{delivery.driverName}</span>
            </p>
          </div>
          <div className="text-right">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold gap-2 ${
                delivery.status === 'DELIVERED'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-blue-100 text-blue-700'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
              {delivery.status}
            </span>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-slate-50 px-4 py-3 flex gap-6 text-sm border-t border-slate-200 overflow-x-auto">
          <div>
            <p className="text-slate-600 text-xs">ETA</p>
            <p className="font-semibold text-slate-900">{eta} min</p>
          </div>
          <div>
            <p className="text-slate-600 text-xs">DISTANCE</p>
            <p className="font-semibold text-slate-900">{distance.toFixed(1)} km</p>
          </div>
          <div>
            <p className="text-slate-600 text-xs">ELAPSED</p>
            <p className="font-semibold text-slate-900">{Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4">
            {/* Map Section */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 h-96">
              <svg viewBox="0 0 400 300" className="w-full h-full bg-gradient-to-br from-blue-50 to-slate-100 rounded">
                {/* Map background */}
                <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                    <polygon points="0 0, 10 3, 0 6" fill="#3b82f6" />
                  </marker>
                </defs>

                {/* Route line */}
                <line
                  x1="50"
                  y1="50"
                  x2="350"
                  y2="250"
                  stroke="#93c5fd"
                  strokeWidth="3"
                  strokeDasharray="5,5"
                  markerEnd="url(#arrowhead)"
                />

                {/* Pharmacy marker */}
                <circle cx="50" cy="50" r="8" fill="#3b82f6" />
                <circle cx="50" cy="50" r="12" fill="#93c5fd" opacity="0.3" />
                <text x="50" y="30" textAnchor="middle" className="text-xs font-semibold fill-slate-700">
                  🏥 Pharmacy
                </text>

                {/* Destination marker */}
                <circle cx="350" cy="250" r="8" fill="#22c55e" />
                <circle cx="350" cy="250" r="12" fill="#86efac" opacity="0.3" />
                <text x="350" y="270" textAnchor="middle" className="text-xs font-semibold fill-slate-700">
                  📍 You
                </text>

                {/* Driver marker */}
                <g>
                  <circle
                    cx={(50 + (350 - 50) * (Math.min(1, elapsedSeconds / 100) * 0.7))}
                    cy={(50 + (250 - 50) * (Math.min(1, elapsedSeconds / 100) * 0.7))}
                    r="8"
                    fill="#f59e0b"
                  />
                  <circle
                    cx={(50 + (350 - 50) * (Math.min(1, elapsedSeconds / 100) * 0.7))}
                    cy={(50 + (250 - 50) * (Math.min(1, elapsedSeconds / 100) * 0.7))}
                    r="12"
                    fill="#fbbf24"
                    opacity="0.3"
                  />
                  <text
                    x={(50 + (350 - 50) * (Math.min(1, elapsedSeconds / 100) * 0.7))}
                    y={(50 + (250 - 50) * (Math.min(1, elapsedSeconds / 100) * 0.7)) - 15}
                    textAnchor="middle"
                    className="text-sm font-semibold fill-slate-700"
                  >
                    🚚 Driver
                  </text>
                </g>

                {/* Coordinates display */}
                <text x="10" y="285" className="text-xs fill-slate-600" fontFamily="monospace">
                  Pharmacy: {PHARMACY_LOCATION.latitude.toFixed(4)}, {PHARMACY_LOCATION.longitude.toFixed(4)}
                </text>
                <text x="10" y="298" className="text-xs fill-slate-600" fontFamily="monospace">
                  Your Location: {DELIVERY_LOCATION.latitude.toFixed(4)}, {DELIVERY_LOCATION.longitude.toFixed(4)}
                </text>
              </svg>
            </div>

            {/* Timeline Section */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900 mb-4">Delivery Progress</p>
              <div className="space-y-2">
                {statusOrder.map((stage, index) => (
                  <div key={stage} className="flex items-center gap-3">
                    <div
                      className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold flex-shrink-0 ${
                        index <= stageIndex
                          ? 'bg-green-500 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {index <= stageIndex ? '✓' : index + 1}
                    </div>
                    <span
                      className={`text-sm ${
                        index === stageIndex
                          ? 'font-semibold text-slate-900'
                          : index < stageIndex
                          ? 'text-slate-600'
                          : 'text-slate-500'
                      }`}
                    >
                      {stage === 'REQUESTED' && 'Request Created'}
                      {stage === 'ASSIGNED' && 'Driver Assigned'}
                      {stage === 'COLLECTED' && 'Medication Collected'}
                      {stage === 'IN_TRANSIT' && 'In Transit'}
                      {stage === 'DELIVERED' && 'Delivered'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Driver Info */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-600 uppercase mb-3">Driver Details</p>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-slate-600">Name</p>
                  <p className="font-semibold text-slate-900">{delivery.driverName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-slate-600" />
                  <a href={`tel:${delivery.driverPhone}`} className="text-sm text-blue-600 hover:underline">
                    {delivery.driverPhone}
                  </a>
                </div>
                <div>
                  <p className="text-sm text-slate-600">Vehicle</p>
                  <p className="font-semibold text-slate-900 flex items-center gap-2">
                    <Truck className="w-4 h-4" /> {delivery.vehicleType}
                  </p>
                </div>
              </div>
            </div>

            {/* Notifications */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-600 uppercase mb-3">Updates</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-500">No updates yet</p>
                ) : (
                  notifications.map(notif => (
                    <div
                      key={notif.id}
                      className={`text-xs p-2 rounded flex gap-2 ${
                        notif.type === 'success'
                          ? 'bg-green-50 text-green-700'
                          : notif.type === 'warning'
                          ? 'bg-yellow-50 text-yellow-700'
                          : 'bg-blue-50 text-blue-700'
                      }`}
                    >
                      <span className="flex-shrink-0 mt-0.5">
                        {notif.type === 'success' && <CheckCircle className="w-3 h-3" />}
                        {notif.type === 'warning' && <AlertCircle className="w-3 h-3" />}
                        {notif.type === 'info' && <Info className="w-3 h-3" />}
                      </span>
                      <span>{notif.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Order Summary */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-600 uppercase mb-3">Order Summary</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Drug</span>
                  <span className="font-semibold text-slate-900">{delivery.drug}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Quantity</span>
                  <span className="font-semibold text-slate-900">{delivery.quantity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Pharmacy</span>
                  <span className="font-semibold text-slate-900 text-right">{delivery.pharmacy}</span>
                </div>
                <div className="border-t border-slate-200 pt-2 mt-2">
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-600">Subtotal</span>
                    <span className="font-semibold text-slate-900">GH₵ {delivery.amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-slate-600">Delivery Fee</span>
                    <span className="font-semibold text-slate-900">GH₵ {delivery.deliveryFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between bg-blue-50 p-2 rounded">
                    <span className="font-semibold text-slate-900">Total</span>
                    <span className="font-bold text-blue-600">GH₵ {delivery.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery Address */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-600 uppercase mb-2">Delivery Address</p>
              <p className="text-sm text-slate-900">{delivery.deliveryAddress}</p>
              <p className="text-sm text-slate-600 mt-2">{delivery.phoneNumber}</p>
            </div>

            {/* Confirmation Button */}
            {isDelivered && (
              <button
                onClick={handleConfirmReceipt}
                className="w-full bg-green-600 text-white rounded-lg py-3 font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                Confirm Receipt
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
