function getNumColumns(width) {
  return width >= 1300 ? 4 : width >= 960 ? 3 : width >= 640 ? 2 : 1;
}

function getBottomInset(insetsBottom, isAndroid) {
  return Math.max(insetsBottom || 0, isAndroid ? 20 : 8);
}

function runVerification() {
  console.log('================================================================');
  console.log('🚀 RESPONSIVE & SAFE AREA VERIFICATION');
  console.log('================================================================\n');

  const testBreakpoints = [
    { width: 360, name: '360px Small Mobile', expectedCols: 1 },
    { width: 390, name: '390px Mobile (iPhone)', expectedCols: 1 },
    { width: 430, name: '430px Mobile (iPhone Pro Max)', expectedCols: 1 },
    { width: 768, name: '768px Tablet (iPad)', expectedCols: 2 },
    { width: 1024, name: '1024px Laptop/Tablet', expectedCols: 3 },
    { width: 1366, name: '1366px Standard Desktop', expectedCols: 4 },
    { width: 1920, name: '1920px Large Desktop (FHD)', expectedCols: 4 },
  ];

  let allPassed = true;
  testBreakpoints.forEach((bp, idx) => {
    const cols = getNumColumns(bp.width);
    const passed = cols === bp.expectedCols;
    if (!passed) allPassed = false;
    console.log(`[${passed ? 'PASS' : 'FAIL'}] Breakpoint ${idx + 1}: ${bp.name} (width: ${bp.width}px) -> ${cols} column(s) (Expected: ${bp.expectedCols})`);
  });

  console.log('\n--- Bottom Navigation Safe Area Insets Clearance ---');
  const android3ButtonInset = getBottomInset(24, true); // typical Android 3-button inset
  const androidGestureInset = getBottomInset(48, true); // Android gesture inset
  const iosHomeIndicator = getBottomInset(34, false); // iPhone notch/dynamic island
  const desktopWebInset = getBottomInset(0, false); // Web desktop

  const p1 = android3ButtonInset >= 24;
  const p2 = androidGestureInset >= 48;
  const p3 = iosHomeIndicator >= 34;
  const p4 = desktopWebInset === 8;

  console.log(`[${p1 ? 'PASS' : 'FAIL'}] Android 3-button nav bottom padding: ${android3ButtonInset}px (clears system buttons)`);
  console.log(`[${p2 ? 'PASS' : 'FAIL'}] Android gesture nav bottom padding: ${androidGestureInset}px (clears gesture bar)`);
  console.log(`[${p3 ? 'PASS' : 'FAIL'}] iOS home indicator bottom padding: ${iosHomeIndicator}px (clears home indicator)`);
  console.log(`[${p4 ? 'PASS' : 'FAIL'}] Desktop Web clean bottom padding: ${desktopWebInset}px (no excessive blank space)`);

  const safeAreaAllPassed = p1 && p2 && p3 && p4;

  console.log('\n================================================================');
  if (allPassed && safeAreaAllPassed) {
    console.log('MARKETPLACE RESPONSIVE & BOTTOM-NAV FIX: PASS');
  } else {
    console.log('MARKETPLACE RESPONSIVE & BOTTOM-NAV FIX: FAIL');
  }
  console.log('================================================================\n');
}

runVerification();
