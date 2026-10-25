/**
 * Cloudflare Worker for RestroZ POS & Marketing Platform
 * - Canonical 301 redirects (www -> non-www, http -> https)
 * - Single-Page-Application (SPA) client-side routing
 * - Google Search Console / SEO headers & dynamic canonical tags
 * - Strict noindex protection for private POS and admin routes
 * - Fast static asset delivery via Cloudflare Assets
 */

const CANONICAL_HOST = 'restroz.shop';
const SITE_ORIGIN = `https://${CANONICAL_HOST}`;

// Private POS, Administrative, and Authentication Routes
const PRIVATE_ROUTE_PREFIXES = [
  '/dashboard',
  '/pos',
  '/orders',
  '/products',
  '/categories',
  '/tables',
  '/kot-screen',
  '/staff',
  '/settings',
  '/printers',
  '/coupons',
  '/my-plan',
  '/bulk-import',
  '/super-admin',
  '/admin',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/cart',
  '/checkout',
  '/profile',
  '/addresses',
  '/order',
  '/api',
];

function isPrivateRoute(pathname) {
  const cleanPath = (pathname || '').toLowerCase();
  return PRIVATE_ROUTE_PREFIXES.some(
    (prefix) => cleanPath === prefix || cleanPath.startsWith(prefix + '/')
  );
}

