import { describe, expect, it } from 'vitest';
import { normalizeWhitespace, truncateText } from '@/src/lib/utils/text';

describe('text utils', () => {
  it('normalizes whitespace', () => {
    expect(normalizeWhitespace('  alpha\n\n beta\t gamma  ')).toBe('alpha beta gamma');
  });

  it('truncates and appends ellipsis when needed', () => {
    expect(truncateText('This is a very long title', 10)).toBe('This is a…');
  });

  it('returns empty string when maxLength is not positive', () => {
    expect(truncateText('hello', 0)).toBe('');
  });
});
