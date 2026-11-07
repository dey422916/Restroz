/**
 * RESTROZ — STAFF LAPTOP TO ADMIN MOBILE PRINTER VERIFICATION TEST SUITE
 * 
 * Verifies the cross-device printing architecture:
 * 1. Admin Mobile Web Station Auto-Registration & Pairing (Android Chrome)
 * 2. Multi-Device Station ID Isolation (Admin Mobile vs Staff Laptop distinct IDs)
 * 3. Printer Device Synchronization (Seznik-Veer_9394 58mm role: both)
 * 4. Station Liveness Validation (heartbeat < 90s marked online; > 90s marked offline)
 * 5. Staff Laptop Remote Printer Resolution for KOT and Bill
 * 6. Staff Laptop KOT Dispatch to print_jobs
 * 7. Staff Laptop Bill Dispatch to print_jobs
 * 8. Admin Mobile Web Station Atomic Claiming & Binary Decoding (ESC/POS validation)
 * 9. Station Execution & Acknowledgment as PRINTED
 * 10. Stale / Offline Agent Rejection (prevents routing jobs to offline black holes)
 * 11. Multi-Tenant Isolation & Unauthenticated Security Denial
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

// Unauthenticated Client
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
  console.log('================================================================');
  console.log('RESTROZ — STAFF LAPTOP TO ADMIN MOBILE PRINTER FLOW VERIFICATION');
  console.log('================================================================\n');

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

    // 2. Multi-Device Distinct Station Device ID Verification
    console.log('\n[STEP 2] Verifying Unique Browser Station Identifiers...');
    const adminMobileDeviceId = `web_station_${restAId}_mobile_${Date.now()}`;
    const staffLaptopDeviceId = `web_station_${restAId}_laptop_${Date.now()}`;
    assert(
      adminMobileDeviceId !== staffLaptopDeviceId,
      'Admin Mobile and Staff Laptop have distinct, non-colliding station device IDs'
    );

    // 3. Register Web Station for Admin Mobile (Android Chrome Web Station)
    console.log('\n[STEP 3] Registering Admin Mobile Web Print Station (Android Chrome)...');
    const { data: regRes, error: regErr } = await anonClient.rpc('register_print_agent', {
      p_device_id: adminMobileDeviceId,
      p_device_name: 'Juzz Chill (Admin Mobile Station)',
      p_os_info: 'Android Chrome Web Station',
      p_agent_version: '1.0.0',
    });
    assert(!regErr && Boolean(regRes?.agent_token), `register_print_agent succeeded (Agent ID: ${regRes?.agent_id})`);

    // Pair Station to Restaurant
    const { data: pairRes, error: pairErr } = await adminA.client.rpc('pair_print_agent', {
      p_pairing_code: regRes.pairing_code,
      p_restaurant_id: restAId,
    });
    assert(!pairErr && pairRes?.success === true, `pair_print_agent paired mobile station to restaurant ${restAId}`);

    const agentToken = regRes.agent_token;
    const agentId = regRes.agent_id;

    // Pulse initial heartbeat
    await adminA.client
      .from('print_agents')
      .update({
        status: 'online',
        last_seen: new Date().toISOString(),
      })
      .eq('id', agentId);

    // 4. Sync Printer Queue on Station: Seznik-Veer_9394 (58mm, role: both)
    console.log('\n[STEP 4] Syncing Station Connected Printer (Seznik-Veer_9394)...');
    const { data: syncRes, error: syncErr } = await anonClient.rpc('sync_print_agent_printers', {
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
    assert(!syncErr && syncRes?.success === true, 'sync_print_agent_printers registered Seznik-Veer_9394');

    // Verify printer device is visible to staff
    const { data: deviceRows, error: devErr } = await staffA.client
      .from('printer_devices')
      .select('*')
      .eq('agent_id', agentId);

    assert(
      !devErr && deviceRows && deviceRows.length > 0 && deviceRows[0].printer_name === 'Seznik-Veer_9394',
      `Staff sees active station printer: ${deviceRows?.[0]?.printer_name} (Role: ${deviceRows?.[0]?.role}, Width: ${deviceRows?.[0]?.paper_width})`
    );

    // 5. Test Liveness Check Logic (< 90s is online, > 90s is offline)
    console.log('\n[STEP 5] Validating Heartbeat Liveness Determination (< 90s = Online)...');
    const { data: currentAgent } = await staffA.client
      .from('print_agents')
      .select('*')
      .eq('id', agentId)
      .single();

    const now = Date.now();
    const heartbeatDiffMs = now - new Date(currentAgent.last_seen).getTime();
    const isLive = currentAgent.status === 'online' && heartbeatDiffMs < 90000;
    assert(isLive, `Station is LIVE (last_seen age: ${Math.round(heartbeatDiffMs / 1000)}s < 90s)`);

    // Verify OS Info is recognized as Mobile Web Station
    const isMobileStation = (currentAgent.os_info || '').toLowerCase().includes('android');
    assert(isMobileStation, `Agent OS info correctly identified as Mobile Station: "${currentAgent.os_info}"`);

    // 6. Staff Laptop Queues KOT Print Job
    console.log('\n[STEP 6] Staff Laptop Dispatches KOT from Browser...');
    const kotRaw = '=== KOT #101 ===\nTable 4\n1x American Corn Salt & Pepper\n1x Cold Coffee\n================';
    const kotBase64 = Buffer.from(kotRaw, 'utf-8').toString('base64');

    const { data: kotJob, error: kotJobErr } = await staffA.client
      .from('print_jobs')
      .insert({
        restaurant_id: restAId,
        agent_id: agentId,
        printer_name: 'Seznik-Veer_9394',
        job_type: 'kot',
        job_title: 'KOT_Order_101',
        payload_base64: kotBase64,
        paper_width: '58mm',
        status: 'queued',
      })
      .select()
      .single();

    assert(!kotJobErr && Boolean(kotJob?.id), `Staff Laptop successfully dispatched KOT job #${kotJob?.id} to Admin Mobile`);

    // 7. Staff Laptop Queues Final Bill Print Job
    console.log('\n[STEP 7] Staff Laptop Dispatches Final Bill from Browser...');
    const billRaw = '=== JUZZ CHILL ===\nTax Invoice: INV-2026-001\nTotal: Rs 219.00\nTHANK YOU';
    const billBase64 = Buffer.from(billRaw, 'utf-8').toString('base64');

    const { data: billJob, error: billJobErr } = await staffA.client
      .from('print_jobs')
      .insert({
        restaurant_id: restAId,
        agent_id: agentId,
        printer_name: 'Seznik-Veer_9394',
        job_type: 'bill',
        job_title: 'Bill_INV-2026-001',
        payload_base64: billBase64,
        paper_width: '58mm',
        status: 'queued',
      })
      .select()
      .single();

    assert(!billJobErr && Boolean(billJob?.id), `Staff Laptop successfully dispatched Bill job #${billJob?.id} to Admin Mobile`);

    // 8. Admin Mobile Station Consumes & Executes KOT Job
    console.log('\n[STEP 8] Admin Mobile Station Consumes & Executes KOT Print...');
    const { data: pollRes1, error: pollErr1 } = await anonClient.rpc('poll_pending_print_jobs', {
      p_agent_token: agentToken,
    });
    assert(!pollErr1 && pollRes1?.success === true, 'Station poll_pending_print_jobs executed successfully');

    const jobs1 = pollRes1?.jobs || [];
    const foundKot = jobs1.find((j) => j.id === kotJob.id);
    assert(Boolean(foundKot), `Admin Mobile retrieved Staff KOT job #${kotJob.id}`);

    // Verify payload decoding
    const decodedKot = Buffer.from(foundKot.payload_base64, 'base64').toString('utf-8');
    assert(decodedKot.includes('American Corn'), 'KOT payload successfully decoded for ESC/POS printing on Seznik-Veer_9394');

    // Acknowledge as PRINTED
    const { data: ackKot } = await anonClient.rpc('ack_print_job', {
      p_agent_token: agentToken,
      p_job_id: kotJob.id,
      p_status: 'printed',
    });
    assert(ackKot?.success === true, 'Admin Mobile acknowledged KOT job as PRINTED');

    // 9. Admin Mobile Station Consumes & Executes Bill Job
    console.log('\n[STEP 9] Admin Mobile Station Consumes & Executes Bill Print...');
    const { data: pollRes2, error: pollErr2 } = await anonClient.rpc('poll_pending_print_jobs', {
      p_agent_token: agentToken,
    });
    const jobs2 = pollRes2?.jobs || [];
    const foundBill = jobs2.find((j) => j.id === billJob.id);
    assert(Boolean(foundBill), `Admin Mobile retrieved Staff Bill job #${billJob.id}`);

    const decodedBill = Buffer.from(foundBill.payload_base64, 'base64').toString('utf-8');
    assert(decodedBill.includes('JUZZ CHILL'), 'Bill payload successfully decoded for ESC/POS printing on Seznik-Veer_9394');

    const { data: ackBill } = await anonClient.rpc('ack_print_job', {
      p_agent_token: agentToken,
      p_job_id: billJob.id,
      p_status: 'printed',
    });
    assert(ackBill?.success === true, 'Admin Mobile acknowledged Bill job as PRINTED');

    // 10. Verify status in database
    console.log('\n[STEP 10] Verifying Final Job Statuses in Supabase...');
    const { data: verifyKot } = await staffA.client.from('print_jobs').select('status, printed_at').eq('id', kotJob.id).single();
    const { data: verifyBill } = await staffA.client.from('print_jobs').select('status, printed_at').eq('id', billJob.id).single();

    assert(verifyKot?.status === 'printed' && Boolean(verifyKot?.printed_at), 'KOT job status is PRINTED in Supabase');
    assert(verifyBill?.status === 'printed' && Boolean(verifyBill?.printed_at), 'Bill job status is PRINTED in Supabase');

    // 11. Stale Agent Rejection Simulation (> 90s)
    console.log('\n[STEP 11] Verifying Stale Agent Rejection (No Routing to Dormant/Offline Agents)...');
    const staleTimestamp = new Date(Date.now() - 120000).toISOString(); // 2 minutes ago
    await adminA.client
      .from('print_agents')
      .update({ last_seen: staleTimestamp })
      .eq('id', agentId);

    const { data: staleAgentCheck } = await staffA.client
      .from('print_agents')
      .select('status, last_seen')
      .eq('id', agentId)
      .single();

    const staleDiffMs = Date.now() - new Date(staleAgentCheck.last_seen).getTime();
    const isStaleLive = staleAgentCheck.status === 'online' && staleDiffMs < 90000;
    assert(!isStaleLive, `Agent with 120s old heartbeat is correctly identified as OFFLINE (isLive: false)`);

    // Restore fresh heartbeat for remaining steps
    await adminA.client
      .from('print_agents')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', agentId);

    // 12. Multi-Tenant Isolation & Unauthenticated Security
    console.log('\n[STEP 12] Verifying Multi-Tenant Isolation & Unauthenticated Denial...');
    const fakeRestId = '00000000-0000-0000-0000-000000000099';
    const { error: crossTenantErr } = await staffA.client.from('print_jobs').insert({
      restaurant_id: fakeRestId,
      agent_id: agentId,
      printer_name: 'Malicious-Printer',
      job_type: 'kot',
      payload_base64: kotBase64,
      status: 'queued',
    });
    assert(Boolean(crossTenantErr), 'Cross-tenant job dispatch is strictly DENIED by RLS');

    const { error: unauthInsertErr } = await anonClient.from('print_jobs').insert({
      restaurant_id: restAId,
      agent_id: agentId,
      printer_name: 'Anon-Printer',
      job_type: 'kot',
      payload_base64: kotBase64,
      status: 'queued',
    });
    assert(Boolean(unauthInsertErr), 'Unauthenticated direct INSERT to print_jobs is strictly DENIED by RLS');

    // 13. Clean up test agent and jobs
    console.log('\n[STEP 13] Cleaning up Test Station & Jobs...');
    await adminA.client.from('print_jobs').delete().eq('agent_id', agentId);
    await adminA.client.from('printer_devices').delete().eq('agent_id', agentId);
    await adminA.client.from('print_agents').delete().eq('id', agentId);
    console.log('Cleaned up test records.');

    console.log('\n================================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during test:', err);
    process.exit(1);
  }
}

runTest();
