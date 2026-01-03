/**
 * Pure string utility functions for translation and XML handling.
 * These functions have no external dependencies and are easy to unit test.
 */

/**
 * Escape special XML characters in a string.
 * @param str - The string to escape
 * @returns The escaped string safe for XML content
 */
export function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Unescape XML entities back to their original characters.
 * @param str - The escaped string
 * @returns The unescaped string
 */
export function xmlUnescape(str: string): string {
  return str
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

/**
 * Clean AI-generated translation text by removing unwanted formatting.
 * Removes quotation marks, markdown formatting, and extra whitespace.
 * @param text - The raw translation text from AI
 * @returns Cleaned translation text
 */
export function cleanTranslation(text: string): string {
  return text
    .replace(/^['\"""«»„"]|['\"""«»„"]$/g, '')  // Remove surrounding quotes
    .replace(/[*_]/g, '')                        // Remove markdown bold/italic
    .replace(/&quot;/g, '"')                     // Decode HTML entities
    .trim();
}

/**
 * Normalize XML content for comparison by collapsing whitespace.
 * @param str - The XML content string
 * @returns Normalized string with collapsed whitespace
 */
export function normalizeXml(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Calculate combined confidence score from probability data.
 * Uses weighted average (70%) and minimum probability (30%).
 * @param probabilities - Array of token probabilities (0-1)
 * @param defaultValue - Default confidence if no probabilities provided
 * @returns Combined confidence score (0-1)
 */
export function calculateConfidence(
  probabilities: number[],
  defaultValue: number = 0.7
): number {
  if (probabilities.length === 0) {
    return defaultValue;
  }

  const avgProb = probabilities.reduce((a, b) => a + b, 0) / probabilities.length;
  const minProb = Math.min(...probabilities);
  const combined = (avgProb * 0.7) + (minProb * 0.3);

  return parseFloat(combined.toFixed(2));
}

/**
 * Convert log probability to probability.
 * @param logprob - Log probability value
 * @returns Probability value (0-1)
 */
export function logProbToProbability(logprob: number): number {
  return Math.exp(logprob);
}

/**
 * Check if a string is likely a tooltip or long description.
 * Used to filter out non-translatable content.
 * @param text - The text to check
 * @param maxLength - Maximum length threshold
 * @returns True if the text appears to be a tooltip/description
 */
export function isLikelyTooltip(text: string, maxLength: number = 60): boolean {
  const hasTerminalPunctuation = /[.,;]/.test(text);
  const isTooLong = text.length > maxLength;
  return hasTerminalPunctuation && isTooLong;
}

/**
 * Check if a string is too long for fuzzy matching.
 * @param text - The text to check
 * @param maxChars - Maximum character count
 * @param maxWords - Maximum word count
 * @returns True if the text is too long
 */
export function isTooLongForFuzzy(
  text: string,
  maxChars: number = 80,
  maxWords: number = 8
): boolean {
  const charCount = text.length;
  const wordCount = text.split(/\s+/).length;
  return charCount > maxChars || wordCount > maxWords;
}

/**
 * Extract words from text for fuzzy matching.
 * Filters out single-character words.
 * @param text - The source text
 * @param minLength - Minimum word length to include
 * @returns Array of words
 */
export function extractWords(text: string, minLength: number = 2): string[] {
  return text.split(/\s+/).filter(word => word.length >= minLength);
}

/**
 * Format confidence score as percentage string.
 * @param confidence - Confidence value (0-1)
 * @returns Formatted percentage string
 */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Determine confidence level category.
 * @param confidence - Confidence value (0-1)
 * @returns 'high' | 'medium' | 'low'
 */
export function getConfidenceLevel(
  confidence: number
): 'high' | 'medium' | 'low' {
  if (confidence >= 0.9) return 'high';
  if (confidence >= 0.7) return 'medium';
  return 'low';
}
