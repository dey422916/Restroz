/**
 * Android LAN / Wi-Fi Raw TCP ESC/POS Transport
 * Manages raw binary streaming over TCP (Port 9100) with timeout handling,
 * per-printer concurrency protection, partial write safety, and socket cleanup.
 */

import { Platform } from 'react-native';
import {
  TcpConnectionConfig,
  TestConnectionResult,
  PrintTransportResult,
  DEFAULT_TCP_TIMEOUT_MS,
} from './types';

// Per-printer active job lock (printer ID -> Promise lock)
const ACTIVE_PRINTER_LOCKS = new Map<string, boolean>();

/**
 * Resolves the appropriate socket engine based on runtime platform:
 * - Native (Android/iOS): react-native-tcp-socket
 * - Node.js (Tests): net
 */
async function getSocketEngine(): Promise<any> {
  if (Platform.OS === 'android' || Platform.OS === 'ios') {
    try {
      const TcpSocket = await import('react-native-tcp-socket');
      return TcpSocket.default || TcpSocket;
    } catch (err) {
      console.warn('[TCP Transport] Failed to load react-native-tcp-socket:', err);
      throw new Error('Native TCP Socket module is not available.');
    }
  }

  // Node.js test environment
  if (typeof process !== 'undefined' && process.versions && (process.versions as any).node) {
    try {
      const nodeRequire = (globalThis as any).require;
      if (nodeRequire) {
        return nodeRequire('net');
      }
    } catch (_) {}
  }

  // Web fallback (browsers do not support raw TCP sockets directly)
  return null;
}

/**
 * Validates TCP host and port configuration.
 */
export function validateTcpConfig(config: Partial<TcpConnectionConfig>): { isValid: boolean; error?: string } {
  if (!config.host || !config.host.trim()) {
    return { isValid: false, error: 'Printer IP address / hostname is required.' };
  }
  const port = Number(config.port);
  if (isNaN(port) || port < 1 || port > 65535) {
    return { isValid: false, error: 'Port must be an integer between 1 and 65535.' };
  }
  return { isValid: true };
}

