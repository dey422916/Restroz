/**
 * Parses and standardizes restaurant banner/gallery URLs from various formats:
 * - String array: ["url1", "url2"]
 * - JSON string array: '["url1", "url2"]'
 * - Delimited string: 'url1|||url2'
 * - Comma separated URLs
 * - Single image URL string
 */
export function parseBannerUrls(input?: any): string[] {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input.filter((u) => typeof u === 'string' && u.trim().length > 0);
  }

  if (typeof input !== 'string') return [];

  const trimmed = input.trim();
  if (!trimmed) return [];

  // 1. JSON Array string
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((u) => typeof u === 'string' && u.trim().length > 0);
      }
    } catch (e) {
      // ignore
    }
  }

  // 2. Delimiter |||
  if (trimmed.includes('|||')) {
    return trimmed.split('|||').map((u) => u.trim()).filter((u) => u.length > 0);
  }

  // 3. Comma-separated http URLs
  if (trimmed.includes(',') && trimmed.includes('http')) {
    const parts = trimmed.split(',').map((u) => u.trim()).filter((u) => u.length > 0);
    if (parts.length > 1 && parts.every((p) => p.startsWith('http') || p.startsWith('data:'))) {
      return parts;
    }
  }

  // 4. Single URL
  return [trimmed];
}
