export function formatCurrency(amount: number | undefined | null, symbol = '₹'): string {
  const value = Number(amount) || 0;
  return `${symbol}${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function roundToTwoDecimals(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function formatPrice(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(Number(amount))) return '0';
  const num = Number(amount);
  if (num % 1 === 0) return num.toString();
  return num.toFixed(2);
}

export function numberToWords(amount: number): string {
  const integerPart = Math.floor(amount);
  const paise = Math.round((amount - integerPart) * 100);

  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertChunk(n: number): string {
    if (n === 0) return '';
    if (n < 20) return units[n] + ' ';
    if (n < 100) return tens[Math.floor(n / 10)] + ' ' + (n % 10 !== 0 ? units[n % 10] + ' ' : '');
    return units[Math.floor(n / 100)] + ' Hundred ' + (n % 100 !== 0 ? convertChunk(n % 100) : '');
  }

  if (integerPart === 0 && paise === 0) return 'Rupees Zero Only';

  let str = '';
  let temp = integerPart;

  if (Math.floor(temp / 10000000) > 0) {
    str += convertChunk(Math.floor(temp / 10000000)) + 'Crore ';
    temp %= 10000000;
  }
  if (Math.floor(temp / 100000) > 0) {
    str += convertChunk(Math.floor(temp / 100000)) + 'Lakh ';
    temp %= 100000;
  }
  if (Math.floor(temp / 1000) > 0) {
    str += convertChunk(Math.floor(temp / 1000)) + 'Thousand ';
    temp %= 1000;
  }
  if (temp > 0) {
    str += convertChunk(temp);
  }

  let result = 'Rupees ' + str.trim();
  if (paise > 0) {
    result += ' and ' + convertChunk(paise).trim() + ' Paise';
  }
  return result + ' Only';
}
