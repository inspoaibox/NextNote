/**
 * 本地搜索索引
 */

import {
  openDatabase,
  promisifyRequest,
  type SearchIndexRecord,
  type LocalNoteRecord,
} from './database';

/**
 * 分词器 - 简单的空格和标点分词
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ') // 保留字母、数字、空格和中文
    .split(/\s+/)
    .filter(token => token.length > 0);
}

/**
 * 更新笔记的搜索索引
 */
export async function updateSearchIndex(note: LocalNoteRecord): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('searchIndex', 'readwrite');
  const store = transaction.objectStore('searchIndex');
  
  const indexRecord: SearchIndexRecord = {
    id: note.id,
    noteId: note.id,
    titleTokens: tokenize(note.title),
    contentTokens: tokenize(note.content),
    tags: note.tags.map(t => t.toLowerCase()),
    updatedAt: Date.now(),
  };
  
  store.put(indexRecord);
  
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * 删除笔记的搜索索引
 */
export async function deleteSearchIndex(noteId: string): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('searchIndex', 'readwrite');
  const store = transaction.objectStore('searchIndex');
  
  store.delete(noteId);
  
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * 搜索笔记
 */
export async function searchNotes(query: string): Promise<string[]> {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];
  
  const db = await openDatabase();
  const transaction = db.transaction('searchIndex', 'readonly');
  const store = transaction.objectStore('searchIndex');
  
  const allIndexes = await promisifyRequest(store.getAll()) as SearchIndexRecord[];
  
  // 计算匹配分数
  const results: { noteId: string; score: number }[] = [];
  
  for (const index of allIndexes) {
    let score = 0;
    
    for (const queryToken of queryTokens) {
      // 标题匹配权重更高
      const titleMatches = index.titleTokens.filter(t => t.includes(queryToken)).length;
      score += titleMatches * 3;
      
      // 内容匹配
      const contentMatches = index.contentTokens.filter(t => t.includes(queryToken)).length;
      score += contentMatches;
      
      // 标签精确匹配
      if (index.tags.includes(queryToken)) {
        score += 5;
      }
    }
    
    if (score > 0) {
      results.push({ noteId: index.noteId, score });
    }
  }
  
  // 按分数排序
  results.sort((a, b) => b.score - a.score);
  
  return results.map(r => r.noteId);
}

/**
 * 按标签搜索
 */
export async function searchByTag(tag: string): Promise<string[]> {
  const normalizedTag = tag.toLowerCase();
  
  const db = await openDatabase();
  const transaction = db.transaction('searchIndex', 'readonly');
  const store = transaction.objectStore('searchIndex');
  
  const allIndexes = await promisifyRequest(store.getAll()) as SearchIndexRecord[];
  
  return allIndexes
    .filter(index => index.tags.includes(normalizedTag))
    .map(index => index.noteId);
}

/**
 * 重建所有搜索索引
 */
export async function rebuildSearchIndex(notes: LocalNoteRecord[]): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction('searchIndex', 'readwrite');
  const store = transaction.objectStore('searchIndex');
  
  // 清空现有索引
  store.clear();
  
  // 重建索引
  for (const note of notes) {
    if (!note.isDeleted) {
      const indexRecord: SearchIndexRecord = {
        id: note.id,
        noteId: note.id,
        titleTokens: tokenize(note.title),
        contentTokens: tokenize(note.content),
        tags: note.tags.map(t => t.toLowerCase()),
        updatedAt: Date.now(),
      };
      
      store.put(indexRecord);
    }
  }
  
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * 高亮搜索结果
 */
export function highlightMatches(
  text: string,
  query: string,
  maxLength: number = 200
): { text: string; highlights: [number, number][] } {
  const queryTokens = tokenize(query);
  const lowerText = text.toLowerCase();
  const highlights: [number, number][] = [];
  
  // 找到所有匹配位置
  for (const token of queryTokens) {
    let pos = 0;
    while ((pos = lowerText.indexOf(token, pos)) !== -1) {
      highlights.push([pos, pos + token.length]);
      pos += token.length;
    }
  }
  
  // 合并重叠的高亮区域
  highlights.sort((a, b) => a[0] - b[0]);
  const mergedHighlights: [number, number][] = [];
  
  for (const [start, end] of highlights) {
    if (mergedHighlights.length === 0) {
      mergedHighlights.push([start, end]);
    } else {
      const last = mergedHighlights[mergedHighlights.length - 1];
      if (start <= last[1]) {
        last[1] = Math.max(last[1], end);
      } else {
        mergedHighlights.push([start, end]);
      }
    }
  }
  
  // 截取文本
  let resultText = text;
  let resultHighlights = mergedHighlights;
  
  if (text.length > maxLength && mergedHighlights.length > 0) {
    // 以第一个匹配为中心截取
    const firstMatch = mergedHighlights[0][0];
    const start = Math.max(0, firstMatch - maxLength / 2);
    const end = Math.min(text.length, start + maxLength);
    
    resultText = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
    
    // 调整高亮位置
    const offset = start - (start > 0 ? 3 : 0);
    resultHighlights = mergedHighlights
      .filter(([s, e]) => s >= start && e <= end)
      .map(([s, e]) => [s - offset, e - offset] as [number, number]);
  }
  
  return { text: resultText, highlights: resultHighlights };
}
