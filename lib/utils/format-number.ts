/**
 * Formats a number into an abbreviated form (e.g., 1.1k, 2.5M)
 *
 * @param num - The number to format
 * @returns The formatted string
 *
 * @example
 * formatAbbreviatedNumber(1109) // "1.1k"
 * formatAbbreviatedNumber(1500) // "1.5k"
 * formatAbbreviatedNumber(1000000) // "1M"
 * formatAbbreviatedNumber(500) // "500"
 */
export function formatAbbreviatedNumber(num: number): string {
  if (num >= 1000000) {
    const formatted = (num / 1000000).toFixed(1)
    // Remove .0 if present
    return formatted.endsWith('.0') ? `${Math.floor(num / 1000000)}M` : `${formatted}M`
  }

  if (num >= 1000) {
    const formatted = (num / 1000).toFixed(1)
    // Remove .0 if present
    return formatted.endsWith('.0') ? `${Math.floor(num / 1000)}k` : `${formatted}k`
  }

  return num.toString()
}
