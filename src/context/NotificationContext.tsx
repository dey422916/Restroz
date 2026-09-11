import React, { createContext, useContext, useState, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface NotificationContextType {
  toasts: ToastMessage[];
  showToast: (type: ToastType, title: string, message?: string) => void;
  removeToast: (id: string) => void;
  playOrderBell: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const lastToastRef = React.useRef<{ key: string; time: number }>({ key: '', time: 0 });

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((type: ToastType, title: string, message?: string) => {
    const key = `${type}:${title}:${message || ''}`;
    const now = Date.now();
    // Debounce duplicate toasts within 2000ms
    if (lastToastRef.current.key === key && now - lastToastRef.current.time < 2000) {
      return;
    }
    lastToastRef.current = { key, time: now };

    const id = 'toast-' + now + Math.random().toString(36).substr(2, 4);
    setToasts((prev) => {
      // Prevent showing identical toast if already visible in active toasts
      if (prev.some((t) => t.type === type && t.title === title && t.message === message)) {
        return prev;
      }
      return [...prev.slice(-3), { id, type, title, message }];
    });

    setTimeout(() => {
      removeToast(id);
    }, 4000);
  }, [removeToast]);

  const playOrderBell = useCallback(() => {
    try {
      console.log('Order notification sound alert triggered');
    } catch (e) {
      // Audio fallback
    }
  }, []);

  return (
    <NotificationContext.Provider value={{ toasts, showToast, removeToast, playOrderBell }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
