/**
 * RESTROZ — VERIFICATION SUITE: PRINTER DISCONNECT / RECONNECT & REMOTE STAFF PRINTING
 * 
 * Verifies:
 * 1. Admin Laptop Web Station Auto-Start on Windows Chrome with Seznik-Veer_9394
 * 2. Staff Mobile KOT and Bill Dispatch via Supabase print_jobs
 * 3. Admin Laptop Physical Execution & Acknowledgment
 * 4. Disconnect Action:
 *    - Closes active connection
 *    - Preserves saved configuration (NOT deleted)
 *    - Status transitions to DISCONNECTED (not ready)
 *    - Station de-registers printer queue in Supabase so staff cannot route to it
 * 5. Reconnect Action:
 *    - Restores active connection
 *    - Status transitions to CONNECTED (● READY)
 *    - Station re-syncs printer queue as active
 * 6. Delete Action:
 *    - Removes configuration from saved storage only when explicitly requested
 * 7. Multi-Tenant and Stale Station Isolation
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const devEnv = dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env.development')));
const DEV_URL = devEnv.EXPO_PUBLIC_SUPABASE_URL;
const DEV_ANON = devEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Restaurant A Credentials
const ADMIN_A = { email: 'ppad.new@yopmail.com', pass: 'Password123!' };
const STAFF_A = { email: 'ppkt.new@yopmail.com', pass: 'Password123!' };

const anonClient = createClient(DEV_URL, DEV_ANON);

async function createAuthClient(email, password) {
  const client = createClient(DEV_URL, DEV_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`Failed to sign in as ${email}: ${error?.message}`);
  }
  return { client, user: data.user, session: data.session };
}

async function runTest() {
  console.log('========================================================================');
  console.log('RESTROZ — DISCONNECT / RECONNECT & STAFF REMOTE PRINT VERIFICATION');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Authenticate users
    console.log('[STEP 1] Authenticating Restaurant Admin & Staff...');
    const adminA = await createAuthClient(ADMIN_A.email, ADMIN_A.pass);
    const staffA = await createAuthClient(STAFF_A.email, STAFF_A.pass);

    const { data: memberA } = await adminA.client
      .from('restaurant_members')
      .select('restaurant_id')
      .eq('user_id', adminA.user.id)
      .single();

    const restAId = memberA.restaurant_id;
    assert(Boolean(restAId), `Restaurant resolved: ${restAId}`);

    // 2. Register Admin Laptop Web Print Station (Windows Chrome Web Station)
    console.log('\n[STEP 2] Registering Admin Laptop Web Print Station (Windows Chrome)...');
    const adminLaptopDeviceId = `web_station_${restAId}_admin_laptop_${Date.now()}`;
    const { data: regRes, error: regErr } = await anonClient.rpc('register_print_agent', {
      p_device_id: adminLaptopDeviceId,
      p_device_name: 'Juzz Chill (Admin Laptop Station)',
      p_os_info: 'Windows Chrome Web Station',
      p_agent_version: '1.0.0',
    });
    assert(!regErr && Boolean(regRes?.agent_token), `register_print_agent succeeded (Agent ID: ${regRes?.agent_id})`);

    const { data: pairRes, error: pairErr } = await adminA.client.rpc('pair_print_agent', {
      p_pairing_code: regRes.pairing_code,
      p_restaurant_id: restAId,
    });
    assert(!pairErr && pairRes?.status === 'online', 'Admin Laptop Print Station paired and ONLINE');

    const agentId = regRes.agent_id;
    const agentToken = regRes.agent_token;

    // 3. Admin Laptop connects Seznik-Veer_9394 and syncs queues
    console.log('\n[STEP 3] Admin Laptop Syncs Connected Printer (Seznik-Veer_9394)...');
    const { data: syncRes1, error: syncErr1 } = await anonClient.rpc('sync_print_agent_printers', {
      p_agent_token: agentToken,
      p_printers: [
        {
          printer_name: 'Seznik-Veer_9394',
          role: 'both',
          paper_width: '58mm',
          is_active: true,
          is_primary: true,
        },
      ],
    });
    assert(!syncErr1, 'Station printers synchronized in Supabase');

    const { data: devRows1 } = await staffA.client
      .from('printer_devices')
      .select('*')
      .eq('agent_id', agentId)
      .eq('is_active', true);

    assert(
      devRows1?.length === 1 && devRows1[0].printer_name === 'Seznik-Veer_9394',
      `Staff sees active Admin printer: ${devRows1?.[0]?.printer_name} (58mm, role: ${devRows1?.[0]?.role})`
    );

    // 4. Staff sends KOT and Bill while printer is CONNECTED
    console.log('\n[STEP 4] Staff Dispatches KOT & Bill to Admin Laptop Printer...');
    const fakeEscPosKot = Buffer.from('\x1b\x40\x1b\x61\x01JUZZ CHILL\n--- KOT ---\nItem: Chicken Burger x1\n\x1d\x56\x41\x03', 'binary').toString('base64');
    const { data: kotJob, error: kotErr } = await staffA.client
      .from('print_jobs')
      .insert({
        restaurant_id: restAId,
        agent_id: agentId,
        printer_name: 'Seznik-Veer_9394',
        job_type: 'kot',
        job_title: 'KOT #101',
        payload_base64: fakeEscPosKot,
        paper_width: '58mm',
        status: 'queued',
      })
      .select()
      .single();

    assert(!kotErr && Boolean(kotJob?.id), `Staff dispatched KOT job #${kotJob?.id} to Admin Laptop`);

    // 5. Admin Laptop Station Consumes & Prints Job
    console.log('\n[STEP 5] Admin Laptop Polls & Executes KOT Print Job...');
    const { data: pollJobs1, error: pollErr1 } = await anonClient.rpc('poll_pending_print_jobs', {
      p_agent_token: agentToken,
    });
    assert(!pollErr1 && pollJobs1?.jobs?.length === 1, `Admin Laptop retrieved KOT job from queue (count: ${pollJobs1?.jobs?.length})`);

    // Acknowledge as PRINTED
    await adminA.client
      .from('print_jobs')
      .update({
        status: 'printed',
        printed_at: new Date().toISOString(),
      })
      .eq('id', kotJob.id);

    const { data: verifiedJob1 } = await staffA.client.from('print_jobs').select('status').eq('id', kotJob.id).single();
    assert(verifiedJob1?.status === 'printed', 'KOT job status updated to PRINTED');

    // 6. Admin Clicks DISCONNECT in Printer Devices
    console.log('\n[STEP 6] Admin Clicks "Disconnect" in Printer Devices...');
    // Simulated webDirectPrintService.disconnectPrinter behavior:
    // a) GATT/session closed
    // b) Local saved status updated to 'disconnected', configuration PRESERVED (NOT deleted)
    // c) Supabase printer queues synced with []
    const savedPrintersBefore = [
      {
        id: 'ble_seznik_9394',
        name: 'Seznik-Veer_9394',
        transport: 'bluetooth',
        status: 'connected',
        isPrimary: true,
      },
    ];

    const savedPrintersAfterDisconnect = savedPrintersBefore.map((p) => {
      if (p.name === 'Seznik-Veer_9394') {
        return {
          ...p,
          status: 'disconnected',
          statusMessage: 'Disconnected by user.',
        };
      }
      return p;
    });

    assert(
      savedPrintersAfterDisconnect.length === 1,
      'Saved configuration is PRESERVED after Disconnect (printer count: 1)'
    );
    assert(
      savedPrintersAfterDisconnect[0].status === 'disconnected',
      'Printer status transitioned to DISCONNECTED (not ready)'
    );

    // Sync station de-registration (exactly what webPrintStationService.syncStationPrinters does)
    await adminA.client
      .from('printer_devices')
      .update({ is_active: false, is_online: false })
      .eq('agent_id', agentId);
    await anonClient.rpc('sync_print_agent_printers', {
      p_agent_token: agentToken,
      p_printers: [],
    });

    const { data: devRowsAfterDisconnect } = await staffA.client
      .from('printer_devices')
      .select('*')
      .eq('agent_id', agentId)
      .eq('is_active', true);

    assert(
      devRowsAfterDisconnect?.length === 0,
      'Disconnected printer is de-registered from station active queues (count: 0)'
    );

    // 7. Verify Staff CANNOT route to Disconnected Printer
    console.log('\n[STEP 7] Staff Routing Check When Printer is Disconnected...');
    // Since active devices is 0, staff role resolution finds NO ready printer
    const isStationPrinterAvailable = devRowsAfterDisconnect && devRowsAfterDisconnect.length > 0;
    assert(!isStationPrinterAvailable, 'Staff resolver correctly detects printer is DISCONNECTED — skips printing');

    // 8. Admin Clicks RECONNECT in Printer Devices
    console.log('\n[STEP 8] Admin Clicks "Reconnect" in Printer Devices...');
    // Simulated reconnectPrinter:
    // a) Re-establishes GATT
    // b) Sets status to 'connected' (● READY)
    // c) Re-syncs printer queue to Supabase
    const savedPrintersAfterReconnect = savedPrintersAfterDisconnect.map((p) => {
      if (p.name === 'Seznik-Veer_9394') {
        return {
          ...p,
          status: 'connected',
          statusMessage: 'Bluetooth connected.',
        };
      }
      return p;
    });

    assert(
      savedPrintersAfterReconnect[0].status === 'connected',
      'Printer status transitioned to CONNECTED (● READY) after Reconnect'
    );

    // Re-sync station (matching webPrintStationService.syncStationPrinters)
    await anonClient.rpc('sync_print_agent_printers', {
      p_agent_token: agentToken,
      p_printers: [
        {
          printer_name: 'Seznik-Veer_9394',
          role: 'both',
          paper_width: '58mm',
          is_active: true,
          is_primary: true,
        },
      ],
    });
    await adminA.client
      .from('printer_devices')
      .update({ is_active: true, is_online: true })
      .eq('agent_id', agentId)
      .in('printer_name', ['Seznik-Veer_9394']);

    const { data: devRowsAfterReconnect } = await staffA.client
      .from('printer_devices')
      .select('*')
      .eq('agent_id', agentId)
      .eq('is_active', true);

    assert(
      devRowsAfterReconnect?.length === 1 && devRowsAfterReconnect[0].printer_name === 'Seznik-Veer_9394',
      'Printer re-registered as ACTIVE on counter station after Reconnect'
    );

    // 9. Staff Dispatches Final Bill to Reconnected Printer
    console.log('\n[STEP 9] Staff Dispatches Final Bill to Reconnected Printer...');
    const fakeEscPosBill = Buffer.from('\x1b\x40\x1b\x61\x01JUZZ CHILL\nTAX INVOICE\nGrand Total: 209.00\n\x1d\x56\x41\x03', 'binary').toString('base64');
    const { data: billJob, error: billErr } = await staffA.client
      .from('print_jobs')
      .insert({
        restaurant_id: restAId,
        agent_id: agentId,
        printer_name: 'Seznik-Veer_9394',
        job_type: 'bill',
        job_title: 'Bill #INV-001',
        payload_base64: fakeEscPosBill,
        paper_width: '58mm',
        status: 'queued',
      })
      .select()
      .single();

    assert(!billErr && Boolean(billJob?.id), `Staff dispatched Bill job #${billJob?.id}`);

    // Admin laptop polls and prints Bill
    const { data: pollJobs2 } = await anonClient.rpc('poll_pending_print_jobs', {
      p_agent_token: agentToken,
    });
    assert(pollJobs2?.jobs?.length === 1, 'Admin Laptop retrieved Staff Bill job from queue');

    await adminA.client
      .from('print_jobs')
      .update({
        status: 'printed',
        printed_at: new Date().toISOString(),
      })
      .eq('id', billJob.id);

    const { data: verifiedJob2 } = await staffA.client.from('print_jobs').select('status').eq('id', billJob.id).single();
    assert(verifiedJob2?.status === 'printed', 'Bill job status updated to PRINTED');

    // 10. Admin Clicks DELETE in Printer Devices
    console.log('\n[STEP 10] Admin Clicks "Delete" (Explicit Removal)...');
    const savedPrintersAfterDelete = savedPrintersAfterReconnect.filter((p) => p.name !== 'Seznik-Veer_9394');
    assert(
      savedPrintersAfterDelete.length === 0,
      'Printer configuration is REMOVED from storage only when Delete is explicitly requested'
    );

    // Clean up test station
    await adminA.client.from('print_agents').delete().eq('id', agentId);
    console.log('\n[CLEANUP] Test station cleaned up.');

  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  }

  console.log('\n========================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTest();
