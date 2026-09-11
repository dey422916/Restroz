/**
 * Natural Sort Comparison Utility
 *
 * Works consistently across all JavaScript engines (Hermes on React Native,
 * V8, JSC, etc.) without relying on Intl.Collator or localeCompare options
 * which are unsupported or incomplete in React Native Hermes.
 *
 * Correctly sorts e.g.:
 * ['Table 1', 'Table 10', 'Table 2', 'Table 20', 'Table 3']
 * -> ['Table 1', 'Table 2', 'Table 3', 'Table 10', 'Table 20']
 */

export function naturalCompare(a: string = '', b: string = ''): number {
  const strA = (a || '').trim();
  const strB = (b || '').trim();

  if (strA === strB) return 0;
  if (!strA) return -1;
  if (!strB) return 1;

  const re = /(\d+)|(\D+)/g;
  const aChunks: (string | number)[] = [];
  const bChunks: (string | number)[] = [];

  let match: RegExpExecArray | null;
  while ((match = re.exec(strA)) !== null) {
    if (match[1] !== undefined) {
      aChunks.push(parseInt(match[1], 10));
    } else {
      aChunks.push(match[2].toLowerCase());
    }
  }

  re.lastIndex = 0;
  while ((match = re.exec(strB)) !== null) {
    if (match[1] !== undefined) {
      bChunks.push(parseInt(match[1], 10));
    } else {
      bChunks.push(match[2].toLowerCase());
    }
  }

  const len = Math.max(aChunks.length, bChunks.length);
  for (let i = 0; i < len; i++) {
    if (aChunks[i] === undefined) return -1;
    if (bChunks[i] === undefined) return 1;

    const valA = aChunks[i];
    const valB = bChunks[i];

    if (typeof valA === 'number' && typeof valB === 'number') {
      if (valA !== valB) return valA - valB;
    } else {
      const sA = String(valA);
      const sB = String(valB);
      if (sA !== sB) {
        return sA < sB ? -1 : 1;
      }
    }
  }

  return 0;
}

export function naturalTableCompare(
  a: { table_number?: string } | string | null | undefined,
  b: { table_number?: string } | string | null | undefined
): number {
  const numA = typeof a === 'string' ? a : a?.table_number || '';
  const numB = typeof b === 'string' ? b : b?.table_number || '';
  return naturalCompare(numA, numB);
}
