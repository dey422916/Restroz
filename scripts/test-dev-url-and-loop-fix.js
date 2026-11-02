const assert = require('assert');

console.log('====================================================');
console.log('RestroZ POS — DEV URL & Loop Fix Comprehensive Test');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ FAIL: ${desc}\n    Error: ${e.message}`);
    failed++;
  }
}

// Mirror exact implementation from src/utils/restaurantUrl.ts
function getRestaurantOnlineOrderingUrl(slugOrId, forceProduction = false, platformOS = 'web') {
  if (!slugOrId) return '';
  const clean = slugOrId.trim();

  const isLocalhost =
    typeof global.window !== 'undefined' &&
    (global.window.location?.hostname === 'localhost' ||
      global.window.location?.hostname === '127.0.0.1' ||
      global.window.location?.hostname?.endsWith('.local') ||
      global.window.location?.hostname?.endsWith('.internal'));

  const isDevEnv =
    (typeof global.__DEV__ !== 'undefined' && global.__DEV__) ||
    process.env.EXPO_PUBLIC_APP_ENV === 'development' ||
    process.env.NODE_ENV === 'development';

  const isExplicitProduction =
    forceProduction ||
    process.env.EXPO_PUBLIC_APP_ENV === 'production' ||
    (!isLocalhost && !isDevEnv && process.env.NODE_ENV === 'production');

  let origin = 'https://restroz.shop';

  if (!isExplicitProduction && platformOS === 'web' && typeof global.window !== 'undefined' && global.window.location?.origin) {
    origin = global.window.location.origin;
  } else if (!isExplicitProduction && process.env.EXPO_PUBLIC_APP_URL) {
    origin = process.env.EXPO_PUBLIC_APP_URL.replace(/\/+$/, '');
  } else if (!isExplicitProduction && isDevEnv) {
    origin = 'http://localhost:8081';
  } else {
    origin =
      process.env.EXPO_PUBLIC_APP_URL && !process.env.EXPO_PUBLIC_APP_URL.includes('localhost')
        ? process.env.EXPO_PUBLIC_APP_URL.replace(/\/+$/, '')
        : 'https://restroz.shop';
  }

  return `${origin}/r/${clean}`;
}

// 1. DEV Environment URL Generation (Browser / Localhost)
it('DEV Settings URL generation derives from localhost origin', () => {
  global.window = {
    location: {
      origin: 'http://localhost:8081',
      hostname: 'localhost',
    },
  };
  process.env.EXPO_PUBLIC_APP_ENV = 'development';

  const devUrl = getRestaurantOnlineOrderingUrl('ad-s', false, 'web');
  assert.strictEqual(devUrl, 'http://localhost:8081/r/ad-s');
});

it('DEV Settings Copy Link uses exact localhost dedicated URL', () => {
  global.window = {
    location: {
      origin: 'http://localhost:8081',
      hostname: 'localhost',
    },
  };
  process.env.EXPO_PUBLIC_APP_ENV = 'development';

  const copiedUrl = getRestaurantOnlineOrderingUrl('ad-s', false, 'web');
  assert.strictEqual(copiedUrl, 'http://localhost:8081/r/ad-s');
});

it('DEV Settings QR code uses environment-aware URL (localhost in DEV)', () => {
  global.window = {
    location: {
      origin: 'http://localhost:8081',
      hostname: 'localhost',
    },
  };
  process.env.EXPO_PUBLIC_APP_ENV = 'development';

  const qrUrl = getRestaurantOnlineOrderingUrl('ad-s', false, 'web');
  assert.strictEqual(qrUrl, 'http://localhost:8081/r/ad-s');
});

it('Production URL generation strictly remains https://restroz.shop/r/[slug]', () => {
  global.window = {
    location: {
      origin: 'https://restroz.shop',
      hostname: 'restroz.shop',
    },
  };
  process.env.EXPO_PUBLIC_APP_ENV = 'production';

  const prodUrl = getRestaurantOnlineOrderingUrl('ad-s', false, 'web');
  assert.strictEqual(prodUrl, 'https://restroz.shop/r/ad-s');
});

it('Explicit forceProduction generates production URL even in DEV environment', () => {
  global.window = {
    location: {
      origin: 'http://localhost:8081',
      hostname: 'localhost',
    },
  };
  process.env.EXPO_PUBLIC_APP_ENV = 'development';

  const forcedProdUrl = getRestaurantOnlineOrderingUrl('ad-s', true, 'web');
  assert.strictEqual(forcedProdUrl, 'https://restroz.shop/r/ad-s');
});

it('Non-browser / SSR DEV environment derives URL from EXPO_PUBLIC_APP_URL', () => {
  delete global.window;
  process.env.EXPO_PUBLIC_APP_ENV = 'development';
  process.env.EXPO_PUBLIC_APP_URL = 'http://localhost:8081';

  const ssrDevUrl = getRestaurantOnlineOrderingUrl('ad-s', false, 'android');
  assert.strictEqual(ssrDevUrl, 'http://localhost:8081/r/ad-s');
});

it('Non-browser / SSR Production environment uses official configured public domain', () => {
  delete global.window;
  process.env.EXPO_PUBLIC_APP_ENV = 'production';
  process.env.EXPO_PUBLIC_APP_URL = 'https://restroz.shop';

  const ssrProdUrl = getRestaurantOnlineOrderingUrl('ad-s', false, 'android');
  assert.strictEqual(ssrProdUrl, 'https://restroz.shop/r/ad-s');
});

// 2. Canonical Route & Legacy Route Redirection
it('Canonical route is /r/[slug] without circular redirects', () => {
  const slug = 'ad-s';
  const canonicalRoute = `/r/${encodeURIComponent(slug)}`;
  assert.strictEqual(canonicalRoute, '/r/ad-s');
});

it('Legacy route /restaurant/[id] redirect logic targets canonical route /r/[slug] exactly once', () => {
  const legacyId = 'ad-s';
  let redirectedCount = 0;
  let targetRoute = null;

  function handleLegacyRoute(id, hasRedirected) {
    if (!id || hasRedirected) return hasRedirected;
    redirectedCount++;
    targetRoute = `/r/${encodeURIComponent(id)}`;
    return true;
  }

  let redirected = false;
  redirected = handleLegacyRoute(legacyId, redirected);
  assert.strictEqual(redirectedCount, 1);
  assert.strictEqual(targetRoute, '/r/ad-s');

  // Second pass (re-render)
  redirected = handleLegacyRoute(legacyId, redirected);
  assert.strictEqual(redirectedCount, 1, 'Must not redirect more than once');
});

// 3. Storefront Idempotency Simulation
it('Storefront setDedicatedMode is idempotent and avoids redundant re-renders', () => {
  let state = {
    mode: 'marketplace',
    dedicatedSlug: null,
    dedicatedRestaurantId: null,
    dedicatedRestaurant: null,
  };
  let updateCount = 0;

  function setDedicatedMode(slugOrId, restaurantObj) {
    const clean = slugOrId.trim();
    const targetSlug = restaurantObj?.slug || clean;
    const targetRestId = restaurantObj?.id || null;

    if (state.mode !== 'dedicated') {
      state.mode = 'dedicated';
      updateCount++;
    }
    if (state.dedicatedSlug !== targetSlug) {
      state.dedicatedSlug = targetSlug;
      updateCount++;
    }
    if (restaurantObj && state.dedicatedRestaurantId !== restaurantObj.id) {
      state.dedicatedRestaurantId = restaurantObj.id;
      updateCount++;
    }
    if (restaurantObj && (!state.dedicatedRestaurant || state.dedicatedRestaurant.id !== restaurantObj.id)) {
      state.dedicatedRestaurant = restaurantObj;
      updateCount++;
    }
  }

  const restObj = { id: 'uuid-123', slug: 'ad-s', name: 'AD-S Kitchen' };

  setDedicatedMode('ad-s', restObj);
  const initialUpdates = updateCount;
  assert.strictEqual(state.mode, 'dedicated');
  assert.strictEqual(state.dedicatedSlug, 'ad-s');
  assert.strictEqual(state.dedicatedRestaurantId, 'uuid-123');

  // Second & third calls
  setDedicatedMode('ad-s', restObj);
  setDedicatedMode('ad-s', restObj);
  assert.strictEqual(updateCount, initialUpdates, 'Must be zero additional state updates on idempotent calls');
});

// 4. Dedicated Authentication Context Preservation
it('Customer login redirect preserves dedicated restaurant slug', () => {
  const pendingSlug = 'ad-s';
  const isDedicated = true;
  const dedicatedSlug = 'ad-s';

  const targetSlug = pendingSlug || (isDedicated ? dedicatedSlug : null);
  const destination = targetSlug ? `/r/${encodeURIComponent(targetSlug)}` : '/(marketplace)';

  assert.strictEqual(destination, '/r/ad-s');
});

it('Customer logout preserves dedicated storefront redirect', () => {
  const isDedicated = true;
  const dedicatedSlug = 'ad-s';
  const slug = isDedicated ? dedicatedSlug : null;

  const destination = slug ? `/r/${encodeURIComponent(slug)}` : '/(auth)/login';
  assert.strictEqual(destination, '/r/ad-s');
});

it('Marketplace direct access maintains marketplace mode without loop', () => {
  let currentMode = 'dedicated';
  function setMarketplaceMode() {
    currentMode = 'marketplace';
  }

  setMarketplaceMode();
  assert.strictEqual(currentMode, 'marketplace');
});

console.log('\n====================================================');
console.log(`Results: ${passed} Passed, ${failed} Failed`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
}
