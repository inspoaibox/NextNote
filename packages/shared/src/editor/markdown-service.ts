/**
 * Markdown Service Module
 * Handles Markdown parsing, serialization, and formatting
 */

/**
 * Markdown formatting options
 */
export interface MarkdownFormatOptions {
  /** Remove extra blank lines */
  removeExtraBlankLines: boolean;
  /** Normalize list indentation */
  normalizeListIndentation: boolean;
  /** Ensure consistent heading spacing */
  normalizeHeadingSpacing: boolean;
  /** Trim trailing whitespace */
  trimTrailingWhitespace: boolean;
}

/**
 * Default formatting options
 */
export const DEFAULT_FORMAT_OPTIONS: MarkdownFormatOptions = {
  removeExtraBlankLines: true,
  normalizeListIndentation: true,
  normalizeHeadingSpacing: true,
  trimTrailingWhitespace: true,
};

/**
 * Format Markdown content (one-click formatting)
 */
export function formatMarkdown(
  content: string,
  options: MarkdownFormatOptions = DEFAULT_FORMAT_OPTIONS
): string {
  let result = content;

  if (options.trimTrailingWhitespace) {
    result = trimTrailingWhitespace(result);
  }

  if (options.removeExtraBlankLines) {
    result = removeExtraBlankLines(result);
  }

  if (options.normalizeListIndentation) {
    result = normalizeListIndentation(result);
  }

  if (options.normalizeHeadingSpacing) {
    result = normalizeHeadingSpacing(result);
  }

  return result;
}

/**
 * Remove extra blank lines (more than 2 consecutive)
 */
export function removeExtraBlankLines(content: string): string {
  return content.replace(/\n{3,}/g, '\n\n');
}

/**
 * Trim trailing whitespace from each line
 */
export function trimTrailingWhitespace(content: string): string {
  return content
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n');
}

/**
 * Normalize list indentation to 2 spaces
 */
export function normalizeListIndentation(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    // Match list items with various indentation
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    
    if (listMatch) {
      const [, indent, marker, text] = listMatch;
      // Calculate indent level (each 4 spaces = 1 level, normalize to 2 spaces per level)
      // 4 spaces -> level 1 -> 2 spaces
      // 8 spaces -> level 2 -> 4 spaces
      // 12 spaces -> level 3 -> 6 spaces
      const level = Math.ceil(indent.length / 4);
      const normalizedIndent = '  '.repeat(level);
      result.push(`${normalizedIndent}${marker} ${text}`);
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Normalize heading spacing (blank line before headings)
 */
export function normalizeHeadingSpacing(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isHeading = /^#{1,6}\s+/.test(line);
    const prevLine = i > 0 ? lines[i - 1] : '';
    
    // Add blank line before heading if previous line is not blank and not start
    if (isHeading && i > 0 && prevLine.trim() !== '') {
      result.push('');
    }
    
    result.push(line);
  }

  return result.join('\n');
}

/**
 * Convert HTML to Markdown
 */
export function htmlToMarkdown(html: string): string {
  let result = html;

  // Remove script and style tags
  result = result.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Convert headings
  result = result.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n');
  result = result.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n');
  result = result.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n');
  result = result.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n\n');
  result = result.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '##### $1\n\n');
  result = result.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '###### $1\n\n');

  // Convert bold and italic
  result = result.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  result = result.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  result = result.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  result = result.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');

  // Convert links
  result = result.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Convert images
  result = result.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
  result = result.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)');

  // Convert code blocks
  result = result.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n\n');
  result = result.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Convert blockquotes
  result = result.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
    return content.split('\n').map((line: string) => `> ${line.trim()}`).join('\n') + '\n\n';
  });

  // Convert lists
  result = result.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, content) => {
    return content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n') + '\n';
  });
  result = result.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, content) => {
    let index = 1;
    return content.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, () => `${index++}. $1\n`) + '\n';
  });

  // Convert tables
  result = convertHtmlTablesToMarkdown(result);

  // Convert paragraphs
  result = result.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');

  // Convert line breaks
  result = result.replace(/<br\s*\/?>/gi, '\n');

  // Remove remaining HTML tags
  result = result.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  result = decodeHtmlEntities(result);

  // Clean up extra whitespace
  result = removeExtraBlankLines(result.trim());

  return result;
}

/**
 * Convert HTML tables to Markdown
 */
function convertHtmlTablesToMarkdown(html: string): string {
  return html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableContent) => {
    const rows: string[][] = [];
    
    // Extract rows
    const rowMatches = tableContent.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    
    for (const rowHtml of rowMatches) {
      const cells: string[] = [];
      const cellMatches = rowHtml.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
      
      for (const cellHtml of cellMatches) {
        const cellContent = cellHtml.replace(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/i, '$1').trim();
        cells.push(cellContent);
      }
      
      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length === 0) return '';

    // Build Markdown table
    const result: string[] = [];
    
    // Header row
    result.push('| ' + rows[0].join(' | ') + ' |');
    result.push('| ' + rows[0].map(() => '---').join(' | ') + ' |');
    
    // Data rows
    for (let i = 1; i < rows.length; i++) {
      result.push('| ' + rows[i].join(' | ') + ' |');
    }

    return result.join('\n') + '\n\n';
  });
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
  };

  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'g'), char);
  }

  // Decode numeric entities
  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  result = result.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));

  return result;
}

/**
 * Check if content is valid Markdown (basic validation)
 */
export function isValidMarkdown(content: string): boolean {
  // Basic validation - check for common Markdown patterns
  // This is a simplified check
  try {
    // Check for unclosed code blocks
    const codeBlockCount = (content.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Extract title from Markdown content (first heading or first line)
 */
export function extractTitle(content: string): string {
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Check for heading
    const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      return headingMatch[1].trim();
    }
    
    // Return first non-empty line as title
    return trimmed.slice(0, 100);
  }
  
  return 'Untitled';
}
