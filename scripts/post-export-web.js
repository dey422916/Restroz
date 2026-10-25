const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const publicDir = path.join(__dirname, '..', 'public');
const indexPath = path.join(distDir, 'index.html');
const notFoundPath = path.join(distDir, '404.html');
const redirectsPath = path.join(distDir, '_redirects');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');

  // Inject primary SEO metadata and canonical tag into dist/index.html
  const seoHeadTags = `
    <!-- Primary SEO & Canonical Definition -->
    <title>RestroZ — Restaurant POS & Management Software | Cloud Billing & KOT</title>
    <meta name="description" content="RestroZ is the modern all-in-one cloud restaurant POS and billing platform. Features lightning-fast KOT printing, table-side waiter app, digital QR ordering, billing, inventory, and multi-outlet management." />
    <meta name="keywords" content="restaurant POS software, restaurant billing software, KOT printing software, cloud restaurant POS, restaurant management software, QR digital menu, waiter ordering app, restaurant inventory management, multi-outlet restaurant software, RestroZ POS" />
    <link rel="canonical" href="https://restroz.shop/" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://restroz.shop/" />
    <meta property="og:title" content="RestroZ — Restaurant POS & Management Software | Cloud Billing & KOT" />
    <meta property="og:description" content="From orders to happy customers — RestroZ is the modern cloud restaurant POS software with table-side waiter app, KOT printing, QR menu, inventory, and multi-outlet management." />
    <meta property="og:image" content="https://restroz.shop/restroz-logo.png" />
    <meta property="og:site_name" content="RestroZ" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="https://restroz.shop/" />
    <meta name="twitter:title" content="RestroZ — Restaurant POS & Management Software" />
    <meta name="twitter:description" content="From orders to happy customers — RestroZ is the modern cloud restaurant POS software with table-side waiter app, KOT printing, QR menu, inventory, and multi-outlet management." />
    <meta name="twitter:image" content="https://restroz.shop/restroz-logo.png" />

    <!-- Structured Data (JSON-LD) -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "@id": "https://restroz.shop/#organization",
          "name": "RestroZ",
          "url": "https://restroz.shop/",
          "logo": "https://restroz.shop/restroz-logo.png",
          "description": "Complete Modern Restaurant Management & Cloud POS Platform",
          "contactPoint": {
            "@type": "ContactPoint",
            "telephone": "+91-7098513441",
            "contactType": "sales",
            "availableLanguage": ["English", "Hindi"]
          }
        },
        {
          "@type": "SoftwareApplication",
          "@id": "https://restroz.shop/#software",
          "name": "RestroZ",
          "operatingSystem": "Web, Android, Windows, Cloud",
          "applicationCategory": "BusinessApplication",
          "description": "From orders to happy customers — RestroZ is the modern cloud restaurant POS software with table-side waiter app, KOT printing, QR menu, inventory, and multi-outlet management.",
          "url": "https://restroz.shop/",
          "applicationSubCategory": "Restaurant POS & Billing Software",
          "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "INR"
          }
        }
      ]
    }
    </script>
  `;

  if (html.includes('<title>RestroZ</title>')) {
    html = html.replace('<title>RestroZ</title>', seoHeadTags.trim());
  } else if (html.includes('</head>')) {
    html = html.replace('</head>', `${seoHeadTags}\n</head>`);
  }

  // Inject semantic fallback into <noscript> for crawlers without JS
  const semanticNoscript = `
    <noscript>
      <div style="padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; line-height: 1.6;">
        <h1>RestroZ — Complete Restaurant Management & Cloud POS System</h1>
        <p>RestroZ is the modern all-in-one cloud restaurant POS and billing platform. Empower your restaurant with table-side waiter ordering, automated Kitchen Order Ticket (KOT) printing, contact-free QR digital menus, real-time inventory management, and comprehensive multi-outlet reporting.</p>
        <p>Explore our features, pricing, and live interactive demonstrations at <a href="https://restroz.shop/info">https://restroz.shop/info</a> or learn more about <a href="https://restroz.shop/info/features/pos-billing">Restaurant POS Billing</a>, <a href="https://restroz.shop/info/features/kot-kitchen">KOT Kitchen Printing</a>, and <a href="https://restroz.shop/info/pricing">Plans & Pricing</a>.</p>
      </div>
    </noscript>
  `;

  if (html.includes('<noscript>')) {
    html = html.replace(/<noscript>[\s\S]*?<\/noscript>/, semanticNoscript.trim());
  }

  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('✅ Injected canonical URL, meta tags, and structured data into dist/index.html');

  // 1. Copy index.html -> 404.html for static hosting fallback (Cloudflare Pages / SPA)
  fs.copyFileSync(indexPath, notFoundPath);
  console.log('✅ Created dist/404.html for SPA fallback');

  // 2. Remove any invalid _redirects file to prevent Cloudflare infinite loop error
  if (fs.existsSync(redirectsPath)) {
    fs.unlinkSync(redirectsPath);
    console.log('🧹 Cleaned up dist/_redirects (using native Cloudflare SPA handling)');
  }

  // 3. Copy public assets (robots.txt, sitemap.xml, banners, logo) into dist
  if (fs.existsSync(publicDir)) {
    copyDirRecursive(publicDir, distDir);
    console.log('✅ Copied public/ assets into dist/');
  }
} else {
  console.error('❌ dist/index.html not found! Run npx expo export --platform web first.');
}

