import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://jdfoxuewvkhvlyejzldm.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkZm94dWV3dmtodmx5ZWp6bGRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAwNDkxNTAsImV4cCI6MjA1NTYyNTE1MH0.2WqgQ_T9rU0t-z1kY8zZcMfZ4e5i_7x1O-y5V9x9w4Y';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runAuthFlowVerification() {
  console.log('--- 🧪 STARTING RATNADEEP POS AUTH FLOW VERIFICATION ---');

  // Test 1: Malicious Public Signup with role=ADMIN
  console.log('\n[TEST 1] Attempting public signup with injected metadata role="ADMIN"...');
  const testEmail = `malicious_test_${Date.now()}@example.com`;
  const { data: signupData, error: signupError } = await supabase.auth.signUp({
    email: testEmail,
    password: 'Password123!',
    options: {
      data: {
        full_name: 'Hacker User',
        role: 'ADMIN', // Injected role attempt
      },
    },
  });

  if (signupError) {
    console.log('⚠️ Signup response:', signupError.message);
  } else if (signupData.user) {
    console.log('✅ User registered in Supabase Auth:', signupData.user.id);

    // Query profiles table to verify server-side role assignment
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', signupData.user.id)
      .single();

    if (profile) {
      console.log(`✅ Profile row role in DB: "${profile.role}"`);
      if (profile.role === 'CUSTOMER') {
        console.log('🎯 PASSED: Server successfully forced role="CUSTOMER" despite client injection of "ADMIN"!');
      } else {
        console.log('❌ FAILED: Profile role was allowed as privileged role:', profile.role);
      }
    } else {
      console.log('ℹ️ Profile row deferred to verification trigger.');
    }
  }

  // Test 2: Verify Password Reset Request
  console.log('\n[TEST 2] Testing Password Reset flow...');
  const { error: resetError } = await supabase.auth.resetPasswordForEmail('ratnadeepdey13@gmail.com', {
    redirectTo: 'ratnadeep-pos://(auth)/reset-password',
  });

  if (!resetError) {
    console.log('🎯 PASSED: Supabase password reset email request sent successfully with deep link.');
  } else {
    console.log('⚠️ Password reset info:', resetError.message);
  }

  console.log('\n--- 🚀 ALL VERIFICATION CHECKS COMPLETED ---');
}

runAuthFlowVerification().catch(console.error);
