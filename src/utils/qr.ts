import { DiningTable } from '../types';

export function getAppBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_APP_URL ? process.env.EXPO_PUBLIC_APP_URL.replace(/\/$/, '') : '';
  if (envUrl) {
    return envUrl;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://restroz.shop';
}

export function getTableQrUrl(tableId: string): string {
  const origin = getAppBaseUrl();
  return `${origin}/menu/table/${encodeURIComponent(tableId)}`;
}

export function getMarketplaceUrl(restaurantId?: string): string {
  const origin = getAppBaseUrl();
  return restaurantId ? `${origin}/restaurant/${encodeURIComponent(restaurantId)}` : `${origin}/explore`;
}

export function getOrderTrackingUrl(orderId: string): string {
  const origin = getAppBaseUrl();
  return `${origin}/order/${encodeURIComponent(orderId)}`;
}

export function getResetPasswordUrl(): string {
  const origin = getAppBaseUrl();
  return `${origin}/(auth)/reset-password`;
}

export function parseTableIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/menu\/table\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function findMatchingTable(tables: DiningTable[], param: string | null | undefined): DiningTable | null {
  if (!param || param === 'general') return null;
  const cleanParam = param.toLowerCase().replace(/[-_ ]/g, ''); // e.g. "tbl1", "table1", "1"

  return (
    tables.find((t) => {
      const cleanId = t.id.toLowerCase().replace(/[-_ ]/g, '');
      const cleanNum = t.table_number.toLowerCase().replace(/[-_ ]/g, '');
      return (
        t.id === param ||
        t.table_number.toLowerCase() === param.toLowerCase() ||
        cleanId === cleanParam ||
        cleanNum === cleanParam ||
        cleanNum === `table${cleanParam}` ||
        cleanId === `tbl${cleanParam}` ||
        `table${cleanId}` === cleanParam ||
        cleanId.endsWith(cleanParam) ||
        cleanNum.endsWith(cleanParam)
      );
    }) || null
  );
}
