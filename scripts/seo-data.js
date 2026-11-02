/**
 * Comprehensive SEO Metadata & Static Semantic Pre-Render Content
 * For RestroZ Restaurant POS & Marketing Platform
 */

const SITE_ORIGIN = 'https://restroz.shop';

const MARKETING_PAGES = [
  {
    path: '/info',
    canonical: `${SITE_ORIGIN}/info`,
    title: 'Best Restaurant POS Software in India | RestroZ',
    description:
      'Discover RestroZ restaurant POS software for billing, KOT printing, table management, inventory, QR menus and sales reports. Explore features and book a demo.',
    keywords:
      'best restaurant POS software in India, restaurant billing software India, restaurant POS software, restaurant management software, restaurant billing system, cloud restaurant POS software, KOT printing software, restaurant inventory management, restaurant GST billing software, waiter mobile app restaurant, QR code digital menu, RestroZ POS',
    h1: 'Restaurant POS & Billing Software for Modern Indian Restaurants',
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': 'https://restroz.shop/#organization',
          name: 'RestroZ',
          url: 'https://restroz.shop/info',
          logo: 'https://restroz.shop/restroz-logo.png',
          description: 'Complete Modern Restaurant Management & Cloud POS Platform',
          contactPoint: {
            '@type': 'ContactPoint',
            telephone: '+91-7098513441',
            contactType: 'sales',
            availableLanguage: ['English', 'Hindi', 'Bengali'],
          },
        },
        {
          '@type': 'SoftwareApplication',
          '@id': 'https://restroz.shop/#software',
          name: 'RestroZ Restaurant POS',
          operatingSystem: 'Web, Android, Windows, Cloud',
          applicationCategory: 'BusinessApplication',
          applicationSubCategory: 'Restaurant POS & Billing Software',
          description:
            'Discover RestroZ restaurant POS software for billing, KOT printing, table management, inventory, QR menus and sales reports.',
          url: 'https://restroz.shop/info',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'INR',
          },
        },
      ],
    },
    semanticHtml: `
      <header style="padding: 16px 24px; background: #FAF9F6; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; max-width: 1200px; margin: 0 auto;">
        <a href="/info" style="font-weight: 900; font-size: 22px; color: #0F172A; text-decoration: none;">RestroZ <span style="font-size: 11px; background: #FC8019; color: #FFF; padding: 2px 6px; border-radius: 4px; vertical-align: middle;">POS</span></a>
        <nav style="display: flex; gap: 20px;">
          <a href="/info/features/pos-billing" style="color: #475569; text-decoration: none; font-weight: 600; font-size: 14px;">POS Billing</a>
          <a href="/info/features/gst-billing" style="color: #475569; text-decoration: none; font-weight: 600; font-size: 14px;">GST Billing</a>
          <a href="/info/features/kot-kitchen" style="color: #475569; text-decoration: none; font-weight: 600; font-size: 14px;">KOT Printing</a>
          <a href="/info/pricing" style="color: #475569; text-decoration: none; font-weight: 600; font-size: 14px;">Pricing</a>
          <a href="/info/locations" style="color: #475569; text-decoration: none; font-weight: 600; font-size: 14px;">India Coverage</a>
          <a href="/info/blog" style="color: #475569; text-decoration: none; font-weight: 600; font-size: 14px;">Blog</a>
          <a href="/info/book-demo" style="background: #FC8019; color: #FFF; padding: 6px 14px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px;">Book Demo</a>
        </nav>
      </header>

      <main style="max-width: 1100px; margin: 0 auto; padding: 48px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A; line-height: 1.6;">
        <section style="text-align: center; margin-bottom: 56px;">
          <span style="background: #FFF4EB; color: #EA580C; font-size: 12px; font-weight: 800; padding: 4px 12px; border-radius: 6px; letter-spacing: 0.5px;">NEXT-GEN CLOUD RESTAURANT MANAGEMENT</span>
          <h1 style="font-size: 40px; font-weight: 900; line-height: 1.2; margin: 16px 0 20px; color: #0F172A;">Restaurant POS & Billing Software for Modern Indian Restaurants</h1>
          <p style="font-size: 18px; color: #475569; max-width: 820px; margin: 0 auto 28px; line-height: 1.5;">
            From orders to happy customers — manage high-speed POS billing, automated kitchen KOT thermal printing, table-side waiter app, dynamic QR menus, recipe-level inventory, and multiple outlets in one unified cloud system.
          </p>
          <div style="display: flex; gap: 14px; justify-content: center; flex-wrap: wrap;">
            <a href="/info/book-demo" style="background: #FC8019; color: #FFFFFF; padding: 14px 28px; border-radius: 10px; font-weight: 800; font-size: 16px; text-decoration: none;">Book a Free 1-on-1 Demo →</a>
            <a href="https://wa.me/917098513441?text=Hi%20RestroZ%20Team%2C%20I%20want%20to%20learn%20more%20about%20your%20POS" style="background: #25D366; color: #FFFFFF; padding: 14px 24px; border-radius: 10px; font-weight: 800; font-size: 16px; text-decoration: none;">Chat on WhatsApp</a>
          </div>
        </section>

        <section style="margin-bottom: 56px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; padding: 36px;">
          <h2 style="font-size: 28px; font-weight: 800; margin-bottom: 16px;">Complete Restaurant Operating System Built for Indian Food Businesses</h2>
          <p style="font-size: 16px; color: #334155; margin-bottom: 24px;">
            RestroZ is purpose-built to solve real daily operational bottlenecks in Indian dining rooms, quick-service counters, cafes, bars, and multi-brand cloud kitchens.
          </p>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px;">
            <div style="background: #FAF9F6; padding: 20px; border-radius: 12px; border: 1px solid #E2E8F0;">
              <h3 style="font-size: 18px; font-weight: 700; color: #0F172A; margin-bottom: 8px;">⚡ High-Speed Billing & Cash Register</h3>
              <p style="font-size: 14px; color: #475569; margin: 0;">Settle Dine-In, Takeaway, and Delivery orders in seconds. Supports split bills (UPI QR, Cash, Card, Customer Wallet) and strict cashier shift day registers.</p>
            </div>
            <div style="background: #FAF9F6; padding: 20px; border-radius: 12px; border: 1px solid #E2E8F0;">
              <h3 style="font-size: 18px; font-weight: 700; color: #0F172A; margin-bottom: 8px;">🧾 Automated KOT Thermal Printing</h3>
              <p style="font-size: 14px; color: #475569; margin: 0;">Instant kitchen tickets via USB, Bluetooth, or LAN. Intelligent category routing separates Bar drinks, Tandoor, and Curry stations with cooking notes.</p>
            </div>
            <div style="background: #FAF9F6; padding: 20px; border-radius: 12px; border: 1px solid #E2E8F0;">
              <h3 style="font-size: 18px; font-weight: 700; color: #0F172A; margin-bottom: 8px;">📱 Table-Side Waiter Mobile App</h3>
              <p style="font-size: 14px; color: #475569; margin: 0;">Captains take orders and fire tickets right in front of guests using standard Android smartphones. Accelerates table turns by 35%.</p>
            </div>
            <div style="background: #FAF9F6; padding: 20px; border-radius: 12px; border: 1px solid #E2E8F0;">
              <h3 style="font-size: 18px; font-weight: 700; color: #0F172A; margin-bottom: 8px;">📦 Recipe Costing & Inventory</h3>
              <p style="font-size: 14px; color: #475569; margin: 0;">Recipe-level ingredient consumption deductions. Real-time low stock threshold alerts, raw material variance audits, and food waste reduction.</p>
            </div>
            <div style="background: #FAF9F6; padding: 20px; border-radius: 12px; border: 1px solid #E2E8F0;">
              <h3 style="font-size: 18px; font-weight: 700; color: #0F172A; margin-bottom: 8px;">📲 Contactless QR Digital Menus</h3>
              <p style="font-size: 14px; color: #475569; margin: 0;">Guests scan table QR codes to view high-resolution food photos, allergen tags, and place supplementary orders without waiting for waitstaff.</p>
            </div>
            <div style="background: #FAF9F6; padding: 20px; border-radius: 12px; border: 1px solid #E2E8F0;">
              <h3 style="font-size: 18px; font-weight: 700; color: #0F172A; margin-bottom: 8px;">🏢 Multi-Outlet Central Management</h3>
              <p style="font-size: 14px; color: #475569; margin: 0;">Centralized menu catalog push, branch-level role permissions, and consolidated real-time sales reporting for growing chains and franchises.</p>
            </div>
          </div>
        </section>

        <section style="margin-bottom: 56px;">
          <h2 style="font-size: 28px; font-weight: 800; margin-bottom: 16px;">Who RestroZ is Designed For</h2>
          <p style="font-size: 16px; color: #334155; margin-bottom: 20px;">
            Whether you operate an intimate 6-table cafe, a high-volume biryani joint, a brewery, or a 15-branch franchise, RestroZ adapts to your exact service model:
          </p>
          <ul style="padding-left: 20px; font-size: 15px; color: #334155; line-height: 2;">
            <li><strong>Full-Service Restaurants & Fine Dining:</strong> Interactive table floor maps, course pacing, interim guest check slips, and captain order apps.</li>
            <li><strong>Cafes, Bakeries & Coffee Shops:</strong> Rapid counter checkout, weighed item pricing, barcode scanning, and loyalty cashback.</li>
            <li><strong>Cloud Kitchens & Dark Kitchens:</strong> Multi-brand order routing, central food prep dispatching, and automated raw inventory consumption.</li>
            <li><strong>Quick Service Restaurants (QSR):</strong> Auto-generated token numbers, kitchen display system integration, and rapid counter settlement.</li>
            <li><strong>Bars, Breweries & Pubs:</strong> Dual-tax billing with 5% food GST and state-specific alcohol VAT on unified receipts.</li>
          </ul>
        </section>

        <section style="margin-bottom: 56px; background: #0B132B; color: #FFFFFF; border-radius: 16px; padding: 36px;">
          <h2 style="font-size: 26px; font-weight: 800; margin-bottom: 12px; color: #FFFFFF;">Zero Hardware Lock-In • 100% Cloud Speed</h2>
          <p style="font-size: 15px; color: #94A3B8; margin-bottom: 24px; line-height: 1.6;">
            Do not waste ₹50,000+ on proprietary touchscreen terminals. RestroZ runs on any Windows laptop, Mac, Chromebook, Android tablet, or smartphone. It connects seamlessly to standard ESC/POS 58mm and 80mm thermal receipt printers via USB, Bluetooth, or LAN ethernet.
          </p>
          <div style="display: flex; gap: 16px; flex-wrap: wrap;">
            <a href="/info/book-demo" style="background: #FC8019; color: #FFF; padding: 12px 24px; border-radius: 8px; font-weight: 700; text-decoration: none;">Schedule Free Demo</a>
            <a href="/info/pricing" style="border: 1px solid #475569; color: #CBD5E1; padding: 12px 20px; border-radius: 8px; font-weight: 600; text-decoration: none;">View Transparent Plans</a>
          </div>
        </section>

        <section style="margin-bottom: 40px;">
          <h2 style="font-size: 26px; font-weight: 800; margin-bottom: 20px;">Frequently Asked Questions</h2>
          <div style="border-top: 1px solid #E2E8F0;">
            <div style="padding: 16px 0; border-bottom: 1px solid #E2E8F0;">
              <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 6px;">How does RestroZ handle internet disconnection?</h3>
              <p style="font-size: 14px; color: #475569; margin: 0;">RestroZ uses local caching. Waiters can continue punching orders and thermal KOTs print locally over Bluetooth or LAN even when broadband is offline. All records silently sync to the cloud the moment connectivity returns.</p>
            </div>
            <div style="padding: 16px 0; border-bottom: 1px solid #E2E8F0;">
              <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 6px;">Does RestroZ support 5% GST and Indian tax compliance?</h3>
              <p style="font-size: 14px; color: #475569; margin: 0;">Yes. RestroZ natively supports standard 5% restaurant GST (2.5% CGST + 2.5% SGST), hotel 18% slabs, B2B customer GSTIN capture, and exports one-click GSTR-1 and GSTR-3B tax summaries.</p>
            </div>
            <div style="padding: 16px 0; border-bottom: 1px solid #E2E8F0;">
              <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 6px;">Can I use my existing thermal printer?</h3>
              <p style="font-size: 14px; color: #475569; margin: 0;">Yes. RestroZ pairs with standard 58mm (2-inch) and 80mm (3-inch) ESC/POS thermal printers from TVS, Epson, NGX, Everycom, Retsol, and Everycom via USB, Bluetooth, or LAN.</p>
            </div>
          </div>
        </section>
      </main>

      <footer style="background: #0B132B; color: #94A3B8; padding: 48px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px;">
        <div style="max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 32px; margin-bottom: 36px;">
          <div>
            <h4 style="color: #FFF; font-size: 16px; margin-bottom: 12px;">RestroZ POS</h4>
            <p style="margin: 0 0 10px;">Cloud Restaurant Management & POS Software.</p>
            <p style="margin: 0;">📞 Sales: +91 7098513441</p>
            <p style="margin: 4px 0;">✉️ Email: restroz.pos@gmail.com</p>
          </div>
          <div>
            <h4 style="color: #FFF; font-size: 16px; margin-bottom: 12px;">Product Solutions</h4>
            <ul style="list-style: none; padding: 0; margin: 0; line-height: 2;">
              <li><a href="/info/features/pos-billing" style="color: #CBD5E1; text-decoration: none;">POS Billing Engine</a></li>
              <li><a href="/info/features/gst-billing" style="color: #CBD5E1; text-decoration: none;">GST Billing & Taxes</a></li>
              <li><a href="/info/features/kot-kitchen" style="color: #CBD5E1; text-decoration: none;">KOT Kitchen Printing</a></li>
              <li><a href="/info/features/waiter-mobile-app" style="color: #CBD5E1; text-decoration: none;">Waiter Mobile App</a></li>
              <li><a href="/info/features/qr-digital-menu" style="color: #CBD5E1; text-decoration: none;">Table QR Menus</a></li>
              <li><a href="/info/features/inventory" style="color: #CBD5E1; text-decoration: none;">Inventory Management</a></li>
            </ul>
          </div>
          <div>
            <h4 style="color: #FFF; font-size: 16px; margin-bottom: 12px;">Resources & Coverage</h4>
            <ul style="list-style: none; padding: 0; margin: 0; line-height: 2;">
              <li><a href="/info/pricing" style="color: #CBD5E1; text-decoration: none;">Plans & Pricing</a></li>
              <li><a href="/info/locations" style="color: #CBD5E1; text-decoration: none;">India Service Coverage</a></li>
              <li><a href="/info/blog" style="color: #CBD5E1; text-decoration: none;">Restaurant Knowledge Hub</a></li>
              <li><a href="/info/about" style="color: #CBD5E1; text-decoration: none;">About RestroZ</a></li>
              <li><a href="/info/contact" style="color: #CBD5E1; text-decoration: none;">Contact Us</a></li>
              <li><a href="/info/faq" style="color: #CBD5E1; text-decoration: none;">Frequently Asked Questions</a></li>
            </ul>
          </div>
        </div>
        <div style="border-top: 1px solid #1E293B; padding-top: 20px; text-align: center;">
          <p style="margin: 0;">© 2026 RestroZ. All rights reserved. "Good Food Brings People Together"</p>
        </div>
      </footer>
    `,
  },
  {
    path: '/info/features/pos-billing',
    canonical: `${SITE_ORIGIN}/info/features/pos-billing`,
    title: 'High-Speed Restaurant Billing & POS Terminal | RestroZ POS',
    description:
      'Lightning-fast billing with offline resilience, split payments (Cash, UPI, Card), barcode scanning, thermal receipt printing, and instant GST invoices.',
    keywords:
      'restaurant POS billing, high-speed billing, split payment POS, GST restaurant invoice, offline POS billing, thermal receipt printing',
    h1: 'High-Speed Restaurant POS Billing Built for Rush Hours',
  },
  {
    path: '/info/features/gst-billing',
    canonical: `${SITE_ORIGIN}/info/features/gst-billing`,
    title: 'Restaurant GST Billing Software in India — 5%, 12%, 18% Tax Slabs | RestroZ',
    description:
      'Automated Indian GST compliant restaurant billing software. Instant CGST, SGST & IGST calculation, mixed alcohol VAT billing, customer GSTIN invoicing, and one-click GSTR reports.',
    keywords:
      'restaurant GST billing software, restaurant billing software India, CGST SGST restaurant bill, restaurant tax invoice software, GST compliant restaurant POS',
    h1: 'Indian GST Compliant Restaurant Billing & Invoicing',
  },
  {
    path: '/info/features/kot-kitchen',
    canonical: `${SITE_ORIGIN}/info/features/kot-kitchen`,
    title: 'Automated Kitchen Order Ticket (KOT) Management | RestroZ POS',
    description:
      'Instant KOT dispatch to kitchen printers and digital screens. Support multi-station routing, item amendments, preparation notes, and supplementary tickets.',
    keywords:
      'KOT printing, kitchen display system, automated KOT, kitchen order ticket, restaurant printer routing, KOT software India',
    h1: 'Automated Kitchen Order Ticket (KOT) Printing & Routing',
  },
  {
    path: '/info/features/waiter-mobile-app',
    canonical: `${SITE_ORIGIN}/info/features/waiter-mobile-app`,
    title: 'Table-Side Waiter Ordering Mobile App | RestroZ POS',
    description:
      'Enable serving staff to punch orders, add special modifiers, and send instant tickets right from Android and iOS smartphones in front of dining guests.',
    keywords:
      'waiter ordering app, table-side POS app, mobile order taking, captain ordering app, handheld restaurant POS',
    h1: 'Table-Side Waiter Ordering Mobile App',
  },
  {
    path: '/info/features/qr-digital-menu',
    canonical: `${SITE_ORIGIN}/info/features/qr-digital-menu`,
    title: 'Contactless Table QR Digital Menu & Ordering | RestroZ POS',
    description:
      'Allow diners to scan table QR codes, browse visual menus with allergen details, place supplementary orders, and pay digitally without waiting.',
    keywords:
      'QR code menu, contactless restaurant ordering, digital table menu, QR payment restaurant, restaurant digital menu',
    h1: 'Contactless Table QR Digital Menu & Ordering',
  },
  {
    path: '/info/features/inventory',
    canonical: `${SITE_ORIGIN}/info/features/inventory`,
    title: 'Real-Time Food Costing & Inventory Management | RestroZ POS',
    description:
      'Track raw material consumption with recipe-level ingredient deductions, low stock threshold alerts, wastage logging, and food cost controls.',
    keywords:
      'restaurant inventory management, recipe costing, raw material tracking, food cost management, kitchen inventory software',
    h1: 'Real-Time Food Costing & Inventory Management',
  },
  {
    path: '/info/features/table-management',
    canonical: `${SITE_ORIGIN}/info/features/table-management`,
    title: 'Live Table Floor Management & Occupancy Tracking | RestroZ POS',
    description:
      'Interactive visual floor plans for dining rooms, outdoor seating, and bars. Real-time table occupancy status, course pacing, and reservation management.',
    keywords:
      'restaurant table management software, floor plan POS, table occupancy tracking, dining room management',
    h1: 'Interactive Table Floor Management & Occupancy Tracking',
  },
  {
    path: '/info/features/reports-analytics',
    canonical: `${SITE_ORIGIN}/info/features/reports-analytics`,
    title: 'Restaurant Sales Reports & Register Cash Reconciliation | RestroZ POS',
    description:
      'Comprehensive financial reporting: gross sales, net profit, day register cash audits, split payment reconciliation, top-selling dishes, and staff performance.',
    keywords:
      'restaurant sales reporting software, cash register reconciliation, restaurant financial reports, day close audit POS',
    h1: 'Restaurant Sales Reporting & Cash Register Reconciliation',
  },
  {
    path: '/info/features/multi-outlet',
    canonical: `${SITE_ORIGIN}/info/features/multi-outlet`,
    title: 'Centralized Multi-Outlet Restaurant Management | RestroZ POS',
    description:
      'One connected platform for restaurant chains and franchises. Push menu catalog updates, monitor branch performance, and control role-based permissions.',
    keywords:
      'multi outlet restaurant POS software, restaurant chain management, franchise POS software, centralized menu management',
    h1: 'Centralized Multi-Outlet Restaurant Management Platform',
  },
  {
    path: '/info/pricing',
    canonical: `${SITE_ORIGIN}/info/pricing`,
    title: 'Transparent Pricing for Restaurants of All Sizes | RestroZ POS',
    description:
      'Simple, affordable pricing with zero hidden fees. Pick the best plan for your cafe, restaurant, cloud kitchen, or multi-outlet franchise.',
    keywords:
      'restaurant POS pricing, restaurant billing software cost, cloud POS subscription, affordable restaurant POS',
    h1: 'Simple, Predictable Plans for Food Businesses',
  },
  {
    path: '/info/locations',
    canonical: `${SITE_ORIGIN}/info/locations`,
    title: 'Restaurant POS Software in India — Cities & States Coverage | RestroZ',
    description:
      'Discover RestroZ restaurant POS software across India. Serving restaurant owners in Kolkata, Delhi NCR, Mumbai, Bengaluru, Hyderabad, Chennai, and 50+ dining capitals.',
    keywords:
      'restaurant POS software India, restaurant POS software Kolkata, restaurant billing software Delhi, restaurant management software Mumbai, restaurant POS Bangalore',
    h1: 'Modern Restaurant POS & Billing Software Across India',
  },
  {
    path: '/info/blog',
    canonical: `${SITE_ORIGIN}/info/blog`,
    title: 'Restaurant Management & POS Knowledge Hub | RestroZ Blog',
    description:
      'Expert operational guides, technical tutorials, and industry insights on Indian restaurant POS billing, automatic KOT printing, inventory costing, GST rules, and QR menus.',
    keywords:
      'restaurant management guides, restaurant POS blog, restaurant billing tutorials, KOT printing guide, restaurant GST rules',
    h1: 'Restaurant Technology, Billing & Operations Insights',
  },
  {
    path: '/info/book-demo',
    canonical: `${SITE_ORIGIN}/info/book-demo`,
    title: 'Book a Live 1-on-1 Product Demo | RestroZ Restaurant POS',
    description:
      'See RestroZ in action. Schedule a free personalized live demo with our restaurant POS specialists to streamline your billing and kitchen workflow.',
    keywords: 'book restaurant POS demo, live POS demonstration, restaurant software demo',
    h1: 'Schedule Your Personalized 1-on-1 RestroZ Demo',
  },
  {
    path: '/info/about',
    canonical: `${SITE_ORIGIN}/info/about`,
    title: 'About RestroZ — Modern Cloud Restaurant Management Software',
    description:
      'Learn about RestroZ, our mission to empower food entrepreneurs across India, and how we build high-speed cloud point-of-sale and kitchen management tools.',
    keywords: 'about RestroZ, restaurant POS company India, restaurant software founders',
    h1: 'Empowering Food Entrepreneurs with Modern Technology',
  },
  {
    path: '/info/contact',
    canonical: `${SITE_ORIGIN}/info/contact`,
    title: 'Contact RestroZ — Sales, Support & Product Demonstrations',
    description:
      'Get in touch with the RestroZ restaurant technology team for sales inquiries, hardware compatibility checks, and live product onboarding.',
    keywords: 'contact RestroZ, restaurant POS support India, RestroZ phone email',
    h1: 'Get in Touch with Our Restaurant Technology Team',
  },
  {
    path: '/info/faq',
    canonical: `${SITE_ORIGIN}/info/faq`,
    title: 'Frequently Asked Questions | RestroZ Restaurant POS',
    description:
      'Find answers to common questions about switching to RestroZ, hardware requirements, thermal printer pairing, offline operation, and pricing.',
    keywords: 'restaurant POS FAQ, thermal printer setup FAQ, RestroZ questions',
    h1: 'Frequently Asked Questions About RestroZ',
  },
  {
    path: '/info/solutions/restaurants',
    canonical: `${SITE_ORIGIN}/info/solutions/restaurants`,
    title: 'POS & Table Management Software for Full-Service Restaurants | RestroZ',
    description:
      'Streamline dine-in service: table floor management, captain ordering mobile app, multi-station kitchen KOT printing, and split bill checkout.',
    keywords: 'fine dining POS, dine-in restaurant software, table management POS',
    h1: 'Complete POS Platform for Full-Service Restaurants',
  },
  {
    path: '/info/solutions/cafes',
    canonical: `${SITE_ORIGIN}/info/solutions/cafes`,
    title: 'POS & Billing Software for Cafes & Bakeries | RestroZ',
    description:
      'Fast counter checkout, barcode scanner support, custom beverage modifiers, and customer loyalty wallets for cafes and bakeries.',
    keywords: 'cafe POS software, bakery billing software, coffee shop POS India',
    h1: 'Modern POS & Fast Billing for Cafes & Bakeries',
  },
  {
    path: '/info/solutions/cloud-kitchens',
    canonical: `${SITE_ORIGIN}/info/solutions/cloud-kitchens`,
    title: 'POS & Order Management Software for Cloud Kitchens | RestroZ',
    description:
      'Manage multi-brand virtual kitchens from one terminal: centralized food dispatch, automatic ingredient consumption, and delivery reconciliation.',
    keywords: 'cloud kitchen POS software, dark kitchen software, virtual restaurant POS',
    h1: 'High-Volume Order Dispatching for Cloud Kitchens',
  },
  {
    path: '/info/solutions/quick-service-restaurants',
    canonical: `${SITE_ORIGIN}/info/solutions/quick-service-restaurants`,
    title: 'QSR & Fast Food POS Billing Software | RestroZ',
    description:
      'Sub-15 second counter order punching, automated token number generation, kitchen display system routing, and instant split payments.',
    keywords: 'QSR POS software, fast food billing software, token system POS',
    h1: 'Rapid Counter Billing & Token System for QSRs',
  },
  {
    path: '/info/solutions/fine-dining',
    canonical: `${SITE_ORIGIN}/info/solutions/fine-dining`,
    title: 'Premium POS & Guest Experience Software for Fine Dining | RestroZ',
    description:
      'Elevate fine dining: multi-course pacing, guest dietary preferences, captain handheld terminals, and itemized corporate GST receipts.',
    keywords: 'fine dining restaurant software, luxury restaurant POS, table pacing POS',
    h1: 'Elevated Service & Table Pacing for Fine Dining',
  },
  {
    path: '/info/solutions/multi-outlet-restaurants',
    canonical: `${SITE_ORIGIN}/info/solutions/multi-outlet-restaurants`,
    title: 'Enterprise POS for Multi-Branch Restaurant Chains | RestroZ',
    description:
      'Scale your restaurant brand: central menu catalog push, franchise permissions, consolidated sales analytics, and cross-outlet stock transfers.',
    keywords: 'restaurant chain software, franchise POS system, multi branch restaurant software',
    h1: 'Enterprise Scalability for Restaurant Chains & Franchises',
  },
];

module.exports = {
  SITE_ORIGIN,
  MARKETING_PAGES,
};
