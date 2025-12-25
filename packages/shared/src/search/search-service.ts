/**
 * Search Service Module
 * Handles full-text search and tag filtering
 */

/**
 * Search result item
 */
export interface SearchResult {
  /** Note ID */
  noteId: string;
  /** Note title */
  title: string;
  /** Relevance score (higher is better) */
  score: number;
  /** Matched snippets with highlights */
  snippets: string[];
  /** Matched tags */
  matchedTags: string[];
}

/**
 * Search options
 */
export interface SearchOptions {
  /** Search in title */
  searchTitle: boolean;
  /** Search in content */
  searchContent: boolean;
  /** Search in tags */
  searchTags: boolean;
  /** Maximum results to return */
  maxResults: number;
  /** Minimum score threshold */
  minScore: number;
}

/**
 * Default search options
 */
export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  searchTitle: true,
  searchContent: true,
  searchTags: true,
  maxResults: 50,
  minScore: 0.1,
};

/**
 * Searchable note data
 */
export interface SearchableNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

/**
 * Tokenize text for search
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff]/g, ' ') // Keep alphanumeric and Chinese characters
    .split(/\s+/)
    .filter(token => token.length > 0);
}

/**
 * Calculate term frequency
 */
export function calculateTF(tokens: string[], term: string): number {
  const termLower = term.toLowerCase();
  const count = tokens.filter(t => t.includes(termLower)).length;
  return count / Math.max(tokens.length, 1);
}

/**
 * Calculate relevance score for a note
 */
export function calculateRelevanceScore(
  note: SearchableNote,
  queryTerms: string[],
  options: SearchOptions
): number {
  let score = 0;
  const titleTokens = tokenize(note.title);
  const contentTokens = tokenize(note.content);

  for (const term of queryTerms) {
    const termLower = term.toLowerCase();

    // Title matches (weighted higher)
    if (options.searchTitle) {
      const titleTF = calculateTF(titleTokens, termLower);
      score += titleTF * 3; // Title matches are 3x more important

      // Exact title match bonus
      if (note.title.toLowerCase().includes(termLower)) {
        score += 0.5;
      }
    }

    // Content matches
    if (options.searchContent) {
      const contentTF = calculateTF(contentTokens, termLower);
      score += contentTF;
    }

    // Tag matches (weighted higher)
    if (options.searchTags) {
      const tagMatch = note.tags.some(tag => 
        tag.toLowerCase().includes(termLower)
      );
      if (tagMatch) {
        score += 2; // Tag matches are 2x more important
      }
    }
  }

  return score;
}

/**
 * Search notes
 */
export function searchNotes(
  notes: SearchableNote[],
  query: string,
  options: SearchOptions = DEFAULT_SEARCH_OPTIONS
): SearchResult[] {
  if (!query.trim()) return [];

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const results: SearchResult[] = [];

  for (const note of notes) {
    const score = calculateRelevanceScore(note, queryTerms, options);

    if (score >= options.minScore) {
      const snippets = extractSnippets(note.content, queryTerms);
      const matchedTags = note.tags.filter(tag =>
        queryTerms.some(term => tag.toLowerCase().includes(term.toLowerCase()))
      );

      results.push({
        noteId: note.id,
        title: note.title,
        score,
        snippets,
        matchedTags,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Limit results
  return results.slice(0, options.maxResults);
}

/**
 * Extract snippets containing search terms
 */
export function extractSnippets(
  content: string,
  queryTerms: string[],
  snippetLength: number = 100
): string[] {
  const snippets: string[] = [];
  const contentLower = content.toLowerCase();

  for (const term of queryTerms) {
    const termLower = term.toLowerCase();
    let index = contentLower.indexOf(termLower);

    while (index !== -1 && snippets.length < 3) {
      const start = Math.max(0, index - snippetLength / 2);
      const end = Math.min(content.length, index + term.length + snippetLength / 2);
      
      let snippet = content.slice(start, end);
      
      // Add ellipsis if truncated
      if (start > 0) snippet = '...' + snippet;
      if (end < content.length) snippet = snippet + '...';

      snippets.push(snippet);
      index = contentLower.indexOf(termLower, index + 1);
    }
  }

  return snippets;
}

/**
 * Highlight search terms in text
 */
export function highlightTerms(
  text: string,
  queryTerms: string[],
  highlightStart: string = '<mark>',
  highlightEnd: string = '</mark>'
): string {
  let result = text;

  for (const term of queryTerms) {
    const regex = new RegExp(`(${escapeRegex(term)})`, 'gi');
    result = result.replace(regex, `${highlightStart}$1${highlightEnd}`);
  }

  return result;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Filter notes by tags
 */
export function filterByTags(
  notes: SearchableNote[],
  tags: string[]
): SearchableNote[] {
  if (tags.length === 0) return notes;

  const tagsLower = tags.map(t => t.toLowerCase());

  return notes.filter(note =>
    tagsLower.every(tag =>
      note.tags.some(noteTag => noteTag.toLowerCase() === tag)
    )
  );
}

/**
 * Get all unique tags from notes
 */
export function getAllTags(notes: SearchableNote[]): string[] {
  const tagSet = new Set<string>();

  for (const note of notes) {
    for (const tag of note.tags) {
      tagSet.add(tag);
    }
  }

  return Array.from(tagSet).sort();
}

/**
 * Check if search result contains query terms
 */
export function resultContainsTerms(
  result: SearchResult,
  note: SearchableNote,
  queryTerms: string[]
): boolean {
  const titleLower = note.title.toLowerCase();
  const contentLower = note.content.toLowerCase();
  const tagsLower = note.tags.map(t => t.toLowerCase());

  return queryTerms.every(term => {
    const termLower = term.toLowerCase();
    return (
      titleLower.includes(termLower) ||
      contentLower.includes(termLower) ||
      tagsLower.some(tag => tag.includes(termLower))
    );
  });
}
