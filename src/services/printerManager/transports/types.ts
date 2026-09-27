/**
 * Printer Transport Interface & Result Types
 */

import { RestaurantPrinter } from '../../../types';

export type TransportType = 'tcp' | 'bluetooth' | 'usb';

export type TransportStatus =
  | 'configured'
  | 'checking'
  | 'reachable'
  | 'unreachable'
  | 'connection_refused'
  | 'timeout'
  | 'sending'
  | 'data_sent'
  | 'partial_or_unknown'
  | 'invalid_config'
  | 'not_configured';

export interface TcpConnectionConfig {
  host: string;
  port: number;
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
