const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// 1. Ensure NODE_ENV is set to production
process.env.NODE_ENV = 'production';

// 2. Load .env.production into process.env
const prodEnvPath = path.join(__dirname, '..', '.env.production');
if (fs.existsSync(prodEnvPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(prodEnvPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
  console.log('✅ Loaded production environment from .env.production');
} else {
  console.warn('⚠️ .env.production not found, relying on system environment variables.');
}

// 3. Validate required production environment variables
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ FATAL: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set for production web export.');
  process.exit(1);
}

if (supabaseUrl.includes('<your-') || supabaseAnonKey.includes('<your-')) {
  console.error('❌ FATAL: Production environment variables contain placeholder values.');
  process.exit(1);
}

console.log(`🚀 Exporting production web bundle targeting: ${supabaseUrl}`);

// 4. Run Expo export for web platform with cache cleared
try {
  execSync('npx expo export --platform web --clear', {
    stdio: 'inherit',
    env: process.env,
  });
} catch (err) {
  console.error('❌ Expo web export failed:', err);
  process.exit(1);
}

// 5. Generate canonical sitemaps
console.log('🗺️ Generating canonical XML sitemaps...');
require('./generate-sitemap.js');

// 6. Post-export SPA & SEO pre-rendering for Cloudflare Workers
console.log('🚀 Running SEO pre-rendering and asset optimization...');
require('./post-export-web.js');

console.log('🎉 Production web bundle and all pre-rendered marketing pages ready in dist/ for Cloudflare deployment.');

