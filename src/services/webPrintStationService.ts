import { Platform } from 'react-native';
import { supabase } from './supabase';
import {
  webDirectPrintService,
  ConfiguredDirectPrinter,
  isPrinterRoleEligible,
} from './webDirectPrintService';

export interface WebStationStatus {
  isActive: boolean;
  isMobileStation: boolean;
  restaurantId: string | null;
  agentId: string | null;
  agentToken: string | null;
  pairedPrinters: string[];
  lastHeartbeat: number | null;
  processedJobCount: number;
  osInfo: string;
}

/**
 * Generates or retrieves a persistent browser-unique station identifier.
 * Ensures multi-device setups (Admin Mobile vs Staff Laptop) do not collide
 * on the same print_agents row in Supabase.
 */
function getBrowserStationDeviceId(restaurantId: string): string {
  const STORAGE_KEY = `@restroz_station_browser_uid_${restaurantId}`;
  let uid = '';
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      uid = window.localStorage.getItem(STORAGE_KEY) || '';
      if (!uid) {
        uid = Math.random().toString(36).substring(2, 9) + Date.now().toString(36).substring(4);
        window.localStorage.setItem(STORAGE_KEY, uid);
      }
    } catch (_) {
      uid = 'web_' + Date.now();
    }
  } else {
    uid = 'node_' + Date.now();
  }
  return `web_station_${restaurantId}_${uid}`;
}

/**
 * Detects device platform and browser context for accurate reporting in print_agents.
 */
function getStationClientInfo(): { isMobile: boolean; osInfo: string; displayNameSuffix: string } {
  if (typeof navigator === 'undefined') {
    return { isMobile: false, osInfo: 'Browser Web Station', displayNameSuffix: 'Web Station' };
  }
  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isMobile = isAndroid || isIOS || /Mobile/i.test(ua);

  let osInfo = 'Desktop Chrome Web Station';
  let displayNameSuffix = 'Web Station';

  if (isAndroid) {
    osInfo = 'Android Chrome Web Station';
    displayNameSuffix = 'Mobile Station';
  } else if (isIOS) {
    osInfo = 'iOS Safari Web Station';
    displayNameSuffix = 'Mobile Station';
  } else if (/Windows/i.test(ua)) {
    osInfo = 'Windows Chrome Web Station';
    displayNameSuffix = 'Desktop Station';
  } else if (/Mac/i.test(ua)) {
    osInfo = 'macOS Web Station';
    displayNameSuffix = 'Desktop Station';
  }

  return { isMobile, osInfo, displayNameSuffix };
}

class WebPrintStationService {
  private activeRestaurantId: string | null = null;
  private agentId: string | null = null;
  private agentToken: string | null = null;
  private realtimeChannel: any = null;
  private pollTimer: any = null;
  private heartbeatTimer: any = null;
  private isProcessing = false;
  private inFlightJobIds = new Set<string>();
  private processedJobCount = 0;
  private isInitialized = false;
  private lastHeartbeatTime: number | null = null;
  private clientInfo = getStationClientInfo();
  private wakeLockSentinel: any = null;
  private visibilityHandler: any = null;
  private focusHandler: any = null;
  private beforeUnloadHandler: any = null;

  /**
   * Starts the Web Print Station for the given restaurant.
   * Runs ONLY on Web browsers.
   * If local direct hardware printers (Bluetooth / USB / Serial) are connected,
   * registers the browser session as the restaurant's active Print Station in Supabase
   * and listens for incoming print jobs from staff mobile/laptop devices.
   */
  async start(
    restaurantId?: string | null,
    restaurantName?: string,
    overridePrinters?: ConfiguredDirectPrinter[]
  ): Promise<void> {
    if (Platform.OS !== 'web' || !restaurantId) {
      return;
    }

    // Refresh client info
    this.clientInfo = getStationClientInfo();

    // Check if this browser has any locally configured hardware printers that are active (not disconnected)
    const localPrinters = overridePrinters || webDirectPrintService.getSavedPrinters(restaurantId);
    const hardwarePrinters = localPrinters.filter(
      (p) =>
        (p.transport === 'bluetooth' || p.transport === 'usb' || p.transport === 'serial') &&
        p.status !== 'disconnected' &&
        p.status !== 'unsupported'
    );

    if (hardwarePrinters.length === 0) {
      if (this.isInitialized) {
        this.stop();
      }
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[WEB_PRINT_STATION] No local hardware printers configured — station idle.');
      }
      return;
    }

