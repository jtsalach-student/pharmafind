import React, { createContext, useContext, useState, useEffect } from 'react';
import type { CartItem, Cart } from '../lib/cart';
import { calculateCartTotals, createCartItemId } from '../lib/cart';

type CartContextType = {
  cart: Cart;
  addToCart: (item: CartItem) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  isInCart: (drugId: string, pharmacyId: string) => boolean;
  getCartItem: (itemId: string) => CartItem | undefined;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = 'pharmafind_cart';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  // Load cart from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as CartItem[];
        setItems(parsed);
      }
    } catch (error) {
      console.error('Failed to load cart from localStorage:', error);
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error('Failed to save cart to localStorage:', error);
    }
  }, [items]);

  const cart = calculateCartTotals(items);

  const addToCart = (item: CartItem) => {
    setItems(prevItems => {
      const itemId = createCartItemId(item.drugId, item.pharmacyId, item.batchNumber);
      const existingIndex = prevItems.findIndex(i => 
        createCartItemId(i.drugId, i.pharmacyId, i.batchNumber) === itemId
      );

      if (existingIndex >= 0) {
        // Item already in cart, update quantity
        const updated = [...prevItems];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: Math.min(
            updated[existingIndex].quantity + item.quantity,
            item.availableQuantity
          ),
          subtotal: Number((
            Math.min(
              updated[existingIndex].quantity + item.quantity,
              item.availableQuantity
            ) * item.unitPrice
          ).toFixed(2))
        };
        return updated;
      } else {
        // New item
        return [
          ...prevItems,
          {
            ...item,
            id: itemId,
            subtotal: Number((item.quantity * item.unitPrice).toFixed(2))
          }
        ];
      }
    });
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    setItems(prevItems =>
      prevItems.map(item => {
        const currentId = createCartItemId(item.drugId, item.pharmacyId, item.batchNumber);
        if (currentId === itemId) {
          const newQuantity = Math.max(1, Math.min(quantity, item.availableQuantity));
          return {
            ...item,
            quantity: newQuantity,
            subtotal: Number((newQuantity * item.unitPrice).toFixed(2))
          };
        }
        return item;
      })
    );
  };

  const removeFromCart = (itemId: string) => {
    setItems(prevItems =>
      prevItems.filter(item => 
        createCartItemId(item.drugId, item.pharmacyId, item.batchNumber) !== itemId
      )
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const isInCart = (drugId: string, pharmacyId: string): boolean => {
    return items.some(item => item.drugId === drugId && item.pharmacyId === pharmacyId);
  };

  const getCartItem = (itemId: string): CartItem | undefined => {
    return items.find(item =>
      createCartItemId(item.drugId, item.pharmacyId, item.batchNumber) === itemId
    );
  };

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        isInCart,
        getCartItem
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
