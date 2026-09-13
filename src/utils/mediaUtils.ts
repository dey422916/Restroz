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

/**
 * Extracts the clean image URL without position hash fragment (e.g. #pos=40).
 */
export function extractBannerCleanUrl(rawUrl?: string | null): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  const hashIdx = trimmed.indexOf('#pos=');
  if (hashIdx !== -1) {
    return trimmed.substring(0, hashIdx).trim();
  }
  const altHashIdx = trimmed.indexOf('#y=');
  if (altHashIdx !== -1) {
    return trimmed.substring(0, altHashIdx).trim();
  }
  return trimmed;
}

/**
 * Extracts vertical focal position percentage (0 to 100) from banner URL fragment.
 * Default is 50 (center).
 */
export function extractBannerPosY(rawUrl?: string | null): number {
  if (!rawUrl) return 50;
  const match = rawUrl.match(/#(?:pos|y)=(\d+(?:\.\d+)?)/);
  if (match && match[1]) {
    const val = parseFloat(match[1]);
    if (!isNaN(val)) {
      return Math.min(100, Math.max(0, Math.round(val)));
    }
  }
  return 50;
}

/**
 * Formats clean banner URL with vertical focal position tag.
 */
export function formatBannerWithPosY(url: string, posY: number): string {
  const clean = extractBannerCleanUrl(url);
  if (!clean) return '';
  const clamped = Math.min(100, Math.max(0, Math.round(posY)));
  return `${clean}#pos=${clamped}`;
}
