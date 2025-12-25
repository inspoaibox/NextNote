/**
 * Image Service Property Tests
 * Tests for Phase 11: Editor Functionality
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  ImageReference,
  generateImageId,
  createImageReference,
  markImageForDeletion,
  unmarkImageForDeletion,
  shouldDeleteImage,
  markNoteImagesForDeletion,
  getImagesForPermanentDeletion,
  getImagesForNote,
  areImageReferencesUnique,
  extractImageIds,
  generateMarkdownImageRef,
} from '../image-service';

describe('Image Service Property Tests', () => {
  /**
   * **Feature: secure-notebook, Property 23: Image Reference Uniqueness**
   * For any two uploaded images, their reference IDs should be different.
   * **Validates: Requirements 8.4**
   */
  describe('Property 23: Image Reference Uniqueness', () => {
    it('generated image IDs are unique', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 100 }),
          (count) => {
            const ids = new Set<string>();
            
            for (let i = 0; i < count; i++) {
              ids.add(generateImageId());
            }
            
            return ids.size === count;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('created image references have unique IDs', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.array(
            fc.record({
              mimeType: fc.constantFrom('image/jpeg', 'image/png', 'image/gif'),
              size: fc.integer({ min: 100, max: 10000000 }),
              checksum: fc.hexaString({ minLength: 64, maxLength: 64 }),
            }),
            { minLength: 2, maxLength: 20 }
          ),
          (noteId, imageData) => {
            const images = imageData.map(data => 
              createImageReference(noteId, data.mimeType, data.size, data.checksum)
            );
            
            return areImageReferencesUnique(images);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('image IDs have correct format', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }),
          () => {
            const id = generateImageId();
            return id.startsWith('img_') && id.length > 10;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: secure-notebook, Property 24: Image Deletion Marking**
   * For any deleted note with images, all associated images should be 
   * marked for deletion.
   * **Validates: Requirements 8.5**
   */
  describe('Property 24: Image Deletion Marking', () => {
    const imageRefArb: fc.Arbitrary<ImageReference> = fc.record({
      id: fc.uuid(),
      noteId: fc.uuid(),
      mimeType: fc.constantFrom('image/jpeg', 'image/png', 'image/gif'),
      size: fc.integer({ min: 100, max: 10000000 }),
      checksum: fc.hexaString({ minLength: 64, maxLength: 64 }),
      createdAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
      markedForDeletion: fc.constant(false),
      deletionDate: fc.constant(null),
    });

    it('marking note images marks all images in that note', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.array(imageRefArb, { minLength: 1, maxLength: 10 }),
          (noteId, images) => {
            // Set all images to belong to the note
            const noteImages = images.map(img => ({ ...img, noteId }));
            
            const marked = markNoteImagesForDeletion(noteImages, noteId);
            
            // All images should be marked for deletion
            return marked.every(img => img.markedForDeletion && img.deletionDate !== null);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('marking does not affect images from other notes', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          fc.array(imageRefArb, { minLength: 1, maxLength: 5 }),
          (noteId, otherNoteId, images) => {
            if (noteId === otherNoteId) return true;
            
            // Set images to belong to other note
            const otherImages = images.map(img => ({ ...img, noteId: otherNoteId }));
            
            const marked = markNoteImagesForDeletion(otherImages, noteId);
            
            // Images from other note should not be marked
            return marked.every(img => !img.markedForDeletion);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('marked images have 30-day retention by default', () => {
      fc.assert(
        fc.property(imageRefArb, (image) => {
          const before = Date.now();
          const marked = markImageForDeletion(image);
          const after = Date.now();
          
          const expectedMin = before + 30 * 24 * 60 * 60 * 1000;
          const expectedMax = after + 30 * 24 * 60 * 60 * 1000;
          
          return (
            marked.markedForDeletion &&
            marked.deletionDate !== null &&
            marked.deletionDate >= expectedMin &&
            marked.deletionDate <= expectedMax
          );
        }),
        { numRuns: 100 }
      );
    });

    it('unmarking removes deletion flag and date', () => {
      fc.assert(
        fc.property(imageRefArb, (image) => {
          const marked = markImageForDeletion(image);
          const unmarked = unmarkImageForDeletion(marked);
          
          return !unmarked.markedForDeletion && unmarked.deletionDate === null;
        }),
        { numRuns: 100 }
      );
    });

    it('shouldDeleteImage returns true only after deletion date', () => {
      fc.assert(
        fc.property(imageRefArb, (image) => {
          // Image marked for deletion in the past
          const pastImage: ImageReference = {
            ...image,
            markedForDeletion: true,
            deletionDate: Date.now() - 1000,
          };
          
          // Image marked for deletion in the future
          const futureImage: ImageReference = {
            ...image,
            markedForDeletion: true,
            deletionDate: Date.now() + 1000000,
          };
          
          return shouldDeleteImage(pastImage) && !shouldDeleteImage(futureImage);
        }),
        { numRuns: 100 }
      );
    });

    it('getImagesForPermanentDeletion returns only expired images', () => {
      fc.assert(
        fc.property(
          fc.array(imageRefArb, { minLength: 1, maxLength: 10 }),
          (images) => {
            // Mark some for past deletion, some for future
            const mixed = images.map((img, i) => ({
              ...img,
              markedForDeletion: true,
              deletionDate: i % 2 === 0 ? Date.now() - 1000 : Date.now() + 1000000,
            }));
            
            const toDelete = getImagesForPermanentDeletion(mixed);
            
            // All returned images should have past deletion dates
            return toDelete.every(img => 
              img.deletionDate !== null && img.deletionDate <= Date.now()
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Image Utility Functions', () => {
    it('getImagesForNote returns only non-deleted images for note', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.array(
            fc.record({
              id: fc.uuid(),
              noteId: fc.uuid(),
              mimeType: fc.constant('image/png'),
              size: fc.integer({ min: 100, max: 1000 }),
              checksum: fc.hexaString({ minLength: 64, maxLength: 64 }),
              createdAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
              markedForDeletion: fc.boolean(),
              deletionDate: fc.constant(null),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (noteId, images) => {
            // Set some images to the target note
            const mixed = images.map((img, i) => ({
              ...img,
              noteId: i % 2 === 0 ? noteId : img.noteId,
            }));
            
            const noteImages = getImagesForNote(mixed, noteId);
            
            // All returned images should be for the note and not marked for deletion
            return noteImages.every(img => 
              img.noteId === noteId && !img.markedForDeletion
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('generateMarkdownImageRef creates valid reference', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.string({ minLength: 0, maxLength: 50 }),
          (imageId, altText) => {
            const ref = generateMarkdownImageRef(imageId, altText);
            
            return ref === `![${altText}](image://${imageId})`;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('extractImageIds extracts all image IDs from content', () => {
      fc.assert(
        fc.property(
          fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
          (imageIds) => {
            const content = imageIds
              .map(id => `Some text ![alt](image://${id}) more text`)
              .join('\n');
            
            const extracted = extractImageIds(content);
            
            // All IDs should be extracted
            return imageIds.every(id => extracted.includes(id));
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
