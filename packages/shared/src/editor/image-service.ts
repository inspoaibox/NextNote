/**
 * Image Service Module
 * Handles image upload, reference management, and deletion marking
 */

/**
 * Image reference in a note
 */
export interface ImageReference {
  /** Unique image ID */
  id: string;
  /** Note ID this image belongs to */
  noteId: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** SHA-256 checksum */
  checksum: string;
  /** Created timestamp */
  createdAt: number;
  /** Whether marked for deletion */
  markedForDeletion: boolean;
  /** Scheduled deletion date */
  deletionDate: number | null;
}

/**
 * Image upload result
 */
export interface ImageUploadResult {
  success: boolean;
  imageRef?: ImageReference;
  error?: string;
}

/**
 * Generate unique image ID
 */
export function generateImageId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `img_${timestamp}_${random}`;
}

/**
 * Create image reference
 */
export function createImageReference(
  noteId: string,
  mimeType: string,
  size: number,
  checksum: string
): ImageReference {
  return {
    id: generateImageId(),
    noteId,
    mimeType,
    size,
    checksum,
    createdAt: Date.now(),
    markedForDeletion: false,
    deletionDate: null,
  };
}

/**
 * Mark image for deletion (30 days retention)
 */
export function markImageForDeletion(
  image: ImageReference,
  retentionDays: number = 30
): ImageReference {
  return {
    ...image,
    markedForDeletion: true,
    deletionDate: Date.now() + retentionDays * 24 * 60 * 60 * 1000,
  };
}

/**
 * Unmark image from deletion
 */
export function unmarkImageForDeletion(image: ImageReference): ImageReference {
  return {
    ...image,
    markedForDeletion: false,
    deletionDate: null,
  };
}

/**
 * Check if image should be permanently deleted
 */
export function shouldDeleteImage(image: ImageReference): boolean {
  if (!image.markedForDeletion) return false;
  if (!image.deletionDate) return false;
  return Date.now() >= image.deletionDate;
}

/**
 * Mark all images in a note for deletion
 */
export function markNoteImagesForDeletion(
  images: ImageReference[],
  noteId: string,
  retentionDays: number = 30
): ImageReference[] {
  return images.map(img => 
    img.noteId === noteId ? markImageForDeletion(img, retentionDays) : img
  );
}

/**
 * Get images that should be permanently deleted
 */
export function getImagesForPermanentDeletion(
  images: ImageReference[]
): ImageReference[] {
  return images.filter(shouldDeleteImage);
}

/**
 * Get images for a specific note
 */
export function getImagesForNote(
  images: ImageReference[],
  noteId: string
): ImageReference[] {
  return images.filter(img => img.noteId === noteId && !img.markedForDeletion);
}

/**
 * Validate image MIME type
 */
export function isValidImageType(mimeType: string): boolean {
  const validTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
  ];
  return validTypes.includes(mimeType);
}

/**
 * Get file extension from MIME type
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  };
  return extensions[mimeType] || 'bin';
}

/**
 * Generate Markdown image reference
 */
export function generateMarkdownImageRef(
  imageId: string,
  altText: string = ''
): string {
  return `![${altText}](image://${imageId})`;
}

/**
 * Extract image IDs from Markdown content
 */
export function extractImageIds(content: string): string[] {
  const regex = /!\[[^\]]*\]\(image:\/\/([^)]+)\)/g;
  const ids: string[] = [];
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    ids.push(match[1]);
  }
  
  return ids;
}

/**
 * Check if all image references in content are unique
 */
export function areImageReferencesUnique(images: ImageReference[]): boolean {
  const ids = new Set(images.map(img => img.id));
  return ids.size === images.length;
}
