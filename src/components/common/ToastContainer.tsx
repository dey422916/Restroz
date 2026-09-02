import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNotification } from '../../context/NotificationContext';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useNotification();

  if (toasts.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';
        const isWarning = toast.type === 'warning';

        return (
          <View
            key={toast.id}
            style={[
              styles.toast,
              isSuccess && styles.success,
              isError && styles.error,
              isWarning && styles.warning,
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{toast.title}</Text>
              {toast.message ? <Text style={styles.message}>{toast.message}</Text> : null}
            </View>
            <TouchableOpacity onPress={() => removeToast(toast.id)}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    left: 20,
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  success: { backgroundColor: '#16a34a' },
  error: { backgroundColor: '#e11d48' },
  warning: { backgroundColor: '#ea580c' },
  title: { color: '#ffffff', fontWeight: '900', fontSize: 12 },
  message: { color: '#ffffff', fontSize: 11, opacity: 0.9, marginTop: 2 },
  close: { color: '#ffffff', fontWeight: 'bold', fontSize: 14, paddingLeft: 8 },
});