export const tcpTransport = {
  /**
   * Tests TCP reachability of a LAN or Wi-Fi thermal printer without sending print data.
   */
  async testConnection(config: TcpConnectionConfig): Promise<TestConnectionResult> {
    const validation = validateTcpConfig(config);
    if (!validation.isValid) {
      return {
        reachable: false,
        status: 'invalid_config',
        message: validation.error || 'Invalid TCP configuration.',
        latencyMs: 0,
      };
    }

    const host = config.host.trim();
    const port = Number(config.port) || 9100;
    const timeoutMs = config.timeoutMs || DEFAULT_TCP_TIMEOUT_MS;
    const startTime = Date.now();

    const socketEngine = await getSocketEngine();
    if (!socketEngine) {
      if (Platform.OS === 'web') {
        return {
          reachable: false,
          status: 'invalid_config',
          message: 'Direct TCP socket printing is not supported in web browser sandbox. Use Android device or RestroZ Print Agent.',
          latencyMs: 0,
        };
      }
      return {
        reachable: false,
        status: 'invalid_config',
        message: 'TCP Socket module unavailable.',
        latencyMs: 0,
      };
    }

    return new Promise<TestConnectionResult>((resolve) => {
      let resolved = false;
      let socket: any = null;

      const cleanup = () => {
        if (socket) {
          try {
            socket.removeAllListeners?.();
            socket.destroy?.();
          } catch (_) {}
          socket = null;
        }
      };

      const finish = (result: TestConnectionResult) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(result);
        }
      };

      const timer = setTimeout(() => {
        finish({
          reachable: false,
          status: 'timeout',
          message: `Connection timed out after ${timeoutMs}ms (${host}:${port}).`,
          latencyMs: Date.now() - startTime,
        });
      }, timeoutMs);

      try {
        socket = socketEngine.createConnection(
          { host, port, timeout: timeoutMs },
          () => {
            clearTimeout(timer);
            const latency = Date.now() - startTime;
            finish({
              reachable: true,
              status: 'reachable',
              message: `Printer reachable (${latency}ms).`,
              latencyMs: latency,
            });
          }
        );

        socket.on('error', (err: any) => {
          clearTimeout(timer);
          const errCode = err?.code || '';
          const errMsg = err?.message || String(err);
          let status: any = 'unreachable';
          let message = `Failed to connect to ${host}:${port}.`;

          if (errCode === 'ECONNREFUSED' || errMsg.includes('ECONNREFUSED')) {
            status = 'connection_refused';
            message = `Connection refused by ${host}:${port}. Verify printer is powered on and port 9100 is open.`;
          } else if (errCode === 'ETIMEDOUT' || errMsg.includes('ETIMEDOUT')) {
            status = 'timeout';
            message = `Connection timed out (${host}:${port}).`;
          } else if (errCode === 'EHOSTUNREACH' || errMsg.includes('EHOSTUNREACH')) {
            status = 'unreachable';
            message = `Host unreachable (${host}). Check Wi-Fi / LAN connection.`;
          }

          finish({
            reachable: false,
            status,
            message,
            latencyMs: Date.now() - startTime,
            error: errMsg,
          });
        });
      } catch (err: any) {
        clearTimeout(timer);
        finish({
          reachable: false,
          status: 'unreachable',
          message: `Socket creation error: ${err?.message || err}`,
          latencyMs: Date.now() - startTime,
          error: String(err),
        });
      }
    });
  },

  /**
   * Sends binary ESC/POS payload to a LAN / Wi-Fi printer over raw TCP.
   */
  async sendPayload(
    config: TcpConnectionConfig,
    payload: Uint8Array,
    printerId: string = 'default'
  ): Promise<PrintTransportResult> {
    // 1. Concurrency Mutex Lock for this printer
    if (ACTIVE_PRINTER_LOCKS.get(printerId)) {
      return {
        success: false,
        status: 'sending',
        bytesSent: 0,
        totalBytes: payload.length,
        message: 'A print job is already in progress for this printer. Please wait.',
        durationMs: 0,
      };
    }

    ACTIVE_PRINTER_LOCKS.set(printerId, true);

    const validation = validateTcpConfig(config);
    if (!validation.isValid) {
      ACTIVE_PRINTER_LOCKS.delete(printerId);
      return {
        success: false,
        status: 'invalid_config',
        bytesSent: 0,
        totalBytes: payload.length,
        message: validation.error || 'Invalid TCP configuration.',
        durationMs: 0,
      };
    }

    const host = config.host.trim();
    const port = Number(config.port) || 9100;
    const timeoutMs = config.timeoutMs || 8000;
    const startTime = Date.now();

    const socketEngine = await getSocketEngine();
    if (!socketEngine) {
      ACTIVE_PRINTER_LOCKS.delete(printerId);
      if (Platform.OS === 'web') {
        return {
          success: false,
          status: 'invalid_config',
          bytesSent: 0,
          totalBytes: payload.length,
          message: 'Direct TCP socket printing is not supported in web browser sandbox.',
          durationMs: 0,
        };
      }
      return {
        success: false,
        status: 'invalid_config',
        bytesSent: 0,
        totalBytes: payload.length,
        message: 'TCP Socket module unavailable.',
        durationMs: 0,
      };
    }

    return new Promise<PrintTransportResult>((resolve) => {
      let resolved = false;
      let bytesFlushed = 0;
      let socket: any = null;

      const cleanup = () => {
        ACTIVE_PRINTER_LOCKS.delete(printerId);
        if (socket) {
          try {
            socket.removeAllListeners?.();
            socket.destroy?.();
          } catch (_) {}
          socket = null;
        }
      };

      const finish = (result: PrintTransportResult) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          if (__DEV__) {
            console.log(
              `[ANDROID PRINT]\nPrinter: ${printerId}\nTransport: TCP\nAddress: ${host}:${port}\nBytes: ${result.bytesSent}/${result.totalBytes}\nResult: ${result.status.toUpperCase()}\nDuration: ${result.durationMs}ms`
            );
          }
          resolve(result);
        }
      };

      const timer = setTimeout(() => {
        finish({
          success: false,
          status: bytesFlushed > 0 ? 'partial_or_unknown' : 'timeout',
          bytesSent: bytesFlushed,
          totalBytes: payload.length,
          message:
            bytesFlushed > 0
              ? 'Socket timed out while transmitting data. Check printer paper and physical output before retrying.'
              : `Connection timed out (${host}:${port}).`,
          durationMs: Date.now() - startTime,
        });
      }, timeoutMs);

      try {
        socket = socketEngine.createConnection({ host, port, timeout: timeoutMs }, () => {
          try {
            // Write binary payload directly
            const globalBuf = (globalThis as any).Buffer;
            const buffer = globalBuf
              ? globalBuf.from(payload.buffer, payload.byteOffset, payload.byteLength)
              : payload;

            const writeSuccess = socket.write(buffer, (writeErr: any) => {
              clearTimeout(timer);
              if (writeErr) {
                finish({
                  success: false,
                  status: bytesFlushed > 0 ? 'partial_or_unknown' : 'unreachable',
                  bytesSent: bytesFlushed,
                  totalBytes: payload.length,
                  message: `Write failed: ${writeErr.message || writeErr}`,
                  durationMs: Date.now() - startTime,
                  error: String(writeErr),
                });
                return;
              }

              bytesFlushed = payload.length;

              // Gracefully close socket after payload flushed
              if (socket.end) {
                socket.end(() => {
                  finish({
                    success: true,
                    status: 'data_sent',
                    bytesSent: bytesFlushed,
                    totalBytes: payload.length,
                    message: 'Print data sent to printer.',
                    durationMs: Date.now() - startTime,
                  });
                });
              } else {
                finish({
                  success: true,
                  status: 'data_sent',
                  bytesSent: bytesFlushed,
                  totalBytes: payload.length,
                  message: 'Print data sent to printer.',
                  durationMs: Date.now() - startTime,
                });
              }
            });

            if (!writeSuccess) {
              // Socket buffered data; track bytes in progress
              bytesFlushed = Math.floor(payload.length / 2);
            }
          } catch (writeException: any) {
            clearTimeout(timer);
            finish({
              success: false,
              status: bytesFlushed > 0 ? 'partial_or_unknown' : 'unreachable',
              bytesSent: bytesFlushed,
              totalBytes: payload.length,
              message: `Transmission error: ${writeException?.message || writeException}`,
              durationMs: Date.now() - startTime,
              error: String(writeException),
            });
          }
        });

        socket.on('error', (err: any) => {
          clearTimeout(timer);
          const errCode = err?.code || '';
          const errMsg = err?.message || String(err);
          const status = bytesFlushed > 0 ? 'partial_or_unknown' : (errCode === 'ECONNREFUSED' ? 'connection_refused' : 'unreachable');

          finish({
            success: false,
            status,
            bytesSent: bytesFlushed,
            totalBytes: payload.length,
            message:
              bytesFlushed > 0
                ? 'Socket error occurred during data transmission. Output state is partial/unknown.'
                : `Could not reach printer (${host}:${port}): ${errMsg}`,
            durationMs: Date.now() - startTime,
            error: errMsg,
          });
        });
      } catch (err: any) {
        clearTimeout(timer);
        finish({
          success: false,
          status: 'unreachable',
          bytesSent: 0,
          totalBytes: payload.length,
          message: `Socket error: ${err?.message || err}`,
          durationMs: Date.now() - startTime,
          error: String(err),
        });
      }
    });
  },
};
