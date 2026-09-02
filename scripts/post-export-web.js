const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const indexPath = path.join(distDir, 'index.html');
const notFoundPath = path.join(distDir, '404.html');
const redirectsPath = path.join(distDir, '_redirects');

if (fs.existsSync(indexPath)) {
  // 1. Copy index.html -> 404.html for static hosting fallback
  fs.copyFileSync(indexPath, notFoundPath);
  console.log('✅ Created dist/404.html for SPA fallback');

  // 2. Remove any invalid _redirects file to prevent Cloudflare infinite loop error
  if (fs.existsSync(redirectsPath)) {
    fs.unlinkSync(redirectsPath);
    console.log('🧹 Cleaned up dist/_redirects (using native Cloudflare SPA handling)');
  }
} else {
  console.error('❌ dist/index.html not found! Run npx expo export --platform web first.');
}
