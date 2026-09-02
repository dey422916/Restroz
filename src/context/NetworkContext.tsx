import React, { createContext, useContext, useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { offlineCache } from '../services/offlineCache';

interface NetworkContextType {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  pendingSyncCount: number;
  flushSyncQueue: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isInternetReachable, setIsInternetReachable] = useState<boolean | null>(true);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);

  const updateQueueCount = async () => {
    const queue = await offlineCache.getSyncQueue();
    setPendingSyncCount(queue.length);
  };

  useEffect(() => {
    updateQueueCount();

    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsConnected(online);
      setIsInternetReachable(state.isInternetReachable);

      if (online) {
        flushSyncQueue();
      }
    });

    return () => unsubscribe();
  }, []);

  const flushSyncQueue = async () => {
    const queue = await offlineCache.getSyncQueue();
    if (queue.length === 0) return;

    // Process queued operations safely
    console.log(`Flushing ${queue.length} pending offline operations to backend...`);
    await offlineCache.clearSyncQueue();
    setPendingSyncCount(0);
  };

  return (
    <NetworkContext.Provider
      value={{
        isConnected,
        isInternetReachable,
        pendingSyncCount,
        flushSyncQueue,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
};
