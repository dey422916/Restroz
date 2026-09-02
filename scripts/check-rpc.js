const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const options = {
  hostname: 'szpjsibrwxegaopcaukb.supabase.co',
  path: '/rest/v1/',
  method: 'GET',
  headers: {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
  },
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', (d) => { body += d; });
  res.on('end', () => {
    try {
      const json = JSON.parse(body);
      console.log('Available OpenAPI Paths / RPCs:');
      const paths = Object.keys(json.paths || {});
      console.log(paths.filter(p => p.includes('rpc')));
    } catch(e) {
      console.log('Response body:', body.slice(0, 300));
    }
  });
});

req.on('error', (e) => console.error(e));
req.end();
