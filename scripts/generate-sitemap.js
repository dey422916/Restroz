const fs = require('fs');
const path = require('path');
const { BLOG_ARTICLES } = require('../src/data/blogArticles.ts');

const STATIC_URLS = [
  { loc: 'https://restroz.shop/', priority: '0.9', changefreq: 'daily' },
  { loc: 'https://restroz.shop/info', priority: '1.0', changefreq: 'daily' },
  { loc: 'https://restroz.shop/info/pricing', priority: '0.9', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/locations', priority: '0.85', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/blog', priority: '0.85', changefreq: 'daily' },

  // Features
  { loc: 'https://restroz.shop/info/features', priority: '0.8', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/features/pos-billing', priority: '0.85', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/features/gst-billing', priority: '0.85', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/features/kot-kitchen', priority: '0.85', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/features/waiter-mobile-app', priority: '0.85', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/features/qr-digital-menu', priority: '0.8', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/features/inventory', priority: '0.8', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/features/table-management', priority: '0.8', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/features/menu-management', priority: '0.8', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/features/staff-management', priority: '0.8', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/features/reports-analytics', priority: '0.8', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/features/loyalty-rewards', priority: '0.8', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/features/multi-outlet', priority: '0.8', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/features/restaurant-website', priority: '0.8', changefreq: 'weekly' },

  // Solutions
  { loc: 'https://restroz.shop/info/solutions', priority: '0.8', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/solutions/restaurants', priority: '0.8', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/solutions/cafes', priority: '0.8', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/solutions/cloud-kitchens', priority: '0.8', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/solutions/quick-service-restaurants', priority: '0.8', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/solutions/fine-dining', priority: '0.8', changefreq: 'weekly' },
  { loc: 'https://restroz.shop/info/solutions/multi-outlet-restaurants', priority: '0.8', changefreq: 'weekly' },

  // Commercial & Legal
  { loc: 'https://restroz.shop/info/book-demo', priority: '0.85', changefreq: 'monthly' },
  { loc: 'https://restroz.shop/info/about', priority: '0.7', changefreq: 'monthly' },
  { loc: 'https://restroz.shop/info/contact', priority: '0.75', changefreq: 'monthly' },
  { loc: 'https://restroz.shop/info/faq', priority: '0.7', changefreq: 'monthly' },
  { loc: 'https://restroz.shop/info/privacy-policy', priority: '0.5', changefreq: 'monthly' },
  { loc: 'https://restroz.shop/info/terms', priority: '0.5', changefreq: 'monthly' },
  { loc: 'https://restroz.shop/info/data-deletion', priority: '0.5', changefreq: 'monthly' },
];

const blogUrls = BLOG_ARTICLES.map(art => ({
  loc: `https://restroz.shop/info/blog/${art.slug}`,
  priority: '0.8',
  changefreq: 'monthly',
}));

const allUrls = [...STATIC_URLS, ...blogUrls];
const today = '2026-10-25';

const xmlLines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...allUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`),
  '</urlset>',
  '',
];

const xmlContent = xmlLines.join('\n');

const rootSitemapPath = path.join(__dirname, '..', 'public', 'sitemap.xml');
const infoSitemapPath = path.join(__dirname, '..', 'public', 'info', 'sitemap.xml');

fs.writeFileSync(rootSitemapPath, xmlContent, 'utf8');
fs.writeFileSync(infoSitemapPath, xmlContent, 'utf8');

console.log(`✅ Generated canonical sitemaps with ${allUrls.length} verified URLs at:`);
console.log(`   - ${rootSitemapPath}`);
console.log(`   - ${infoSitemapPath}`);
