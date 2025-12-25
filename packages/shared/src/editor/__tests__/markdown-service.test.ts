/**
 * Markdown Service Property Tests
 * Tests for Phase 11: Editor Functionality
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  formatMarkdown,
  removeExtraBlankLines,
  trimTrailingWhitespace,
  normalizeListIndentation,
  normalizeHeadingSpacing,
  htmlToMarkdown,
  extractTitle,
  DEFAULT_FORMAT_OPTIONS,
} from '../markdown-service';

describe('Markdown Service Property Tests', () => {
  /**
   * **Feature: secure-notebook, Property 20: Markdown Round-Trip**
   * For any valid Markdown content, serializing and then deserializing 
   * should produce equivalent content.
   * **Validates: Requirements 7.4, 7.5**
   */
  describe('Property 20: Markdown Round-Trip', () => {
    it('formatting is idempotent (applying twice gives same result)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 1000 }),
          (content) => {
            const once = formatMarkdown(content);
            const twice = formatMarkdown(once);
            
            return once === twice;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('formatting preserves non-whitespace content', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 500 }),
          (content) => {
            const formatted = formatMarkdown(content);
            
            // Remove all whitespace and compare
            const originalNoWs = content.replace(/\s+/g, '');
            const formattedNoWs = formatted.replace(/\s+/g, '');
            
            return originalNoWs === formattedNoWs;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: secure-notebook, Property 21: HTML to Markdown Conversion**
   * For any HTML content containing tables, links, images, and code blocks,
   * converting to Markdown should preserve all these elements.
   * **Validates: Requirements 7.6, 7.8**
   */
  describe('Property 21: HTML to Markdown Conversion', () => {
    it('converts bold tags to Markdown', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('<') && !s.includes('>')),
          (text) => {
            const html = `<strong>${text}</strong>`;
            const md = htmlToMarkdown(html);
            
            return md.includes(`**${text}**`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('converts italic tags to Markdown', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('<') && !s.includes('>')),
          (text) => {
            const html = `<em>${text}</em>`;
            const md = htmlToMarkdown(html);
            
            return md.includes(`*${text}*`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('converts links to Markdown', () => {
      fc.assert(
        fc.property(
          fc.webUrl(),
          fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.includes('<') && !s.includes('>')),
          (url, text) => {
            const html = `<a href="${url}">${text}</a>`;
            const md = htmlToMarkdown(html);
            
            return md.includes(`[${text}](${url})`);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('converts images to Markdown', () => {
      fc.assert(
        fc.property(
          fc.webUrl(),
          fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.includes('"') && !s.includes('<')),
          (url, alt) => {
            const html = `<img src="${url}" alt="${alt}">`;
            const md = htmlToMarkdown(html);
            
            return md.includes(`![${alt}](${url})`);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('converts headings to Markdown', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 6 }),
          fc.stringMatching(/^[a-zA-Z0-9]+$/),
          (level, text) => {
            const html = `<h${level}>${text}</h${level}>`;
            const md = htmlToMarkdown(html);
            const expectedPrefix = '#'.repeat(level) + ' ';
            
            return md.includes(expectedPrefix + text);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('converts code blocks to Markdown', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.includes('<') && !s.includes('>')),
          (code) => {
            const html = `<pre><code>${code}</code></pre>`;
            const md = htmlToMarkdown(html);
            
            return md.includes('```') && md.includes(code);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('converts inline code to Markdown', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('<') && !s.includes('>')),
          (code) => {
            const html = `<code>${code}</code>`;
            const md = htmlToMarkdown(html);
            
            return md.includes(`\`${code}\``);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: secure-notebook, Property 22: Markdown Formatting Normalization**
   * For any Markdown content, applying one-click formatting should remove 
   * redundant blank lines, fix list indentation, and ensure consistent paragraph spacing.
   * **Validates: Requirements 7.7, 7.9**
   */
  describe('Property 22: Markdown Formatting Normalization', () => {
    it('removes more than 2 consecutive blank lines', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 10 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (blankCount, text) => {
            const content = `${text}${'\n'.repeat(blankCount)}${text}`;
            const formatted = removeExtraBlankLines(content);
            
            // Should not have more than 2 consecutive newlines
            return !formatted.includes('\n\n\n');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('trims trailing whitespace from lines', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 0, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
          (lines) => {
            const content = lines.map(l => l + '   ').join('\n');
            const formatted = trimTrailingWhitespace(content);
            
            // No line should end with whitespace
            return formatted.split('\n').every(line => line === line.trimEnd());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('normalizes list indentation to 2 spaces per level', () => {
      const content = '    - Item 1\n        - Item 2\n            - Item 3';
      const formatted = normalizeListIndentation(content);
      
      const lines = formatted.split('\n');
      expect(lines[0]).toBe('  - Item 1');
      expect(lines[1]).toBe('    - Item 2');
      expect(lines[2]).toBe('      - Item 3');
    });

    it('adds blank line before headings', () => {
      const content = 'Some text\n# Heading';
      const formatted = normalizeHeadingSpacing(content);
      
      expect(formatted).toBe('Some text\n\n# Heading');
    });

    it('does not add blank line before heading at start', () => {
      const content = '# Heading\nSome text';
      const formatted = normalizeHeadingSpacing(content);
      
      expect(formatted).toBe('# Heading\nSome text');
    });
  });

  describe('Title Extraction', () => {
    it('extracts title from first heading', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 6 }),
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          (level, title) => {
            const content = `${'#'.repeat(level)} ${title}\n\nSome content`;
            const extracted = extractTitle(content);
            
            return extracted === title.trim();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('extracts first line as title when no heading', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && !s.startsWith('#')),
          (firstLine) => {
            const content = `${firstLine}\n\nMore content`;
            const extracted = extractTitle(content);
            
            return extracted === firstLine.trim().slice(0, 100);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns Untitled for empty content', () => {
      expect(extractTitle('')).toBe('Untitled');
      expect(extractTitle('   \n\n   ')).toBe('Untitled');
    });
  });
});
