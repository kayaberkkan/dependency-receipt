export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const value = bytes / Math.pow(k, i);

  if (value >= 100) return `${Math.round(value)} ${units[i]!}`;
  if (value >= 10) return `${value.toFixed(1)} ${units[i]!}`;
  return `${value.toFixed(2)} ${units[i]!}`;
}

export function padRight(str: string, width: number): string {
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

export function horizontalLine(char: string = '─', width: number = 60): string {
  return char.repeat(width);
}
