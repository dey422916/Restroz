import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/context/AuthContext';
import { SettingsProvider } from '../src/context/SettingsContext';
import { NotificationProvider } from '../src/context/NotificationContext';
import { PosProvider } from '../src/context/PosContext';
import { CustomerCartProvider } from '../src/context/CustomerCartContext';
import { NetworkProvider } from '../src/context/NetworkContext';
import { ToastContainer } from '../src/components/common/ToastContainer';

import { Linking, Platform } from 'react-native';
import { useRouter } from 'expo-router';

function DeepLinkHandler() {
  const router = useRouter();

  React.useEffect(() => {
    // Inject web print isolation style to ensure browser never prints the main app layout
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      if (!document.getElementById('ratnadeep-print-isolation-style')) {
        const style = document.createElement('style');
        style.id = 'ratnadeep-print-isolation-style';
        style.innerHTML = `
          @media print {
            body > *:not(#ratnadeep-pos-print-frame) {
              display: none !important;
            }
            #root, #__next, .expo-root {
              display: none !important;
            }
          }
        `;
        document.head.appendChild(style);
      }
    }

    const handleUrl = (url: string | null) => {
      if (!url) return;
      if (url.includes('reset-password') || url.includes('type=recovery')) {
        router.push('/(auth)/reset-password');
      } else if (url.includes('verify-email') || url.includes('type=signup') || url.includes('email-confirmation')) {
        router.push('/(auth)/login');
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', (event) => handleUrl(event.url));
    return () => sub.remove();
  }, [router]);

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <NetworkProvider>
        <NotificationProvider>
          <AuthProvider>
            <SettingsProvider>
              <PosProvider>
                <CustomerCartProvider>
                  <StatusBar style="auto" />
                  <DeepLinkHandler />
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="(auth)/login" />
                    <Stack.Screen name="(auth)/signup" />
                    <Stack.Screen name="(auth)/verify-email" />
                    <Stack.Screen name="(auth)/forgot-password" />
                    <Stack.Screen name="(auth)/reset-password" />
                    <Stack.Screen name="(admin)" />
                    <Stack.Screen name="super-admin" />
                    <Stack.Screen name="(marketplace)" />
                    <Stack.Screen name="menu/table/[tableId]" />
                  </Stack>
                  <ToastContainer />
                </CustomerCartProvider>
              </PosProvider>
            </SettingsProvider>
          </AuthProvider>
        </NotificationProvider>
      </NetworkProvider>
    </SafeAreaProvider>
  );
}
