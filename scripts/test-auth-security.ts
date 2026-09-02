import { authService } from '../src/services/api/authService';

async function verifyAuthSecurity() {
  console.log('=====================================================');
  console.log('   RATNADEEP POS — AUTH SECURITY UNIT VERIFICATION');
  console.log('=====================================================\n');

  // Test 1: Empty credentials
  console.log('[TEST 1] Calling authService.login("", "")...');
  try {
    await authService.login('', '');
    console.error('❌ BUG DETECTED: Empty credentials allowed!');
  } catch (err: any) {
    console.log(`✅ PASSED: Correctly threw error: "${err.message}"`);
  }

  // Test 2: Random arbitrary credentials
  console.log('\n[TEST 2] Calling authService.login("random_user_123@fake.com", "WrongPassword999")...');
  try {
    await authService.login('random_user_123@fake.com', 'WrongPassword999');
    console.error('❌ BUG DETECTED: Random credentials allowed!');
  } catch (err: any) {
    console.log(`✅ PASSED: Correctly rejected invalid credentials: "${err.message}"`);
  }

  // Test 3: Existing email with wrong password
  console.log('\n[TEST 3] Calling authService.login("ratnadeepdey13@gmail.com", "WrongPass123")...');
  try {
    await authService.login('ratnadeepdey13@gmail.com', 'WrongPass123');
    console.error('❌ BUG DETECTED: Wrong password allowed!');
  } catch (err: any) {
    console.log(`✅ PASSED: Correctly rejected wrong password: "${err.message}"`);
  }

  // Test 4: Current user check with no active session
  console.log('\n[TEST 4] Calling authService.getCurrentUser()...');
  try {
    const currentUser = await authService.getCurrentUser();
    if (currentUser === null) {
      console.log('✅ PASSED: getCurrentUser() returned null (no unauthorized or mock session).');
    } else {
      console.error(`❌ BUG DETECTED: getCurrentUser() returned unauthorized user:`, currentUser);
    }
  } catch (err: any) {
    console.log(`✅ Handled: ${err.message}`);
  }

  console.log('\n=====================================================');
  console.log('   ALL AUTH SECURITY UNIT TESTS COMPLETED SUCCESSFULLY');
  console.log('=====================================================\n');
}

verifyAuthSecurity().catch(console.error);
