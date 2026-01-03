"use strict";
/**
 * Unit tests for string utility functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
const stringUtils_1 = require("../../src/utils/stringUtils");
describe('xmlEscape', () => {
    it('should escape ampersand', () => {
        expect((0, stringUtils_1.xmlEscape)('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });
    it('should escape less than', () => {
        expect((0, stringUtils_1.xmlEscape)('a < b')).toBe('a &lt; b');
    });
    it('should escape greater than', () => {
        expect((0, stringUtils_1.xmlEscape)('a > b')).toBe('a &gt; b');
    });
    it('should escape double quotes', () => {
        expect((0, stringUtils_1.xmlEscape)('say "hello"')).toBe('say &quot;hello&quot;');
    });
    it('should escape single quotes', () => {
        expect((0, stringUtils_1.xmlEscape)("it's")).toBe('it&apos;s');
    });
    it('should escape all special characters together', () => {
        expect((0, stringUtils_1.xmlEscape)('<div class="test">Tom & Jerry\'s</div>'))
            .toBe('&lt;div class=&quot;test&quot;&gt;Tom &amp; Jerry&apos;s&lt;/div&gt;');
    });
    it('should handle empty string', () => {
        expect((0, stringUtils_1.xmlEscape)('')).toBe('');
    });
    it('should handle string with no special characters', () => {
        expect((0, stringUtils_1.xmlEscape)('Hello World')).toBe('Hello World');
    });
});
describe('xmlUnescape', () => {
    it('should unescape ampersand', () => {
        expect((0, stringUtils_1.xmlUnescape)('Tom &amp; Jerry')).toBe('Tom & Jerry');
    });
    it('should unescape all entities', () => {
        expect((0, stringUtils_1.xmlUnescape)('&lt;div&gt;&quot;test&quot;&apos;s&lt;/div&gt;'))
            .toBe('<div>"test"\'s</div>');
    });
    it('should handle empty string', () => {
        expect((0, stringUtils_1.xmlUnescape)('')).toBe('');
    });
    it('should be inverse of xmlEscape', () => {
        const original = '<tag attr="value">Tom & Jerry\'s</tag>';
        expect((0, stringUtils_1.xmlUnescape)((0, stringUtils_1.xmlEscape)(original))).toBe(original);
    });
});
describe('cleanTranslation', () => {
    it('should remove surrounding double quotes', () => {
        expect((0, stringUtils_1.cleanTranslation)('"Hello World"')).toBe('Hello World');
    });
    it('should remove surrounding single quotes', () => {
        expect((0, stringUtils_1.cleanTranslation)("'Hello World'")).toBe('Hello World');
    });
    it('should remove curly quotes', () => {
        expect((0, stringUtils_1.cleanTranslation)('"Hello World"')).toBe('Hello World');
        expect((0, stringUtils_1.cleanTranslation)('„Hello World"')).toBe('Hello World');
    });
    it('should remove guillemets', () => {
        expect((0, stringUtils_1.cleanTranslation)('«Hello World»')).toBe('Hello World');
    });
    it('should remove markdown asterisks', () => {
        expect((0, stringUtils_1.cleanTranslation)('*bold* text')).toBe('bold text');
    });
    it('should remove markdown underscores', () => {
        expect((0, stringUtils_1.cleanTranslation)('_italic_ text')).toBe('italic text');
    });
    it('should decode &quot;', () => {
        expect((0, stringUtils_1.cleanTranslation)('say &quot;hello&quot;')).toBe('say "hello"');
    });
    it('should trim whitespace', () => {
        expect((0, stringUtils_1.cleanTranslation)('  Hello World  ')).toBe('Hello World');
    });
    it('should handle empty string', () => {
        expect((0, stringUtils_1.cleanTranslation)('')).toBe('');
    });
    it('should handle complex AI output', () => {
        expect((0, stringUtils_1.cleanTranslation)('"*Nastavení e-shopu*"')).toBe('Nastavení e-shopu');
    });
});
describe('normalizeXml', () => {
    it('should collapse multiple spaces', () => {
        expect((0, stringUtils_1.normalizeXml)('Hello    World')).toBe('Hello World');
    });
    it('should collapse tabs and newlines', () => {
        expect((0, stringUtils_1.normalizeXml)('Hello\t\n\rWorld')).toBe('Hello World');
    });
    it('should trim leading and trailing whitespace', () => {
        expect((0, stringUtils_1.normalizeXml)('  Hello World  ')).toBe('Hello World');
    });
    it('should handle empty string', () => {
        expect((0, stringUtils_1.normalizeXml)('')).toBe('');
    });
});
describe('calculateConfidence', () => {
    it('should return default value for empty array', () => {
        expect((0, stringUtils_1.calculateConfidence)([])).toBe(0.7);
        expect((0, stringUtils_1.calculateConfidence)([], 0.5)).toBe(0.5);
    });
    it('should calculate weighted average for single probability', () => {
        // Single value: avg = 0.9, min = 0.9
        // combined = 0.9 * 0.7 + 0.9 * 0.3 = 0.63 + 0.27 = 0.9
        expect((0, stringUtils_1.calculateConfidence)([0.9])).toBe(0.9);
    });
    it('should weight average more than minimum', () => {
        // probabilities: [0.9, 0.5]
        // avg = 0.7, min = 0.5
        // combined = 0.7 * 0.7 + 0.5 * 0.3 = 0.49 + 0.15 = 0.64
        expect((0, stringUtils_1.calculateConfidence)([0.9, 0.5])).toBe(0.64);
    });
    it('should handle uniform probabilities', () => {
        // All same: avg = min = 0.8
        // combined = 0.8 * 0.7 + 0.8 * 0.3 = 0.8
        expect((0, stringUtils_1.calculateConfidence)([0.8, 0.8, 0.8])).toBe(0.8);
    });
    it('should round to 2 decimal places', () => {
        // This ensures consistent precision
        const result = (0, stringUtils_1.calculateConfidence)([0.95, 0.85, 0.75]);
        expect(result.toString()).toMatch(/^\d+\.?\d{0,2}$/);
    });
});
describe('logProbToProbability', () => {
    it('should convert log probability 0 to 1', () => {
        expect((0, stringUtils_1.logProbToProbability)(0)).toBe(1);
    });
    it('should convert negative log probability to < 1', () => {
        expect((0, stringUtils_1.logProbToProbability)(-1)).toBeCloseTo(0.368, 2);
    });
    it('should convert very negative log probability to near 0', () => {
        expect((0, stringUtils_1.logProbToProbability)(-10)).toBeCloseTo(0.000045, 5);
    });
});
describe('isLikelyTooltip', () => {
    it('should return true for long text with punctuation', () => {
        const longText = 'This is a very long tooltip description that explains something in detail.';
        expect((0, stringUtils_1.isLikelyTooltip)(longText)).toBe(true);
    });
    it('should return false for short text with punctuation', () => {
        expect((0, stringUtils_1.isLikelyTooltip)('Short.')).toBe(false);
    });
    it('should return false for long text without punctuation', () => {
        const longText = 'This is a very long text without any terminal punctuation marks';
        expect((0, stringUtils_1.isLikelyTooltip)(longText)).toBe(false);
    });
    it('should respect custom maxLength', () => {
        expect((0, stringUtils_1.isLikelyTooltip)('Short text.', 5)).toBe(true);
        expect((0, stringUtils_1.isLikelyTooltip)('Short text.', 100)).toBe(false);
    });
});
describe('isTooLongForFuzzy', () => {
    it('should return true for text exceeding max chars', () => {
        const longText = 'a'.repeat(81);
        expect((0, stringUtils_1.isTooLongForFuzzy)(longText)).toBe(true);
    });
    it('should return true for text exceeding max words', () => {
        const manyWords = 'one two three four five six seven eight nine';
        expect((0, stringUtils_1.isTooLongForFuzzy)(manyWords)).toBe(true);
    });
    it('should return false for short text', () => {
        expect((0, stringUtils_1.isTooLongForFuzzy)('E-shop Setup Card')).toBe(false);
    });
    it('should respect custom limits', () => {
        expect((0, stringUtils_1.isTooLongForFuzzy)('Hello World', 5, 10)).toBe(true); // Too many chars
        expect((0, stringUtils_1.isTooLongForFuzzy)('Hello World', 100, 1)).toBe(true); // Too many words
        expect((0, stringUtils_1.isTooLongForFuzzy)('Hello World', 100, 10)).toBe(false);
    });
});
describe('extractWords', () => {
    it('should split text into words', () => {
        expect((0, stringUtils_1.extractWords)('Hello World')).toEqual(['Hello', 'World']);
    });
    it('should filter out single-character words by default', () => {
        expect((0, stringUtils_1.extractWords)('I am a developer')).toEqual(['am', 'developer']);
    });
    it('should respect custom minimum length', () => {
        expect((0, stringUtils_1.extractWords)('I am a developer', 1)).toEqual(['I', 'am', 'a', 'developer']);
        expect((0, stringUtils_1.extractWords)('I am a developer', 4)).toEqual(['developer']);
    });
    it('should handle empty string', () => {
        expect((0, stringUtils_1.extractWords)('')).toEqual([]);
    });
    it('should handle multiple spaces', () => {
        expect((0, stringUtils_1.extractWords)('Hello    World')).toEqual(['Hello', 'World']);
    });
});
describe('formatConfidence', () => {
    it('should format as percentage', () => {
        expect((0, stringUtils_1.formatConfidence)(0.95)).toBe('95%');
        expect((0, stringUtils_1.formatConfidence)(0.7)).toBe('70%');
        expect((0, stringUtils_1.formatConfidence)(1)).toBe('100%');
        expect((0, stringUtils_1.formatConfidence)(0)).toBe('0%');
    });
    it('should round to nearest integer', () => {
        expect((0, stringUtils_1.formatConfidence)(0.956)).toBe('96%');
        expect((0, stringUtils_1.formatConfidence)(0.954)).toBe('95%');
    });
});
describe('getConfidenceLevel', () => {
    it('should return high for >= 0.9', () => {
        expect((0, stringUtils_1.getConfidenceLevel)(0.9)).toBe('high');
        expect((0, stringUtils_1.getConfidenceLevel)(0.95)).toBe('high');
        expect((0, stringUtils_1.getConfidenceLevel)(1)).toBe('high');
    });
    it('should return medium for >= 0.7 and < 0.9', () => {
        expect((0, stringUtils_1.getConfidenceLevel)(0.7)).toBe('medium');
        expect((0, stringUtils_1.getConfidenceLevel)(0.85)).toBe('medium');
        expect((0, stringUtils_1.getConfidenceLevel)(0.89)).toBe('medium');
    });
    it('should return low for < 0.7', () => {
        expect((0, stringUtils_1.getConfidenceLevel)(0.69)).toBe('low');
        expect((0, stringUtils_1.getConfidenceLevel)(0.5)).toBe('low');
        expect((0, stringUtils_1.getConfidenceLevel)(0)).toBe('low');
    });
});
//# sourceMappingURL=stringUtils.test.js.map