    // If already initialized for this restaurant, keep listeners active and sync printers
    if (this.activeRestaurantId === restaurantId && this.agentToken && this.isInitialized) {
      await this.syncStationPrinters(restaurantId, restaurantName, hardwarePrinters);
      return;
    }

    // Stop previous instance if switching restaurants
    this.stop();
    this.activeRestaurantId = restaurantId;

    try {
      // 1. Ensure Agent is registered and paired in Supabase
      await this.ensureStationRegistered(restaurantId, restaurantName, hardwarePrinters);

      if (!this.agentId || !this.agentToken) {
        console.warn('[WEB_PRINT_STATION] Agent registration incomplete. Station cannot activate.');
        return;
      }

      // 2. Start Realtime Subscription
      this.subscribeToRealtimeJobs(restaurantId);

      // 3. Start Polling Fallback (every 3.5 seconds)
      this.startPolling(restaurantId);

      // 4. Start Heartbeat (every 20 seconds) & send initial pulse immediately
      this.startHeartbeat(restaurantId);
      await this.sendImmediateHeartbeat();

      // 5. Attach Browser Lifecycle Listeners (Mobile background resume, focus, unload)
      this.attachLifecycleListeners(restaurantId);

      // 6. Request Screen WakeLock on mobile browsers to keep station responsive
      if (this.clientInfo.isMobile) {
        this.requestWakeLock().catch(() => {});
      }

      this.isInitialized = true;
      console.log(
        `[WEB_PRINT_STATION_STARTED]\n` +
        `Restaurant ID: ${restaurantId}\n` +
        `Device Name: ${restaurantName ? `${restaurantName} (${this.clientInfo.displayNameSuffix})` : 'Counter Station'}\n` +
        `Agent ID: ${this.agentId}\n` +
        `OS Info: ${this.clientInfo.osInfo}\n` +
        `Hardware Printers: ${hardwarePrinters.map((p) => p.name).join(', ')}\n` +
        `Listening for Staff Jobs: YES`
      );
    } catch (err) {
      console.warn('[WEB_PRINT_STATION] Failed to start print station:', err);
    }
  }

  /**
   * Ensures the browser session is registered in print_agents and paired with the restaurant.
   */
  private async ensureStationRegistered(
    restaurantId: string,
    restaurantName?: string,
    hardwarePrinters: ConfiguredDirectPrinter[] = []
  ): Promise<void> {
    const stationDeviceId = getBrowserStationDeviceId(restaurantId);
    const displayName = restaurantName
      ? `${restaurantName} (${this.clientInfo.displayNameSuffix})`
      : `Counter ${this.clientInfo.displayNameSuffix}`;

    // Call register_print_agent RPC
    const { data: reg, error: regErr } = await supabase.rpc('register_print_agent', {
      p_device_id: stationDeviceId,
      p_device_name: displayName,
      p_os_info: this.clientInfo.osInfo,
      p_agent_version: '1.0.0',
    });

    if (regErr || !reg) {
      console.warn('[WEB_PRINT_STATION] register_print_agent error:', regErr);
      return;
    }

    this.agentId = reg.agent_id;
    this.agentToken = reg.agent_token;

    // If not paired yet, pair it
    if (!reg.is_paired && reg.pairing_code) {
      const { data: pairRes, error: pairErr } = await supabase.rpc('pair_print_agent', {
        p_pairing_code: reg.pairing_code,
        p_restaurant_id: restaurantId,
      });

      if (pairErr) {
        console.warn('[WEB_PRINT_STATION] pair_print_agent error:', pairErr);
      } else if (pairRes) {
        this.agentId = pairRes.agent_id || this.agentId;
        this.agentToken = pairRes.agent_token || this.agentToken;
      }
    }

    // Sync printer queues
    await this.syncStationPrinters(restaurantId, restaurantName, hardwarePrinters);
  }

  /**
   * Syncs locally configured hardware printers to printer_devices table via sync_print_agent_printers RPC.
   */
  async syncStationPrinters(
    restaurantId?: string | null,
    restaurantName?: string,
    overridePrinters?: ConfiguredDirectPrinter[]
  ): Promise<void> {
    if (Platform.OS !== 'web') return;

    const restId = restaurantId || this.activeRestaurantId;
    if (!restId) return;

    const printers = overridePrinters || webDirectPrintService.getSavedPrinters(restId);
    const hardwarePrinters = printers.filter(
      (p) =>
        (p.transport === 'bluetooth' || p.transport === 'usb' || p.transport === 'serial') &&
        p.status !== 'disconnected' &&
        p.status !== 'unsupported'
    );

    if (hardwarePrinters.length === 0) {
      if (this.agentId) {
        try {
          await supabase
            .from('printer_devices')
            .update({ is_active: false, is_online: false, updated_at: new Date().toISOString() })
            .eq('agent_id', this.agentId);
        } catch (_) {}
      }
      if (this.agentToken) {
        try {
          await supabase.rpc('sync_print_agent_printers', {
            p_agent_token: this.agentToken,
            p_printers: [],
          });
        } catch (_) {}
      }
      if (this.isInitialized) {
        this.stop();
      }
      return;
    }

    // If station is not initialized yet, initialize the full station lifecycle
    if (!this.isInitialized || !this.agentToken) {
      await this.start(restId, restaurantName, hardwarePrinters);
      return;
    }

    try {
      const printerPayload = hardwarePrinters.map((p) => {
        const is58mm = p.paperWidth === '58mm' || /58|seznik|925|rpp|mini/i.test(p.name);
        return {
          printer_name: p.name,
          role: p.role || 'both',
          paper_width: is58mm ? '58mm' : (p.paperWidth || '80mm'),
          is_active: true,
          is_primary: Boolean(p.isPrimary),
        };
      });

      // 1. Deactivate any previously registered queues for this station
      if (this.agentId) {
        try {
          await supabase
            .from('printer_devices')
            .update({ is_active: false, is_online: false, updated_at: new Date().toISOString() })
            .eq('agent_id', this.agentId);
        } catch (_) {}
      }

      // 2. Upsert current active printers via RPC
      const { error } = await supabase.rpc('sync_print_agent_printers', {
        p_agent_token: this.agentToken,
        p_printers: printerPayload,
      });

      // 3. Mark the active printers as is_active: true
      if (this.agentId) {
        const activeNames = printerPayload.map((p) => p.printer_name);
        try {
          await supabase
            .from('printer_devices')
            .update({ is_active: true, is_online: true, updated_at: new Date().toISOString() })
            .eq('agent_id', this.agentId)
            .in('printer_name', activeNames);
        } catch (_) {}
      }

      if (error) {
        console.warn('[WEB_PRINT_STATION] sync_print_agent_printers error:', error);
      } else {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[WEB_PRINT_STATION] Synced printers with Supabase:', printerPayload.map((p) => p.printer_name));
        }
      }
    } catch (err) {
      console.warn('[WEB_PRINT_STATION] Error syncing station printers:', err);
    }
  }

  /**
   * Subscribes to Supabase Realtime for INSERT events on print_jobs for this restaurant.
   */
  private subscribeToRealtimeJobs(restaurantId: string): void {
    if (this.realtimeChannel) {
      try {
        supabase.removeChannel(this.realtimeChannel);
      } catch (_) {}
      this.realtimeChannel = null;
    }

    try {
      this.realtimeChannel = supabase
        .channel(`web_station_jobs_${restaurantId}_${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'print_jobs',
            filter: `restaurant_id=eq.${restaurantId}`,
          },
          (payload: any) => {
            if (payload?.new && (payload.new.status === 'queued' || payload.new.status === 'received')) {
              this.processJob(payload.new);
            }
          }
        )
        .subscribe((status: string) => {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.log('[WEB_PRINT_STATION] Realtime channel status:', status);
          }
        });
    } catch (err) {
      console.warn('[WEB_PRINT_STATION] Failed to subscribe to Realtime print jobs:', err);
    }
  }

  /**
   * Periodic polling fallback (every 3.5s) to guarantee no jobs are missed.
   */
  private startPolling(restaurantId: string): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      this.pollPendingJobs(restaurantId);
    }, 3500);
  }

  private async pollPendingJobs(restaurantId: string): Promise<void> {
    if (this.isProcessing) return;

    try {
      // 1. Try poll_pending_print_jobs RPC if agentToken is present
      if (this.agentToken) {
        const { data: pollRes, error } = await supabase.rpc('poll_pending_print_jobs', {
          p_agent_token: this.agentToken,
        });

        if (!error && pollRes?.jobs && Array.isArray(pollRes.jobs) && pollRes.jobs.length > 0) {
          for (const job of pollRes.jobs) {
            await this.processJob(job);
          }
          return;
        }
      }

      // 2. Direct query fallback
      const { data: queuedJobs, error: qErr } = await supabase
        .from('print_jobs')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .in('status', ['queued', 'received'])
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true })
        .limit(10);

      if (!qErr && queuedJobs && queuedJobs.length > 0) {
        for (const job of queuedJobs) {
          await this.processJob(job);
        }
      }
    } catch (err) {
      // Silent polling errors
    }
  }

  /**
   * Heartbeat interval (every 20s) keeping station online in print_agents.
   */
  private startHeartbeat(restaurantId: string): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(async () => {
      await this.sendImmediateHeartbeat();
    }, 20000);
  }

  /**
   * Sends an immediate heartbeat pulse to Supabase to keep status = 'online' and last_seen fresh.
   */
  private async sendImmediateHeartbeat(): Promise<void> {
    if (!this.activeRestaurantId || !this.agentId) return;
    try {
      // 1. If agentToken is present, call poll_pending_print_jobs RPC which updates heartbeat under SECURITY DEFINER
      if (this.agentToken) {
        const { data: pollRes } = await supabase.rpc('poll_pending_print_jobs', {
          p_agent_token: this.agentToken,
        });
        this.lastHeartbeatTime = Date.now();
        if (pollRes?.jobs && Array.isArray(pollRes.jobs) && pollRes.jobs.length > 0) {
          for (const job of pollRes.jobs) {
            await this.processJob(job);
          }
        }
        return;
      }

      // 2. Fallback direct table update
      const nowIso = new Date().toISOString();
      await supabase
        .from('print_agents')
        .update({
          status: 'online',
          last_seen: nowIso,
        })
        .eq('id', this.agentId);
      this.lastHeartbeatTime = Date.now();
    } catch (_) {}
  }

  /**
   * Attaches mobile browser lifecycle listeners (resume from background, focus, beforeunload).
   */
  private attachLifecycleListeners(restaurantId: string): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    this.detachLifecycleListeners();

    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        this.handleResume(restaurantId);
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);

    this.focusHandler = () => {
      this.handleResume(restaurantId);
    };
    window.addEventListener('focus', this.focusHandler);

    this.beforeUnloadHandler = () => {
      this.markStationOffline();
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  private detachLifecycleListeners(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.focusHandler) {
      window.removeEventListener('focus', this.focusHandler);
      this.focusHandler = null;
    }
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
  }

  /**
   * Resumes station operation when mobile browser returns to the foreground.
   */
  private async handleResume(restaurantId: string): Promise<void> {
    if (!this.isInitialized) return;

    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[WEB_PRINT_STATION] Mobile browser resumed foreground — pulsing heartbeat & polling jobs.');
    }

    // 1. Refresh heartbeat immediately
    await this.sendImmediateHeartbeat();

    // 2. Poll pending jobs immediately
    await this.pollPendingJobs(restaurantId);

    // 3. Re-request wake lock if mobile
    if (this.clientInfo.isMobile && !this.wakeLockSentinel) {
      this.requestWakeLock().catch(() => {});
    }
  }

  /**
   * Requests Screen WakeLock on mobile browsers so the tab doesn't sleep while acting as a station.
   */
  private async requestWakeLock(): Promise<void> {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        this.wakeLockSentinel.addEventListener('release', () => {
          this.wakeLockSentinel = null;
        });
      } catch (_) {}
    }
  }

  private async releaseWakeLock(): Promise<void> {
    if (this.wakeLockSentinel) {
      try {
        await this.wakeLockSentinel.release();
      } catch (_) {}
      this.wakeLockSentinel = null;
    }
  }

  /**
   * Marks this agent as offline in Supabase.
   */
  async markStationOffline(): Promise<void> {
    if (!this.agentId) return;
    try {
      await supabase
        .from('print_agents')
        .update({
          status: 'offline',
          last_seen: new Date().toISOString(),
        })
        .eq('id', this.agentId);
    } catch (_) {}
  }

  /**
   * Decodes a base64 string into Uint8Array safely across all JS environments.
   */
  private decodeBase64Payload(base64Str: string): Uint8Array {
    if (typeof (globalThis as any).Buffer !== 'undefined') {
      return new Uint8Array((globalThis as any).Buffer.from(base64Str, 'base64'));
    }
    if (typeof (globalThis as any).atob === 'function') {
      const binaryStr = (globalThis as any).atob(base64Str);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return bytes;
    }
    // Manual RFC 4648 base64 decoder
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lookup = new Uint8Array(256);
    for (let i = 0; i < chars.length; i++) {
      lookup[chars.charCodeAt(i)] = i;
    }
    let bufferLength = base64Str.length * 0.75;
    if (base64Str[base64Str.length - 1] === '=') bufferLength--;
    if (base64Str[base64Str.length - 2] === '=') bufferLength--;
    const bytes = new Uint8Array(bufferLength);
    let p = 0;
    for (let i = 0; i < base64Str.length; i += 4) {
      const encoded1 = lookup[base64Str.charCodeAt(i)];
      const encoded2 = lookup[base64Str.charCodeAt(i + 1)];
      const encoded3 = lookup[base64Str.charCodeAt(i + 2)];
      const encoded4 = lookup[base64Str.charCodeAt(i + 3)];
      bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
      if (encoded3 !== 64 && base64Str[i + 2] !== '=') {
        bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
      }
      if (encoded4 !== 64 && base64Str[i + 3] !== '=') {
        bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
      }
    }
    return bytes;
  }

  /**
   * Processes a single incoming print job.
   */
  private async processJob(job: any): Promise<void> {
    if (!job || !job.id || !job.payload_base64) return;
    if (this.inFlightJobIds.has(job.id)) return;

    this.inFlightJobIds.add(job.id);
    this.isProcessing = true;

    try {
      const restId = job.restaurant_id || this.activeRestaurantId;

      // 1. Atomically claim the job to prevent duplicate prints
      const { data: claimed, error: claimErr } = await supabase
        .from('print_jobs')
        .update({
          status: 'printing',
          attempts: (job.attempts || 0) + 1,
        })
        .eq('id', job.id)
        .in('status', ['queued', 'received'])
        .select()
        .maybeSingle();

      if (claimErr || !claimed) {
        // Job was already claimed or cancelled by another runner
        this.inFlightJobIds.delete(job.id);
        this.isProcessing = false;
        return;
      }

      console.log(
        `[WEB_PRINT_STATION_CLAIM]\n` +
        `Job ID: ${job.id}\n` +
        `Job Title: ${job.job_title}\n` +
        `Job Type: ${job.job_type}\n` +
        `Target Printer: ${job.printer_name}`
      );

      // 2. Resolve local connected hardware printer (excluding disconnected printers)
      const localPrinters = webDirectPrintService.getSavedPrinters(restId);
      const hardwarePrinters = localPrinters.filter(
        (p) =>
          (p.transport === 'bluetooth' || p.transport === 'usb' || p.transport === 'serial') &&
          p.status !== 'disconnected'
      );

      if (hardwarePrinters.length === 0) {
        throw new Error('No hardware printers configured on this Web Station.');
      }

      // Try exact or fuzzy match by name
      const normTarget = (job.printer_name || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
      let targetPrinter = hardwarePrinters.find((p) => {
        const pNorm = (p.name || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
        return p.name === job.printer_name || (normTarget && pNorm === normTarget) || (normTarget.includes('925') && pNorm.includes('925'));
      });

      // If not found by name, match by role
      if (!targetPrinter) {
        const eligible = hardwarePrinters.filter((p) => isPrinterRoleEligible(p.role, job.job_type));
        targetPrinter = eligible.find((p) => p.isPrimary) || eligible[0];
      }

      // If still not found, fallback to primary hardware printer or first available
      if (!targetPrinter) {
        targetPrinter = hardwarePrinters.find((p) => p.isPrimary) || hardwarePrinters[0];
      }

      if (!targetPrinter) {
        throw new Error(`Printer "${job.printer_name}" is not available on this station.`);
      }

      // 3. Decode base64 payload
      const binaryData = this.decodeBase64Payload(job.payload_base64);

      console.log(
        `[WEB_PRINT_STATION_DISPATCH]\n` +
        `Job ID: ${job.id}\n` +
        `Document: ${job.job_type.toUpperCase()}\n` +
        `Selected Printer: ${targetPrinter.name}\n` +
        `Transport: ${targetPrinter.transport}\n` +
        `Payload Bytes: ${binaryData.length}`
      );

      // 4. Send ESC/POS binary data to the physical printer
      if (targetPrinter.transport === 'bluetooth') {
        await webDirectPrintService.sendEscPosToBluetooth(
          targetPrinter,
          binaryData,
          job.job_type.toUpperCase(),
          restId,
          false
        );
      } else if (targetPrinter.transport === 'usb') {
        await webDirectPrintService.sendEscPosToUsb(targetPrinter, binaryData);
      } else if (targetPrinter.transport === 'serial') {
        await webDirectPrintService.sendEscPosToSerial(targetPrinter, binaryData);
      } else {
        throw new Error(`Unsupported transport "${targetPrinter.transport}" for station printing.`);
      }

      // 5. Acknowledge job as PRINTED
      await supabase
        .from('print_jobs')
        .update({
          status: 'printed',
          printed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', job.id);

      this.processedJobCount++;
      console.log(
        `[WEB_PRINT_STATION_SUCCESS]\n` +
        `Job ID: ${job.id}\n` +
        `Job Title: ${job.job_title}\n` +
        `Printed on: ${targetPrinter.name}\n` +
        `Status: PRINTED`
      );
    } catch (printErr: any) {
      console.warn(`[WEB_PRINT_STATION_ERROR] Job #${job.id} failed:`, printErr?.message || printErr);

      await supabase
        .from('print_jobs')
        .update({
          status: 'failed',
          error_message: printErr?.message || 'Print execution failed on station',
        })
        .eq('id', job.id);
    } finally {
      this.inFlightJobIds.delete(job.id);
      this.isProcessing = false;
    }
  }

  /**
   * Stops the Web Print Station and clears timers.
   */
  stop(): void {
    this.markStationOffline().catch(() => {});
    this.releaseWakeLock().catch(() => {});
    this.detachLifecycleListeners();

    if (this.realtimeChannel) {
      try {
        supabase.removeChannel(this.realtimeChannel);
      } catch (_) {}
      this.realtimeChannel = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.inFlightJobIds.clear();
    this.isProcessing = false;
    this.activeRestaurantId = null;
    this.isInitialized = false;
  }

  /**
   * Current status inspection.
   */
  getStatus(): WebStationStatus {
    const localPrinters = this.activeRestaurantId
      ? webDirectPrintService.getSavedPrinters(this.activeRestaurantId)
      : [];
    const hw = localPrinters
      .filter((p) => p.transport === 'bluetooth' || p.transport === 'usb' || p.transport === 'serial')
      .map((p) => p.name);

    return {
      isActive: this.isInitialized && Boolean(this.agentToken),
      isMobileStation: this.clientInfo.isMobile,
      restaurantId: this.activeRestaurantId,
      agentId: this.agentId,
      agentToken: this.agentToken,
      pairedPrinters: hw,
      lastHeartbeat: this.lastHeartbeatTime,
      processedJobCount: this.processedJobCount,
      osInfo: this.clientInfo.osInfo,
    };
  }
}

export const webPrintStationService = new WebPrintStationService();

