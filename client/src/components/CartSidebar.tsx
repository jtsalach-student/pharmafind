import { Minus, Plus, Trash2, X, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { createCartItemId } from '../lib/cart';

type CartSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function CartSidebar({ isOpen, onClose }: CartSidebarProps) {
  const navigate = useNavigate();
  const { cart, updateQuantity, removeFromCart, clearCart } = useCart();
  const { items } = cart;

  const handleCheckout = () => {
    if (items.length === 0) return;
    onClose();
    navigate('/checkout', { state: { cartItems: items } });
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-md transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } bg-white shadow-xl`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-sky-600" />
            <h2 className="text-lg font-bold text-slate-900">Shopping Cart</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-slate-100 transition"
            aria-label="Close cart"
          >
            <X className="h-5 w-5 text-slate-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
              <ShoppingCart className="mb-4 h-12 w-12 text-slate-300" />
              <p className="text-center text-slate-600">Your cart is empty</p>
              <p className="mt-1 text-center text-sm text-slate-500">
                Add medicines to get started
              </p>
            </div>
          ) : (
            <>
              {/* Items List */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="space-y-4">
                  {items.map((item) => {
                    const itemId = createCartItemId(item.drugId, item.pharmacyId, item.batchNumber);
                    return (
                      <div
                        key={itemId}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="mb-2 flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-slate-900">{item.drugName}</h3>
                            <p className="text-xs text-slate-600">{item.brandName}</p>
                            {(item.drugType || item.strength) && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {item.drugType && (
                                  <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                    {item.drugType}
                                  </span>
                                )}
                                {item.strength && (
                                  <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
                                    {item.strength}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFromCart(itemId)}
                            className="text-red-600 hover:text-red-700 transition"
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Pharmacy Info */}
                        <div className="mb-3 text-xs text-slate-600">
                          <p className="font-medium text-slate-900">{item.pharmacyName}</p>
                          <p>{item.address}</p>
                          <p className="text-slate-500">{item.distanceKm.toFixed(1)} km away</p>
                        </div>

                        {/* Quantity Control */}
                        <div className="mb-3 flex items-center gap-2 rounded bg-white p-2">
                          <button
                            type="button"
                            onClick={() => updateQuantity(itemId, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                            className="rounded p-1 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 transition"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3.5 w-3.5 text-slate-600" />
                          </button>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val) && val >= 1) {
                                updateQuantity(itemId, val);
                              }
                            }}
                            min="1"
                            max={item.availableQuantity}
                            className="w-12 flex-1 border-0 bg-transparent text-center text-sm font-semibold text-slate-900"
                          />
                          <button
                            type="button"
                            onClick={() => updateQuantity(itemId, item.quantity + 1)}
                            disabled={item.quantity >= item.availableQuantity}
                            className="rounded p-1 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 transition"
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3.5 w-3.5 text-slate-600" />
                          </button>
                          <span className="text-xs text-slate-500 ml-2">/ {item.availableQuantity}</span>
                        </div>

                        {/* Pricing */}
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between text-slate-700">
                            <span>Unit Price:</span>
                            <span className="font-semibold">GH₵ {item.unitPrice.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-slate-900">
                            <span className="font-semibold">Subtotal:</span>
                            <span className="font-bold">GH₵ {item.subtotal.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 space-y-3">
                <div className="space-y-2 border-b border-slate-200 pb-3">
                  <div className="flex justify-between text-slate-700">
                    <span>Medication Total:</span>
                    <span className="font-semibold">GH₵ {cart.medicationTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>Delivery Fee:</span>
                    <span className="font-semibold">GH₵ {cart.deliveryFee.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex justify-between text-lg">
                  <span className="font-bold text-slate-900">Total:</span>
                  <span className="font-bold text-emerald-700">GH₵ {cart.totalCost.toFixed(2)}</span>
                </div>

                <button
                  type="button"
                  onClick={handleCheckout}
                  className="primary-button w-full"
                >
                  Checkout ({items.length} item{items.length !== 1 ? 's' : ''})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearCart();
                    onClose();
                  }}
                  className="secondary-button w-full"
                >
                  Clear Cart
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
