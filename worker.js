export default {
  async fetch(request, env) {
    // 1. Attempt to fetch the requested static file from Cloudflare Assets
    let response = await env.ASSETS.fetch(request);

    // 2. If not found (404) and request is a page navigation (GET/HEAD), rewrite to /index.html
    if (response.status === 404 && (request.method === 'GET' || request.method === 'HEAD')) {
      const url = new URL(request.url);
      const isFileWithExtension = /\.[a-zA-Z0-9]+$/.test(url.pathname);

      if (!isFileWithExtension) {
        const indexRequest = new Request(new URL('/index.html', url.origin), request);
        const indexResponse = await env.ASSETS.fetch(indexRequest);
        if (indexResponse.status === 200) {
          return indexResponse;
        }
      }
    }

    return response;
  },
};