// SEO Titles and Descriptions by Path
const PUBLIC_PAGE_META = {
  '/': {
    title: 'RestroZ — Restaurant POS & Management Software | Cloud Billing & KOT',
    description:
      'RestroZ is the modern all-in-one cloud restaurant POS and billing platform. Features lightning-fast KOT printing, table-side waiter app, digital QR ordering, billing, inventory, and multi-outlet management.',
    keywords:
      'restaurant POS software, restaurant billing software, KOT printing software, cloud restaurant POS, restaurant management software, QR digital menu, waiter ordering app, restaurant inventory management, multi-outlet restaurant software, RestroZ POS',
  },
  '/info': {
    title: 'RestroZ — Complete Restaurant Management & Cloud POS System',
    description:
      'From orders to happy customers — RestroZ is the modern cloud restaurant POS software with table-side waiter app, KOT printing, QR menu, inventory, and multi-outlet management.',
    keywords:
      'restaurant POS software, restaurant management software, restaurant billing software, cloud restaurant POS, waiter ordering app, KOT kitchen software, restaurant inventory management, QR menu ordering, multi outlet restaurant software',
  },
  '/info/pricing': {
    title: 'Transparent Pricing for Restaurants of All Sizes | RestroZ POS',
    description:
      'Simple, affordable pricing with zero hidden fees. Pick the best plan for your cafe, restaurant, cloud kitchen, or multi-outlet franchise.',
    keywords: 'restaurant POS pricing, restaurant billing software cost, cloud POS subscription, affordable restaurant POS',
  },
  '/info/features/pos-billing': {
    title: 'High-Speed Restaurant Billing & POS Terminal | RestroZ POS',
    description:
      'Lightning-fast billing with offline resilience, split payments (Cash, UPI, Card), barcode scanning, and instant GST invoices.',
    keywords: 'restaurant POS billing, high-speed billing, split payment POS, GST restaurant invoice, offline POS billing',
  },
  '/info/features/kot-kitchen': {
    title: 'Automated Kitchen Order Ticket (KOT) Management | RestroZ POS',
    description:
      'Instant KOT dispatch to kitchen printers and digital screens. Support multi-station routing, item amendments, and preparation tracking.',
    keywords: 'KOT printing, kitchen display system, automated KOT, kitchen order ticket, restaurant printer routing',
  },
  '/info/features/waiter-mobile-app': {
    title: 'Table-Side Waiter Ordering Mobile App | RestroZ POS',
    description:
      'Enable your serving staff to punch orders, add special modifiers, and send instant tickets right from Android and iOS smartphones.',
    keywords: 'waiter ordering app, table-side POS app, mobile order taking, captain ordering app',
  },
  '/info/features/qr-digital-menu': {
    title: 'Contactless Table QR Digital Menu & Ordering | RestroZ POS',
    description:
      'Allow diners to scan table QR codes, browse visual menus with allergen details, place supplementary orders, and pay digitally.',
    keywords: 'QR code menu, contactless restaurant ordering, digital table menu, QR payment restaurant',
  },
  '/info/features/inventory': {
    title: 'Real-Time Food Costing & Inventory Management | RestroZ POS',
    description:
      'Track raw material consumption with recipe-level ingredient deductions, low stock alerts, and automated purchase requisitions.',
    keywords: 'restaurant inventory management, recipe costing, raw material tracking, food cost management',
  },
  '/info/book-demo': {
    title: 'Book a Live 1-on-1 Product Demo | RestroZ Restaurant POS',
    description:
      'See RestroZ in action. Schedule a free personalized live demo with our restaurant POS specialists to streamline your billing and kitchen workflow.',
    keywords: 'book restaurant POS demo, live POS demonstration, restaurant software demo',
  },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hostname = url.hostname.toLowerCase();
    const proto = (request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')).toLowerCase();

    // -------------------------------------------------------------------------
    // 1. CANONICAL HOST & SSL REDIRECT (301 Permanent)
    // -------------------------------------------------------------------------
    // Redirect http:// -> https:// and www.restroz.shop -> restroz.shop
    if (hostname === `www.${CANONICAL_HOST}` || (hostname === CANONICAL_HOST && proto === 'http')) {
      const canonicalUrl = new URL(request.url);
      canonicalUrl.protocol = 'https:';
      canonicalUrl.hostname = CANONICAL_HOST;
      return Response.redirect(canonicalUrl.toString(), 301);
    }

    // -------------------------------------------------------------------------
    // 2. ROBOTS.TXT WITH OPTIMIZED HEADERS
    // -------------------------------------------------------------------------
    if (url.pathname === '/robots.txt') {
      const robotsRes = await env.ASSETS.fetch(request);
      const headers = new Headers(robotsRes.headers);
      headers.set('Content-Type', 'text/plain; charset=UTF-8');
      headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
      headers.set('X-Robots-Tag', 'all');
      return new Response(robotsRes.body, {
        status: robotsRes.status,
        headers,
      });
    }

    // -------------------------------------------------------------------------
    // 3. SITEMAP.XML WITH OPTIMIZED HEADERS
    // -------------------------------------------------------------------------
    if (url.pathname === '/sitemap.xml' || url.pathname === '/info/sitemap.xml') {
      const sitemapRes = await env.ASSETS.fetch(request);
      const headers = new Headers(sitemapRes.headers);
      headers.set('Content-Type', 'application/xml; charset=UTF-8');
      headers.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
      headers.set('X-Robots-Tag', 'all');
      return new Response(sitemapRes.body, {
        status: sitemapRes.status,
        headers,
      });
    }

    // -------------------------------------------------------------------------
    // 4. FETCH ASSET OR SPA REWRITE
    // -------------------------------------------------------------------------
    let response = await env.ASSETS.fetch(request);

    // If not found and request is a navigation GET/HEAD, rewrite to /index.html
    if (response.status === 404 && (request.method === 'GET' || request.method === 'HEAD')) {
      const isFileWithExtension = /\.[a-zA-Z0-9]+$/.test(url.pathname);
      if (!isFileWithExtension) {
        const indexRequest = new Request(new URL('/index.html', url.origin), request);
        const indexResponse = await env.ASSETS.fetch(indexRequest);
        if (indexResponse.status === 200) {
          response = indexResponse;
        }
      }
    }

    // -------------------------------------------------------------------------
    // 5. SEO & ROBOTS DIRECTIVES FOR HTML RESPONSES
    // -------------------------------------------------------------------------
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const newHeaders = new Headers(response.headers);
      const isPrivate = isPrivateRoute(url.pathname);
      const isWorkersDev = hostname.endsWith('.workers.dev');

      if (isPrivate || isWorkersDev) {
        // Enforce strict noindex on private screens and preview workers
        newHeaders.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
      } else {
        // Allow public pages
        newHeaders.set('X-Robots-Tag', 'index, follow, max-image-preview:large');
      }

      // Dynamic Canonical URL calculation
      const canonicalPath = url.pathname === '/' || url.pathname === '/index.html' ? '/' : url.pathname.replace(/\/$/, '');
      const canonicalUrl = `${SITE_ORIGIN}${canonicalPath}`;

      // Pick page SEO metadata or default to root
      const seoData = PUBLIC_PAGE_META[canonicalPath] || {
        title: 'RestroZ — Complete Restaurant Management & Cloud POS System',
        description:
          'From orders to happy customers — RestroZ is the modern cloud restaurant POS software with table-side waiter app, KOT printing, QR menu, inventory, and multi-outlet management.',
        keywords: 'restaurant POS software, restaurant billing software, KOT printing, cloud POS',
      };

      // Use HTMLRewriter to ensure accurate canonical link and meta tags
      const rewriter = new HTMLRewriter()
        .on('head', {
          element(el) {
            if (isPrivate || isWorkersDev) {
              el.append('<meta name="robots" content="noindex, nofollow, noarchive" />', { html: true });
            } else {
              // Ensure canonical URL is declared accurately
              el.append(`<link rel="canonical" href="${canonicalUrl}" />`, { html: true });
              el.append('<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />', { html: true });
              el.append(`<meta name="description" content="${seoData.description}" />`, { html: true });
              el.append(`<meta name="keywords" content="${seoData.keywords}" />`, { html: true });
              el.append('<meta property="og:type" content="website" />', { html: true });
              el.append(`<meta property="og:url" content="${canonicalUrl}" />`, { html: true });
              el.append(`<meta property="og:title" content="${seoData.title}" />`, { html: true });
              el.append(`<meta property="og:description" content="${seoData.description}" />`, { html: true });
              el.append('<meta property="og:image" content="https://restroz.shop/restroz-logo.png" />', { html: true });
              el.append('<meta name="twitter:card" content="summary_large_image" />', { html: true });
              el.append(`<meta name="twitter:url" content="${canonicalUrl}" />`, { html: true });
              el.append(`<meta name="twitter:title" content="${seoData.title}" />`, { html: true });
              el.append(`<meta name="twitter:description" content="${seoData.description}" />`, { html: true });
              el.append('<meta name="twitter:image" content="https://restroz.shop/restroz-logo.png" />', { html: true });
            }
          },
        })
        .on('title', {
          element(el) {
            if (!isPrivate && seoData.title) {
              el.setInnerContent(seoData.title);
            }
          },
        });

      return rewriter.transform(new Response(response.body, { status: response.status, headers: newHeaders }));
    }

    return response;
  },
};
