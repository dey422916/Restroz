import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { CustomerCart, CustomerCartItem, Product, Coupon } from '../types';

interface CartConflictModalState {
  isOpen: boolean;
  currentRestName: string;
  newRestName: string;
  pendingRestaurant: { id: string; name: string; logo_url?: string } | null;
  pendingProduct: Product | null;
  pendingQuantity: number;
}

interface CustomerCartContextType {
  cart: CustomerCart;
  itemCount: number;
  conflictModal: CartConflictModalState;
  addToCart: (
    restaurant: { id: string; name: string; logo_url?: string },
    product: Product,
    quantity?: number
  ) => void;
  updateQuantity: (productId: string, newQty: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  applyCoupon: (code: string, discountAmount?: number, couponObj?: Coupon | null) => void;
  removeCoupon: () => void;
  resolveConflict: (action: 'clear_and_continue' | 'cancel') => void;
}

const initialCart: CustomerCart = {
  restaurantId: null,
  restaurantName: null,
  restaurantLogo: null,
  items: [],
  subtotal: 0,
  taxTotal: 0,
  deliveryFee: 0,
  discount: 0,
  couponCode: undefined,
  payableAmount: 0,
};

const CustomerCartContext = createContext<CustomerCartContextType | undefined>(undefined);

export const CustomerCartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [restaurantLogo, setRestaurantLogo] = useState<string | null>(null);
  const [items, setItems] = useState<CustomerCartItem[]>([]);
  const [couponCode, setCouponCode] = useState<string | undefined>(undefined);
  const [couponDiscount, setCouponDiscount] = useState<number>(0);
  const [appliedCouponObj, setAppliedCouponObj] = useState<Coupon | null>(null);

  const [conflictModal, setConflictModal] = useState<CartConflictModalState>({
    isOpen: false,
    currentRestName: '',
    newRestName: '',
    pendingRestaurant: null,
    pendingProduct: null,
    pendingQuantity: 1,
  });

  const { subtotal, taxTotal, deliveryFee, discount, payableAmount, itemCount } = useMemo(() => {
    let sub = 0;
    let tax = 0;
    let count = 0;

    items.forEach((item) => {
      const lineSub = item.price * item.quantity;
      const lineTax = (lineSub * (item.tax_rate || 5.0)) / 100;
      sub += lineSub;
      tax += lineTax;
      count += item.quantity;
    });

    let calculatedDiscount = couponDiscount;
    if (appliedCouponObj) {
      if (appliedCouponObj.discount_type === 'percentage') {
        const pctDisc = (sub * (appliedCouponObj.discount_value || 0)) / 100;
        calculatedDiscount = appliedCouponObj.max_discount ? Math.min(pctDisc, appliedCouponObj.max_discount) : pctDisc;
      } else {
        calculatedDiscount = Math.min(appliedCouponObj.discount_value || 0, sub);
      }
      if (appliedCouponObj.min_order_value && sub < appliedCouponObj.min_order_value) {
        calculatedDiscount = 0;
      }
    }

    const disc = Math.round(Math.min(calculatedDiscount, sub) * 100) / 100;
    const fee = 0; // Flat or waived delivery fee
    const gross = sub - disc + tax + fee;
    const payable = Math.max(0, Math.round(gross));

    return {
      subtotal: Math.round(sub * 100) / 100,
      taxTotal: Math.round(tax * 100) / 100,
      deliveryFee: fee,
      discount: disc,
      payableAmount: payable,
      itemCount: count,
    };
  }, [items, couponDiscount, appliedCouponObj]);

  const cart: CustomerCart = {
    restaurantId,
    restaurantName,
    restaurantLogo,
    items,
    subtotal,
    taxTotal,
    deliveryFee,
    discount,
    couponCode,
    payableAmount,
  };

  const executeAdd = (
    rest: { id: string; name: string; logo_url?: string },
    product: Product,
    qty: number
  ) => {
    setRestaurantId(rest.id);
    setRestaurantName(rest.name);
    setRestaurantLogo(rest.logo_url || null);

    setItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.product_id === product.id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + qty,
        };
        return updated;
      }
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          price: product.discounted_price || product.price,
          tax_rate: product.tax_rate || 5.0,
          food_type: product.food_type,
          image_url: product.image_url,
          quantity: qty,
        },
      ];
    });
  };

  const addToCart = (
    restaurant: { id: string; name: string; logo_url?: string },
    product: Product,
    quantity: number = 1
  ) => {
    // Cross-restaurant check
    if (restaurantId && restaurantId !== restaurant.id && items.length > 0) {
      setConflictModal({
        isOpen: true,
        currentRestName: restaurantName || 'another restaurant',
        newRestName: restaurant.name,
        pendingRestaurant: restaurant,
        pendingProduct: product,
        pendingQuantity: quantity,
      });
      return;
    }

    executeAdd(restaurant, product, quantity);
  };

  const resolveConflict = (action: 'clear_and_continue' | 'cancel') => {
    if (action === 'clear_and_continue' && conflictModal.pendingRestaurant && conflictModal.pendingProduct) {
      // Clear previous cart
      setItems([]);
      setCouponCode(undefined);
      setCouponDiscount(0);

      // Add new restaurant item
      executeAdd(
        conflictModal.pendingRestaurant,
        conflictModal.pendingProduct,
        conflictModal.pendingQuantity
      );
    }

    // Reset modal state
    setConflictModal({
      isOpen: false,
      currentRestName: '',
      newRestName: '',
      pendingRestaurant: null,
      pendingProduct: null,
      pendingQuantity: 1,
    });
  };

  const updateQuantity = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(productId);
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.product_id === productId ? { ...i, quantity: newQty } : i))
    );
  };

  const removeFromCart = (productId: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.product_id !== productId);
      if (next.length === 0) {
        setRestaurantId(null);
        setRestaurantName(null);
        setRestaurantLogo(null);
        setCouponCode(undefined);
        setCouponDiscount(0);
      }
      return next;
    });
  };

  const clearCart = () => {
    setItems([]);
    setRestaurantId(null);
    setRestaurantName(null);
    setRestaurantLogo(null);
    setCouponCode(undefined);
    setCouponDiscount(0);
    setAppliedCouponObj(null);
  };

  const applyCoupon = (code: string, discountAmt: number = 0, couponObj?: Coupon | null) => {
    if (items.length === 0) {
      console.warn('Cannot apply coupon to an empty cart.');
      return;
    }
    setCouponCode(code);
    setCouponDiscount(discountAmt);
    setAppliedCouponObj(couponObj || null);
  };

  const removeCoupon = () => {
    setCouponCode(undefined);
    setCouponDiscount(0);
    setAppliedCouponObj(null);
  };

  return (
    <CustomerCartContext.Provider
      value={{
        cart,
        itemCount,
        conflictModal,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        applyCoupon,
        removeCoupon,
        resolveConflict,
      }}
    >
      {children}
    </CustomerCartContext.Provider>
  );
};

export const useCustomerCart = () => {
  const ctx = useContext(CustomerCartContext);
  if (!ctx) {
    throw new Error('useCustomerCart must be used within a CustomerCartProvider');
  }
  return ctx;
};
