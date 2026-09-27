/**
 * Printer Transport Interface & Result Types
 */

import { RestaurantPrinter } from '../../../types';

export type TransportType = 'tcp' | 'bluetooth' | 'usb';

export type TransportStatus =
  | 'configured'
  | 'checking'
  | 'connecting'
  | 'connected'
  | 'reachable'
  | 'unreachable'
  | 'connection_refused'
  | 'timeout'
  | 'sending'
  | 'data_sent'
  | 'partial_or_unknown'
  | 'invalid_config'
  | 'not_configured'
  | 'not_bound'
  | 'bluetooth_disabled'
  | 'permission_denied';

export interface TcpConnectionConfig {
  host: string;
  port: number;
  timeoutMs?: number;
}

export interface BluetoothDeviceInfo {
  id: string; // MAC address
  address: string; // MAC address
  name: string;
  bonded?: boolean;
}

export interface BluetoothConnectionConfig {
  address: string;
  name?: string;
  timeoutMs?: number;
}

export interface TestConnectionResult {
  reachable: boolean;
  status: TransportStatus;
  message: string;
  latencyMs: number;
  error?: string;
}

export interface PrintTransportResult {
  success: boolean;
  status: TransportStatus;
  bytesSent: number;
  totalBytes: number;
  message: string;
  durationMs: number;
  error?: string;
}

export const DEFAULT_TCP_TIMEOUT_MS = 3000;
export const DEFAULT_BLUETOOTH_TIMEOUT_MS = 5000;
export const SPP_UUID = '00001101-0000-1000-8000-00805F9B34FB';
