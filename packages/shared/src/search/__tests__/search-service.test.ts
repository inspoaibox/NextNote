/**
 * Search Service Property Tests
 * Tests for Phase 12: Search Functionality
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  SearchableNote,
  SearchResult,
  searchNotes,
  filterByTags,
  getAllTags,
  tokenize,
  highlightTerms,
  resultContainsTerms,
  DEFAULT_SEARCH_OPTIONS,
} from '../search-service';

describe('Search Service Property Tests', () => {
  /**
   * **Feature: secure-notebook, Property 29: Search Result Relevance**
   * For any search query, all returned results should contain the query 
   * terms in either title or content.
   * **Validates: Requirements 12.1**
   */
  describe('Property 29: Search Result Relevance', () => {
    const noteArb: fc.Arbitrary<SearchableNote> = fc.record({
      id: fc.uuid(),
      title: fc.string({ minLength: 1, maxLength: 100 }),
      content: fc.string({ minLength: 0, maxLength: 1000 }),
      tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
    });

    it('all search results contain at least one query term', () => {
      fc.assert(
        fc.property(
          fc.array(noteArb, { minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 30 }),
          (notes, query) => {
            const results = searchNotes(notes, query);
            
            if (results.length === 0) return true;
            
            const queryTerms = tokenize(query);
            if (queryTerms.length === 0) return true;
            
            // Each result should contain at least one query term
            return results.every(result => {
              const note = notes.find(n => n.id === result.noteId);
              if (!note) return false;
              
              const titleLower = note.title.toLowerCase();
              const contentLower = note.content.toLowerCase();
              const tagsLower = note.tags.map(t => t.toLowerCase());
              
              return queryTerms.some(term => {
                const termLower = term.toLowerCase();
                return (
                  titleLower.includes(termLower) ||
                  contentLower.includes(termLower) ||
                  tagsLower.some(tag => tag.includes(termLower))
                );
              });
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('results are sorted by relevance score descending', () => {
      fc.assert(
        fc.property(
          fc.array(noteArb, { minLength: 2, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (notes, query) => {
            const results = searchNotes(notes, query);
            
            if (results.length < 2) return true;
            
            // Check that scores are in descending order
            for (let i = 1; i < results.length; i++) {
              if (results[i].score > results[i - 1].score) {
                return false;
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('title matches have higher score than content-only matches', () => {
      const noteWithTitleMatch: SearchableNote = {
        id: '1',
        title: 'Important Meeting Notes',
        content: 'Some random content here',
        tags: [],
      };
      
      const noteWithContentMatch: SearchableNote = {
        id: '2',
        title: 'Random Title',
        content: 'This is about an important meeting',
        tags: [],
      };
      
      const results = searchNotes([noteWithTitleMatch, noteWithContentMatch], 'important');
      
      expect(results.length).toBe(2);
      expect(results[0].noteId).toBe('1'); // Title match should be first
    });

    it('empty query returns no results', () => {
      fc.assert(
        fc.property(
          fc.array(noteArb, { minLength: 1, maxLength: 10 }),
          (notes) => {
            const results = searchNotes(notes, '');
            return results.length === 0;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('whitespace-only query returns no results', () => {
      fc.assert(
        fc.property(
          fc.array(noteArb, { minLength: 1, maxLength: 10 }),
          fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 10 }),
          (notes, whitespace) => {
            const results = searchNotes(notes, whitespace);
            return results.length === 0;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Feature: secure-notebook, Property 30: Tag Indexing**
   * For any note with tags, searching by tag should return that note.
   * **Validates: Requirements 12.3**
   */
  describe('Property 30: Tag Indexing', () => {
    it('searching by exact tag returns notes with that tag', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.string({ minLength: 3, maxLength: 20 }).filter(s => /^[a-zA-Z]+$/.test(s)),
          (noteId, tag) => {
            const note: SearchableNote = {
              id: noteId,
              title: 'Test Note',
              content: 'Some content',
              tags: [tag],
            };
            
            const results = searchNotes([note], tag);
            
            return results.some(r => r.noteId === noteId);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filterByTags returns only notes with all specified tags', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.uuid(),
              title: fc.string({ minLength: 1, maxLength: 50 }),
              content: fc.string({ minLength: 0, maxLength: 100 }),
              tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 0, maxLength: 5 }),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 3 }),
          (notes, filterTags) => {
            const filtered = filterByTags(notes, filterTags);
            
            // All filtered notes should have all the filter tags
            return filtered.every(note =>
              filterTags.every(tag =>
                note.tags.some(noteTag => 
                  noteTag.toLowerCase() === tag.toLowerCase()
                )
              )
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getAllTags returns all unique tags', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.uuid(),
              title: fc.string({ minLength: 1, maxLength: 50 }),
              content: fc.string({ minLength: 0, maxLength: 100 }),
              tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 0, maxLength: 5 }),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          (notes) => {
            const allTags = getAllTags(notes);
            
            // Should be unique
            const uniqueTags = new Set(allTags);
            if (uniqueTags.size !== allTags.length) return false;
            
            // Should contain all tags from all notes
            for (const note of notes) {
              for (const tag of note.tags) {
                if (!allTags.includes(tag)) return false;
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('tag matches are included in matchedTags', () => {
      const note: SearchableNote = {
        id: '1',
        title: 'Test',
        content: 'Content',
        tags: ['javascript', 'typescript', 'react'],
      };
      
      const results = searchNotes([note], 'javascript');
      
      expect(results.length).toBe(1);
      expect(results[0].matchedTags).toContain('javascript');
    });
  });

  describe('Search Utilities', () => {
    it('tokenize splits text into lowercase tokens', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (text) => {
            const tokens = tokenize(text);
            
            // All tokens should be lowercase
            return tokens.every(token => token === token.toLowerCase());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('highlightTerms wraps terms with markers', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z]+$/.test(s)),
          (text, term) => {
            const textWithTerm = `${text} ${term} ${text}`;
            const highlighted = highlightTerms(textWithTerm, [term]);
            
            return highlighted.includes(`<mark>${term}</mark>`) ||
                   highlighted.includes(`<mark>${term.toLowerCase()}</mark>`) ||
                   highlighted.includes(`<mark>${term.toUpperCase()}</mark>`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('results are limited by maxResults option', () => {
      const notes: SearchableNote[] = Array.from({ length: 100 }, (_, i) => ({
        id: `note-${i}`,
        title: `Test Note ${i}`,
        content: 'Common search term here',
        tags: [],
      }));
      
      const results = searchNotes(notes, 'common', {
        ...DEFAULT_SEARCH_OPTIONS,
        maxResults: 10,
      });
      
      expect(results.length).toBeLessThanOrEqual(10);
    });
  });
});
