const fs = require('fs');
const path = require('path');
const { MARKETING_PAGES, SITE_ORIGIN } = require('./seo-data.js');
const { BLOG_ARTICLES } = require('../src/data/blogArticles.ts');

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

if (!fs.existsSync(indexPath)) {
  console.error('❌ FATAL: dist/index.html not found.');
  process.exit(1);
}

const baseIndexHtml = fs.readFileSync(indexPath, 'utf8');

/**
 * Replace or inject head tags into an HTML template
 */
function createPageHtml({ title, description, keywords, canonical, schema, semanticBody }) {
  let html = baseIndexHtml;

  // 1. Title
  if (html.includes('<title>')) {
    html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
  } else {
    html = html.replace('</head>', `<title>${title}</title>\n</head>`);
  }

  // 2. Head Tags (Description, Keywords, Canonical, Robots, OG, Twitter)
  const headMetaTags = `
    <meta name="description" content="${description}" />
    <meta name="keywords" content="${keywords}" />
    <link rel="canonical" href="${canonical}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />

    <!-- Open Graph -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="https://restroz.shop/restroz-logo.png" />
    <meta property="og:site_name" content="RestroZ" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${canonical}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="https://restroz.shop/restroz-logo.png" />
  `;

  // Remove any previously injected meta tags or duplicate canonicals
  html = html.replace(/<link rel="canonical"[\s\S]*?\/>/g, '');
  html = html.replace(/<meta name="description"[\s\S]*?>/g, '');
  html = html.replace(/<meta name="keywords"[\s\S]*?>/g, '');
  html = html.replace(/<meta property="og:[^"]*"[\s\S]*?>/g, '');
  html = html.replace(/<meta name="twitter:[^"]*"[\s\S]*?>/g, '');

  // Inject fresh meta tags before </head>
  html = html.replace('</head>', `${headMetaTags}\n</head>`);

  // 3. Schema.org JSON-LD
  if (schema) {
    const schemaScript = `
    <script type="application/ld+json">
    ${JSON.stringify(schema, null, 2)}
    </script>
    `;
    html = html.replace('</head>', `${schemaScript}\n</head>`);
  }

  // 4. Semantic Body inside <div id="root">
  if (semanticBody && html.includes('<div id="root"></div>')) {
    html = html.replace('<div id="root"></div>', `<div id="root">${semanticBody}</div>`);
  }

  return html;
}

// ---------------------------------------------------------------------------
// 1. UPDATE dist/index.html (ROOT MARKETPLACE / APEX)
// ---------------------------------------------------------------------------
const rootHtml = createPageHtml({
  title: 'Best Restaurant POS Software in India | RestroZ',
  description:
    'Discover RestroZ restaurant POS software for billing, KOT printing, table management, inventory, QR menus and sales reports. Explore features and book a demo.',
  keywords:
    'best restaurant POS software in India, restaurant billing software India, restaurant POS software, cloud restaurant POS, KOT printing software',
  canonical: 'https://restroz.shop/info',
  semanticBody: `
    <noscript>
      <div style="padding: 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; line-height: 1.6;">
        <h1>RestroZ — Restaurant POS & Management Software for Modern Indian Restaurants</h1>
        <p>RestroZ is the modern cloud restaurant operating system. Empower your food business with table-side waiter ordering, automated kitchen order ticket (KOT) thermal printing, contactless table QR digital menus, real-time recipe costing, inventory control, and multi-outlet management.</p>
        <p>Visit our product homepage at <a href="https://restroz.shop/info">https://restroz.shop/info</a> or explore <a href="https://restroz.shop/info/pricing">Plans & Pricing</a>.</p>
      </div>
    </noscript>
  `,
});

fs.writeFileSync(indexPath, rootHtml, 'utf8');
console.log('✅ Updated dist/index.html (Canonical: https://restroz.shop/info)');

// ---------------------------------------------------------------------------
// 2. PRE-RENDER MARKETING PAGES
// ---------------------------------------------------------------------------
let preRenderedCount = 0;

