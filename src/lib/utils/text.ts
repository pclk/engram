export const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

export const truncateText = (value: string, maxLength: number) => {
  if (maxLength <= 0) return '';
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(maxLength - 1, 0))}…`;
};
