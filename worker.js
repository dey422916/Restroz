/**
 * Cloudflare Worker for RestroZ POS & Marketing Platform
 * - Canonical 301 redirects (www -> non-www, http -> https)
 * - Vanity keyword 301 redirects to authoritative feature pages
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

// Vanity Keyword 301 Permanent Redirects
const VANITY_REDIRECTS = {
  '/info/restaurant-pos-software': '/info/features/pos-billing',
  '/info/restaurant-billing-software': '/info/features/pos-billing',
  '/info/kot-printing-software': '/info/features/kot-kitchen',
  '/info/restaurant-management-software': '/info',
  '/info/restaurant-inventory-software': '/info/features/inventory',
  '/info/qr-code-menu': '/info/features/qr-digital-menu',
  '/info/table-management-software': '/info/features/table-management',
  '/info/restaurant-gst-billing': '/info/features/gst-billing',
  '/info/restaurant-analytics': '/info/features/reports-analytics',
  '/info/cloud-kitchen-pos': '/info/solutions/cloud-kitchens',
  '/info/cafe-pos-software': '/info/solutions/cafes',
  '/info/multi-outlet-pos': '/info/features/multi-outlet',
  '/info/restaurant-pos-pricing': '/info/pricing',
};

// SEO Titles and Descriptions by Path
const PUBLIC_PAGE_META = {
  '/': {
    title: 'Best Restaurant POS Software in India | RestroZ',
    description:
      'Discover RestroZ restaurant POS software for billing, KOT printing, table management, inventory, QR menus and sales reports. Explore features and book a demo.',
    keywords:
      'best restaurant POS software in India, restaurant billing software India, restaurant POS software, restaurant management software, restaurant billing system, cloud restaurant POS software, KOT printing software, restaurant inventory management, restaurant GST billing software, waiter mobile app restaurant, QR code digital menu, RestroZ POS',
  },
  '/info': {
    title: 'Best Restaurant POS Software in India | RestroZ',
    description:
      'Discover RestroZ restaurant POS software for billing, KOT printing, table management, inventory, QR menus and sales reports. Explore features and book a demo.',
    keywords:
      'best restaurant POS software in India, restaurant billing software India, restaurant POS software, restaurant management software, restaurant billing system, cloud restaurant POS software, KOT printing software, restaurant inventory management, restaurant GST billing software, waiter mobile app restaurant, QR code digital menu, RestroZ POS',
  },
  '/info/pricing': {
    title: 'Transparent Pricing for Restaurants of All Sizes | RestroZ POS',
    description:
      'Simple, affordable pricing with zero hidden fees. Pick the best plan for your cafe, restaurant, cloud kitchen, or multi-outlet franchise.',
    keywords: 'restaurant POS pricing, restaurant billing software cost, cloud POS subscription, affordable restaurant POS',
  },
  '/info/locations': {
    title: 'Restaurant POS Software in India — Cities & States Coverage | RestroZ',
    description:
      'Discover RestroZ restaurant POS software across India. Serving restaurant owners in Kolkata, Delhi NCR, Mumbai, Bengaluru, Hyderabad, Chennai, and 50+ dining capitals.',
    keywords:
      'restaurant POS software India, restaurant POS software Kolkata, restaurant billing software Delhi, restaurant management software Mumbai, restaurant POS Bangalore, KOT software Chennai',
  },
  '/info/features/pos-billing': {
    title: 'High-Speed Restaurant Billing & POS Terminal | RestroZ POS',
    description:
      'Lightning-fast billing with offline resilience, split payments (Cash, UPI, Card), barcode scanning, and instant GST invoices.',
    keywords: 'restaurant POS billing, high-speed billing, split payment POS, GST restaurant invoice, offline POS billing',
  },
  '/info/features/gst-billing': {
    title: 'Restaurant GST Billing Software in India — 5%, 12%, 18% Tax Slabs | RestroZ',
    description:
      'Automated Indian GST compliant restaurant billing software. Instant CGST, SGST & IGST calculation, mixed alcohol VAT billing, customer GSTIN invoicing, and one-click GSTR reports.',
    keywords:
      'restaurant GST billing software, restaurant billing software India, CGST SGST restaurant bill, restaurant tax invoice software, GST compliant restaurant POS',
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
  '/info/features/table-management': {
    title: 'Live Table Floor Management & Occupancy Tracking | RestroZ POS',
    description:
      'Interactive visual floor plans for dining rooms, outdoor seating, and bars. Real-time table occupancy status, course pacing, and reservation management.',
    keywords: 'restaurant table management software, floor plan POS, table occupancy tracking, dining room management',
  },
  '/info/features/reports-analytics': {
    title: 'Restaurant Sales Reports & Register Cash Reconciliation | RestroZ POS',
    description:
      'Comprehensive financial reporting: gross sales, net profit, day register cash audits, split payment reconciliation, top-selling dishes, and staff performance.',
    keywords: 'restaurant sales reporting software, cash register reconciliation, restaurant financial reports, day close audit POS',
  },
  '/info/features/multi-outlet': {
    title: 'Centralized Multi-Outlet Restaurant Management | RestroZ POS',
    description:
      'One connected platform for restaurant chains and franchises. Push menu catalog updates, monitor branch performance, and control role-based permissions.',
    keywords: 'multi outlet restaurant POS software, restaurant chain management, franchise POS software, centralized menu management',
  },
  '/info/blog': {
    title: 'Restaurant Management & POS Knowledge Hub | RestroZ Blog',
    description:
      'Expert operational guides, technical tutorials, and industry insights on Indian restaurant POS billing, automatic KOT printing, inventory costing, GST rules, and QR menus.',
    keywords: 'restaurant management guides, restaurant POS blog, restaurant billing tutorials, KOT printing guide, restaurant GST rules',
  },
  '/info/blog/how-to-choose-best-restaurant-pos-software-india': {
    title: 'How to Choose the Best Restaurant POS Software in India (2026 Guide) | RestroZ',
    description: 'Discover how to choose the best restaurant POS software in India. Compare cloud vs on-premise, hardware compatibility, KOT speed, GST invoicing, and hidden costs.',
    keywords: 'best restaurant POS software in India, how to choose restaurant POS software, restaurant billing software guide, cloud restaurant POS India',
  },
  '/info/blog/restaurant-billing-software-guide-india': {
    title: 'Restaurant Billing Software: Complete Guide for Indian Owners | RestroZ',
    description: 'Everything Indian restaurant owners need to know about restaurant billing software: high-speed counter checkout, split payments, GST invoices, and cashier audits.',
    keywords: 'restaurant billing software India, restaurant billing system, restaurant billing app, restaurant cash register software',
  },
  '/info/blog/cloud-pos-vs-traditional-desktop-pos': {
    title: 'Cloud POS vs Traditional Desktop POS for Restaurants in India | RestroZ',
    description: 'Compare cloud POS vs traditional desktop POS for Indian restaurants. Analyze hardware costs, remote monitoring, data security, and offline reliability.',
    keywords: 'cloud POS vs traditional POS, cloud restaurant POS software, best POS for restaurants India',
  },
  '/info/blog/restaurant-pos-software-cost-pricing-india': {
    title: 'Restaurant POS Software Cost in India: 2026 Pricing Breakdown | RestroZ',
    description: 'How much does restaurant POS software cost in India? Comprehensive breakdown of software subscriptions, thermal printers, hardware requirements, and ROI.',
    keywords: 'restaurant POS software cost India, restaurant POS software price, affordable restaurant POS software',
  },
  '/info/blog/what-is-kot-automatic-kitchen-order-ticket-printing': {
    title: 'What Is KOT in a Restaurant? Automatic KOT Printing Explained | RestroZ',
    description: 'What is KOT in a restaurant? Learn how automatic kitchen order ticket printing works, why it eliminates handwriting mistakes, and how to set up multi-station kitchen routing.',
    keywords: 'what is KOT in restaurant, KOT software, automatic KOT printing software, kitchen order ticket system',
  },
  '/info/blog/thermal-printer-guide-bluetooth-usb-lan-restaurant-pos': {
    title: 'Thermal Printer Guide for Restaurants: Bluetooth vs USB vs LAN | RestroZ',
    description: 'Complete restaurant thermal printer guide: compare Bluetooth, USB, and LAN network printers. Setup tips for 58mm and 80mm paper rolls and KOT reliability.',
    keywords: 'restaurant thermal printer software, Bluetooth restaurant POS printer, KOT printer LAN USB, thermal receipt printer',
  },
  '/info/blog/restaurant-gst-billing-rules-slabs-guide': {
    title: 'Restaurant GST Billing Explained: 5%, 12%, 18% Slabs Guide | RestroZ',
    description: 'Comprehensive guide to restaurant GST billing in India: 5% vs 18% slabs, Input Tax Credit rules, CGST/SGST itemization, and GSTR reporting for restaurant owners.',
    keywords: 'restaurant GST billing software, restaurant GST rate India, CGST SGST restaurant bill, restaurant billing software GST',
  },
  '/info/blog/restaurant-inventory-management-recipe-costing-guide': {
    title: 'Restaurant Inventory Management & Recipe Costing Guide | RestroZ',
    description: 'Master restaurant inventory management: learn how recipe-level ingredient deductions, low stock alerts, and wastage tracking reduce food costs below 30%.',
    keywords: 'restaurant inventory management software, recipe costing software, restaurant food cost reduction',
  },
  '/info/blog/contactless-qr-code-digital-menus-benefits': {
    title: 'Contactless QR Code Digital Menus for Restaurants | RestroZ',
    description: 'Why restaurants are switching to QR code digital menus: eliminate reprinting costs, showcase visual food photos, increase average order value, and speed up table turnover.',
    keywords: 'QR code digital menu restaurant, contactless restaurant ordering, QR code menu software India',
  },
  '/info/blog/table-side-waiter-ordering-apps-benefits': {
    title: 'Table-Side Waiter Ordering Mobile App: Boost Speed by 35% | RestroZ',
    description: 'Why table-side waiter mobile apps accelerate restaurant service. Eliminate server counter trips, fire instant kitchen KOTs, and improve table turns.',
    keywords: 'waiter mobile app restaurant, table side ordering POS, captain ordering app India, handheld restaurant POS',
  },
  '/info/blog/multi-outlet-restaurant-management-franchise-operations': {
    title: 'Multi-Outlet Restaurant POS: Scale Chains & Franchises | RestroZ',
    description: 'How to manage multi-outlet restaurants and franchise chains: central menu synchronization, consolidated sales reporting, role permissions, and branch controls.',
    keywords: 'multi outlet restaurant POS software, restaurant chain management software, franchise POS software India',
  },
  '/info/blog/prevent-cash-theft-daily-cash-register-reconciliation': {
    title: 'Prevent Cash Counter Theft with Restaurant Register Reconciliation | RestroZ',
    description: 'Stop restaurant cash counter theft: learn how opening cash floats, discount approval audits, and daily register reconciliation safeguard restaurant profits.',
    keywords: 'restaurant cash register software, cash reconciliation restaurant, prevent restaurant cash theft',
  },
  '/info/book-demo': {
    title: 'Book a Live 1-on-1 Product Demo | RestroZ Restaurant POS',
    description:
      'See RestroZ in action. Schedule a free personalized live demo with our restaurant POS specialists to streamline your billing and kitchen workflow.',
    keywords: 'book restaurant POS demo, live POS demonstration, restaurant software demo',
  },
  '/info/about': {
    title: 'About RestroZ — Modern Cloud Restaurant Management Software',
    description:
      'Learn about RestroZ, our mission to empower food entrepreneurs across India, and how we build high-speed cloud point-of-sale and kitchen management tools.',
    keywords: 'about RestroZ, restaurant POS company India, restaurant software founders',
  },
  '/info/contact': {
    title: 'Contact RestroZ — Sales, Support & Product Demonstrations',
    description:
      'Get in touch with the RestroZ restaurant technology team for sales inquiries, hardware compatibility checks, and live product onboarding.',
    keywords: 'contact RestroZ, restaurant POS support India, RestroZ phone email',
  },
  '/info/faq': {
    title: 'Frequently Asked Questions | RestroZ Restaurant POS',
    description:
      'Find answers to common questions about switching to RestroZ, hardware requirements, thermal printer pairing, offline operation, and pricing.',
    keywords: 'restaurant POS FAQ, thermal printer setup FAQ, RestroZ questions',
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
    // 2. VANITY KEYWORD REDIRECTS (301 Permanent)
    // -------------------------------------------------------------------------
    const normalizedPath = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '');
    const vanityTarget = VANITY_REDIRECTS[normalizedPath];
    if (vanityTarget) {
      const targetUrl = new URL(vanityTarget, url.origin);
      targetUrl.search = url.search;
      return Response.redirect(targetUrl.toString(), 301);
    }

    // -------------------------------------------------------------------------
    // 3. ROBOTS.TXT WITH OPTIMIZED HEADERS
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
    // 4. SITEMAP.XML WITH OPTIMIZED HEADERS
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
    // 5. FETCH ASSET OR SPA REWRITE
    // -------------------------------------------------------------------------
    let response = await env.ASSETS.fetch(request);

    // If Cloudflare assets returned 307 redirecting to trailing slash or vice versa, resolve directly
    if ((response.status === 307 || response.status === 308) && (request.method === 'GET' || request.method === 'HEAD')) {
      const loc = response.headers.get('location') || '';
      if (loc && (loc.startsWith('/') || loc.startsWith(url.origin))) {
        const targetUrl = new URL(loc, url.origin);
        const resolved = await env.ASSETS.fetch(new Request(targetUrl, request));
        if (resolved.status === 200) {
          response = resolved;
        }
      }
    }

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
    // 6. SEO & ROBOTS DIRECTIVES FOR HTML RESPONSES
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
        newHeaders.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
      }

      // Dynamic Canonical URL calculation:
      // Note: Root '/' canonical points to '/info' as the authoritative product landing page.
      const canonicalPath = url.pathname === '/' || url.pathname === '/index.html' ? '/info' : url.pathname.replace(/\/$/, '');
      const canonicalUrl = `${SITE_ORIGIN}${canonicalPath}`;

      // Pick page SEO metadata or default to root
      const seoData = PUBLIC_PAGE_META[canonicalPath] || {
        title: 'Best Restaurant POS Software in India | RestroZ',
        description:
          'Discover RestroZ restaurant POS software for billing, KOT printing, table management, inventory, QR menus and sales reports. Explore features and book a demo.',
        keywords:
          'best restaurant POS software in India, restaurant billing software India, restaurant POS software, restaurant management software, KOT printing software',
      };

      // Use HTMLRewriter to ensure accurate canonical link and meta tags without duplicates
      const rewriter = new HTMLRewriter()
        .on('link[rel="canonical"]', {
          element(el) {
            el.remove(); // Remove existing canonical to prevent duplicate tags
          },
        })
        .on('meta[name="description"]', {
          element(el) {
            el.remove();
          },
        })
        .on('meta[name="keywords"]', {
          element(el) {
            el.remove();
          },
        })
        .on('meta[property^="og:"]', {
          element(el) {
            el.remove();
          },
        })
        .on('meta[name^="twitter:"]', {
          element(el) {
            el.remove();
          },
        })
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