for (const page of MARKETING_PAGES) {
  const pageDir = path.join(distDir, page.path.replace(/^\//, ''));
  fs.mkdirSync(pageDir, { recursive: true });
  const pageFile = path.join(pageDir, 'index.html');

  const defaultBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 48px 20px;">
      <a href="/info" style="color: #FC8019; font-weight: 700; text-decoration: none;">← Back to RestroZ Home</a>
      <h1 style="font-size: 36px; font-weight: 900; color: #0F172A; margin: 24px 0 16px;">${page.h1 || page.title}</h1>
      <p style="font-size: 17px; color: #475569; line-height: 1.6;">${page.description}</p>
      <div style="margin-top: 32px;">
        <a href="/info/book-demo" style="background: #FC8019; color: #FFF; padding: 12px 24px; border-radius: 8px; font-weight: 700; text-decoration: none;">Schedule a Live Demo →</a>
      </div>
    </div>
  `;

  const pageHtml = createPageHtml({
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    canonical: page.canonical,
    schema: page.schema,
    semanticBody: page.semanticHtml || defaultBody,
  });

  fs.writeFileSync(pageFile, pageHtml, 'utf8');
  if (page.path !== '/') {
    const directFile = path.join(distDir, page.path.replace(/^\//, '') + '.html');
    fs.mkdirSync(path.dirname(directFile), { recursive: true });
    fs.writeFileSync(directFile, pageHtml, 'utf8');
  }
  preRenderedCount++;
}

console.log(`✅ Pre-rendered ${preRenderedCount} primary marketing pages into dist/`);

// ---------------------------------------------------------------------------
// 3. PRE-RENDER 12 BLOG ARTICLES
// ---------------------------------------------------------------------------
let blogPreRenderedCount = 0;

for (const art of BLOG_ARTICLES) {
  const artDir = path.join(distDir, 'info', 'blog', art.slug);
  fs.mkdirSync(artDir, { recursive: true });
  const artFile = path.join(artDir, 'index.html');

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: art.title,
    description: art.excerpt,
    datePublished: art.publishedDate,
    dateModified: art.updatedDate,
    author: {
      '@type': 'Person',
      name: art.author.name,
      jobTitle: art.author.role,
    },
    publisher: {
      '@type': 'Organization',
      name: 'RestroZ',
      url: 'https://restroz.shop/info',
      logo: {
        '@type': 'ImageObject',
        url: 'https://restroz.shop/restroz-logo.png',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://restroz.shop/info/blog/${art.slug}`,
    },
  };

  const sectionsHtml = art.sections
    .map(
      (s) => `
      <section style="margin-bottom: 32px;">
        <h2 style="font-size: 24px; font-weight: 800; color: #0F172A; margin: 24px 0 12px;">${s.heading}</h2>
        ${s.subheading ? `<h3 style="font-size: 18px; font-weight: 700; color: #334155; margin: 16px 0 8px;">${s.subheading}</h3>` : ''}
        ${s.paragraphs.map((p) => `<p style="font-size: 16px; color: #334155; line-height: 1.6; margin-bottom: 12px;">${p}</p>`).join('')}
        ${
          s.bulletPoints
            ? `<ul style="padding-left: 20px; font-size: 15px; color: #334155; line-height: 1.8;">${s.bulletPoints.map((bp) => `<li>${bp}</li>`).join('')}</ul>`
            : ''
        }
        ${
          s.callout
            ? `<div style="background: #FFF7ED; border-left: 4px solid #EA580C; padding: 16px; border-radius: 8px; margin: 16px 0;"><strong>${s.callout.title}</strong><p style="margin: 6px 0 0; color: #475569;">${s.callout.text}</p></div>`
            : ''
        }
      </section>
    `
    )
    .join('');

  const takeawaysHtml = art.keyTakeaways && art.keyTakeaways.length > 0
    ? `
      <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
        <h3 style="font-size: 16px; font-weight: 800; color: #1E40AF; margin: 0 0 12px;">💡 Key Takeaways for Restaurant Owners</h3>
        <ul style="padding-left: 20px; margin: 0; color: #1E3A8A; font-size: 14px; line-height: 1.8;">
          ${art.keyTakeaways.map((t) => `<li>${t}</li>`).join('')}
        </ul>
      </div>
    `
    : '';

  const articleSemanticBody = `
    <header style="padding: 16px 24px; background: #FAF9F6; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; max-width: 1200px; margin: 0 auto;">
      <a href="/info" style="font-weight: 900; font-size: 22px; color: #0F172A; text-decoration: none;">RestroZ <span style="font-size: 11px; background: #FC8019; color: #FFF; padding: 2px 6px; border-radius: 4px; vertical-align: middle;">POS</span></a>
      <nav style="display: flex; gap: 20px;">
        <a href="/info/blog" style="color: #475569; text-decoration: none; font-weight: 600; font-size: 14px;">← Back to Blog</a>
        <a href="/info/book-demo" style="background: #FC8019; color: #FFF; padding: 6px 14px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px;">Book Demo</a>
      </nav>
    </header>

    <article style="max-width: 860px; margin: 0 auto; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A;">
      <nav style="font-size: 13px; color: #64748B; margin-bottom: 20px;">
        <a href="/info" style="color: #64748B; text-decoration: none;">Home</a> /
        <a href="/info/blog" style="color: #64748B; text-decoration: none;">Blog</a> /
        <span>${art.category}</span>
      </nav>

      <span style="background: #FFF4EB; color: #EA580C; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 4px;">${art.category}</span>
      <h1 style="font-size: 36px; font-weight: 900; line-height: 1.25; margin: 16px 0 16px; color: #0F172A;">${art.title}</h1>
      <p style="font-size: 17px; color: #475569; line-height: 1.6; margin-bottom: 24px;">${art.excerpt}</p>

      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #E2E8F0; border-bottom: 1px solid #E2E8F0; padding: 12px 0; margin-bottom: 32px; font-size: 13px; color: #64748B;">
        <span>By ${art.author.name} (${art.author.role})</span>
        <span>Published: ${art.publishedDate} • ${art.readingTime}</span>
      </div>

      ${takeawaysHtml}

      ${sectionsHtml}

      <div style="background: #0B132B; color: #FFF; border-radius: 16px; padding: 32px; margin-top: 48px; text-align: center;">
        <h3 style="font-size: 22px; font-weight: 800; margin: 0 0 10px; color: #FFF;">Ready to Streamline Your Restaurant Operations?</h3>
        <p style="color: #94A3B8; font-size: 15px; margin: 0 0 20px;">Experience fast counter billing, instant thermal KOT printing, and table-side ordering.</p>
        <a href="/info/book-demo" style="background: #FC8019; color: #FFF; padding: 12px 24px; border-radius: 8px; font-weight: 700; text-decoration: none; display: inline-block;">Schedule a Free Live Demo →</a>
      </div>
    </article>
  `;

  const artHtml = createPageHtml({
    title: art.seo.title,
    description: art.seo.description,
    keywords: art.seo.keywords.join(', '),
    canonical: `https://restroz.shop/info/blog/${art.slug}`,
    schema: articleSchema,
    semanticBody: articleSemanticBody,
  });

  fs.writeFileSync(artFile, artHtml, 'utf8');
  const directArtFile = path.join(distDir, 'info', 'blog', art.slug + '.html');
  fs.writeFileSync(directArtFile, artHtml, 'utf8');
  blogPreRenderedCount++;
}

console.log(`✅ Pre-rendered ${blogPreRenderedCount} individual blog article pages into dist/`);

// ---------------------------------------------------------------------------
// 4. COPY 404.HTML & PUBLIC ASSETS
// ---------------------------------------------------------------------------
fs.copyFileSync(indexPath, notFoundPath);
console.log('✅ Generated dist/404.html for SPA route fallback');

if (fs.existsSync(redirectsPath)) {
  fs.unlinkSync(redirectsPath);
}

if (fs.existsSync(publicDir)) {
  copyDirRecursive(publicDir, distDir);
  console.log('✅ Synchronized public assets (sitemaps, robots.txt, logo) into dist/');
}

console.log('🎉 Production web pre-rendering complete!');
