import { DiningTable } from '../types';

export function getTableQrUrl(tableId: string): string {
  if (typeof window !== 'undefined' && (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1')) {
    return `${window.location.origin}/menu/table/${encodeURIComponent(tableId)}`;
  }
  const envUrl = process.env.EXPO_PUBLIC_APP_URL ? process.env.EXPO_PUBLIC_APP_URL.replace(/\/$/, '') : '';
  const origin = envUrl || (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://restroz.shop');
  return `${origin}/menu/table/${encodeURIComponent(tableId)}`;
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
