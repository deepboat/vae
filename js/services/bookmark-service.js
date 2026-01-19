// js/services/bookmark-service.js
import { StorageManager } from '../database/storage.js';

class BookmarkService {
  constructor() {
    this.storageManager = new StorageManager();
  }

  async init() {
    await this.storageManager.init();
  }

  // CRUD Operations
  async addBookmark(bookmarkData) {
    const bookmark = {
      id: bookmarkData.id || this.generateId(),
      chromeId: bookmarkData.chromeId,
      url: bookmarkData.url,
      title: bookmarkData.title,
      description: bookmarkData.description || '',
      dateAdded: bookmarkData.dateAdded || new Date(),
      dateModified: new Date(),
      visitCount: 0,
      tags: bookmarkData.tags || [],
      category: bookmarkData.category || null,
      isDuplicate: false,
      isBroken: false,
      meta: bookmarkData.meta || {}
    };

    // Validate bookmark
    const validation = this.validateBookmark(bookmark);
    if (!validation.isValid) {
      throw new Error(`Invalid bookmark: ${validation.errors.join(', ')}`);
    }

    // Check for duplicates
    const duplicates = await this.findDuplicatesByUrl(bookmark.url);
    if (duplicates.length > 0) {
      bookmark.isDuplicate = true;
      bookmark.duplicateOf = duplicates[0].id;
    }

    // Save bookmark
    await this.storageManager.saveBookmark(bookmark);
    return bookmark;
  }

  async updateBookmark(id, updates) {
    const existingBookmark = await this.storageManager.getBookmark(id);
    if (!existingBookmark) {
      throw new Error('Bookmark not found');
    }

    const updatedBookmark = {
      ...existingBookmark,
      ...updates,
      id: id, // Ensure ID doesn't change
      dateModified: new Date()
    };

    // Validate updated bookmark
    const validation = this.validateBookmark(updatedBookmark);
    if (!validation.isValid) {
      throw new Error(`Invalid bookmark: ${validation.errors.join(', ')}`);
    }

    await this.storageManager.saveBookmark(updatedBookmark);
    return updatedBookmark;
  }

  async deleteBookmark(id) {
    return await this.storageManager.deleteBookmark(id);
  }

  async getBookmark(id) {
    return await this.storageManager.getBookmark(id);
  }

  async getAllBookmarks(filters = {}) {
    let bookmarks = await this.storageManager.getAllBookmarks();

    // Apply filters
    if (filters.category) {
      bookmarks = bookmarks.filter(b => b.category?.id === filters.category);
    }

    if (filters.tag) {
      bookmarks = bookmarks.filter(b => 
        b.tags && b.tags.some(t => t.id === filters.tag)
      );
    }

    if (filters.search) {
      const query = filters.search.toLowerCase();
      bookmarks = bookmarks.filter(b => {
        const titleMatch = b.title?.toLowerCase().includes(query);
        const urlMatch = b.url?.toLowerCase().includes(query);
        const tagMatch = b.tags?.some(t => 
          t.name.toLowerCase().includes(query)
        );
        return titleMatch || urlMatch || tagMatch;
      });
    }

    if (filters.showBroken !== undefined) {
      bookmarks = bookmarks.filter(b => b.isBroken === filters.showBroken);
    }

    if (filters.showDuplicates !== undefined) {
      bookmarks = bookmarks.filter(b => b.isDuplicate === filters.showDuplicates);
    }

    // Sort bookmarks
    const sortBy = filters.sortBy || 'dateModified';
    const sortOrder = filters.sortOrder || 'desc';

    bookmarks.sort((a, b) => {
      let valueA, valueB;

      switch (sortBy) {
        case 'title':
          valueA = a.title?.toLowerCase() || '';
          valueB = b.title?.toLowerCase() || '';
          break;
        case 'url':
          valueA = a.url || '';
          valueB = b.url || '';
          break;
        case 'dateAdded':
          valueA = new Date(a.dateAdded) || new Date(0);
          valueB = new Date(b.dateAdded) || new Date(0);
          break;
        case 'visitCount':
          valueA = a.visitCount || 0;
          valueB = b.visitCount || 0;
          break;
        default: // dateModified
          valueA = new Date(a.dateModified) || new Date(0);
          valueB = new Date(b.dateModified) || new Date(0);
      }

      if (sortOrder === 'desc') {
        return valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
      } else {
        return valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
      }
    });

    return bookmarks;
  }

  // Duplicate Detection
  async findDuplicates() {
    const allBookmarks = await this.storageManager.getAllBookmarks();
    const urlMap = new Map();

    // Group bookmarks by normalized URL
    allBookmarks.forEach(bookmark => {
      if (bookmark.url) {
        const normalizedUrl = this.normalizeUrl(bookmark.url);
        if (!urlMap.has(normalizedUrl)) {
          urlMap.set(normalizedUrl, []);
        }
        urlMap.get(normalizedUrl).push(bookmark);
      }
    });

    // Return groups with more than one bookmark
    const duplicateGroups = [];
    urlMap.forEach((group, normalizedUrl) => {
      if (group.length > 1) {
        duplicateGroups.push({
          url: normalizedUrl,
          bookmarks: group,
          recommendedAction: this.recommendDuplicateAction(group)
        });
      }
    });

    return duplicateGroups;
  }

  async findDuplicatesByUrl(url) {
    const allBookmarks = await this.storageManager.getAllBookmarks();
    const normalizedUrl = this.normalizeUrl(url);

    return allBookmarks.filter(bookmark => {
      if (!bookmark.url) return false;
      return this.normalizeUrl(bookmark.url) === normalizedUrl;
    });
  }

  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      
      // Remove protocol, www, trailing slashes, and query parameters
      return urlObj.hostname.replace(/^www\./, '') + urlObj.pathname.replace(/\/$/, '');
    } catch (error) {
      return url.toLowerCase();
    }
  }

  recommendDuplicateAction(bookmarks) {
    // Recommend keeping the bookmark with:
    // 1. Most complete metadata
    // 2. Recent dateVisited
    // 3. Longer title (more descriptive)
    // 4. Most tags
    
    const scored = bookmarks.map(bookmark => {
      let score = 0;
      
      // Metadata completeness
      if (bookmark.description) score += 10;
      if (bookmark.meta && Object.keys(bookmark.meta).length > 0) score += 5;
      
      // Recent visit
      if (bookmark.dateVisited) {
        const daysSinceVisit = (Date.now() - new Date(bookmark.dateVisited)) / (1000 * 60 * 60 * 24);
        score += Math.max(0, 30 - daysSinceVisit); // Recent visits get higher scores
      }
      
      // Title length (descriptiveness)
      if (bookmark.title) {
        score += Math.min(bookmark.title.length / 10, 10);
      }
      
      // Tag count
      if (bookmark.tags) {
        score += bookmark.tags.length * 2;
      }
      
      // Visit count
      score += (bookmark.visitCount || 0) * 0.5;
      
      return { bookmark, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return {
      keep: scored[0].bookmark.id,
      action: 'merge_metadata'
    };
  }

  async resolveDuplicates(duplicateGroups) {
    const results = [];
    
    for (const group of duplicateGroups) {
      const { keep, action } = this.recommendDuplicateAction(group.bookmarks);
      
      // Merge metadata from duplicates into the keeper
      const keeper = group.bookmarks.find(b => b.id === keep);
      const duplicates = group.bookmarks.filter(b => b.id !== keep);
      
      // Merge metadata
      if (action === 'merge_metadata') {
        keeper.description = keeper.description || duplicates[0]?.description;
        keeper.meta = { ...keeper.meta, ...duplicates[0]?.meta };
        keeper.tags = this.mergeTags([keeper, ...duplicates]);
        keeper.visitCount = Math.max(...group.bookmarks.map(b => b.visitCount || 0));
        
        await this.updateBookmark(keeper.id, keeper);
      }
      
      // Mark duplicates as such
      for (const duplicate of duplicates) {
        await this.updateBookmark(duplicate.id, {
          isDuplicate: true,
          duplicateOf: keep
        });
      }
      
      results.push({
        group,
        action,
        kept: keeper.id,
        removed: duplicates.map(d => d.id)
      });
    }
    
    return results;
  }

  mergeTags(bookmarks) {
    const allTags = new Map();
    
    bookmarks.forEach(bookmark => {
      if (bookmark.tags) {
        bookmark.tags.forEach(tag => {
          if (!allTags.has(tag.id)) {
            allTags.set(tag.id, tag);
          }
        });
      }
    });
    
    return Array.from(allTags.values());
  }

  // Bookmark Validation
  validateBookmark(bookmark) {
    const errors = [];

    if (!bookmark.title || bookmark.title.trim().length === 0) {
      errors.push('Title is required');
    }

    if (!bookmark.url) {
      errors.push('URL is required');
    } else {
      const urlValidation = this.validateUrl(bookmark.url);
      if (!urlValidation.isValid) {
        errors.push(urlValidation.error);
      }
    }

    if (bookmark.title && bookmark.title.length > 255) {
      errors.push('Title too long (max 255 characters)');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  validateUrl(url) {
    try {
      const urlObj = new URL(url);

      // Check for valid protocol
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return { isValid: false, error: 'Only HTTP/HTTPS URLs are allowed' };
      }

      // Check for reasonable length
      if (url.length > 2048) {
        return { isValid: false, error: 'URL too long' };
      }

      // Check for dangerous schemes
      const dangerousSchemes = ['javascript:', 'data:', 'file:', 'ftp:'];
      if (dangerousSchemes.includes(urlObj.protocol)) {
        return { isValid: false, error: 'Dangerous URL scheme detected' };
      }

      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: 'Invalid URL format' };
    }
  }

  // Utility methods
  generateId() {
    return 'bm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  async markAsVisited(id) {
    const bookmark = await this.getBookmark(id);
    if (bookmark) {
      bookmark.dateVisited = new Date();
      bookmark.visitCount = (bookmark.visitCount || 0) + 1;
      await this.updateBookmark(id, bookmark);
    }
  }

  async getStatistics() {
    const allBookmarks = await this.storageManager.getAllBookmarks();
    
    return {
      total: allBookmarks.length,
      broken: allBookmarks.filter(b => b.isBroken).length,
      duplicates: allBookmarks.filter(b => b.isDuplicate).length,
      categories: new Set(allBookmarks.filter(b => b.category).map(b => b.category.id)).size,
      tags: new Set(allBookmarks.flatMap(b => b.tags || []).map(t => t.id)).size
    };
  }

  async exportBookmarks(format = 'json') {
    const bookmarks = await this.getAllBookmarks();
    const data = await this.storageManager.exportData();
    
    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'html':
        return this.exportAsHtml(bookmarks);
      case 'chrome':
        return this.exportAsChrome(bookmarks);
      default:
        throw new Error('Unsupported export format');
    }
  }

  exportAsHtml(bookmarks) {
    const html = `
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${bookmarks.map(bookmark => `
    <DT><A HREF="${bookmark.url}" ADD_DATE="${Math.floor(new Date(bookmark.dateAdded).getTime() / 1000)}">${bookmark.title}</A>
    ${bookmark.description ? `<DD>${bookmark.description}` : ''}
`).join('')}
</DL><p>
    `.trim();
    
    return html;
  }

  exportAsChrome(bookmarks) {
    // Chrome JSON format for import
    return JSON.stringify({
      roots: {
        bookmark_bar: {
          children: bookmarks.map(bookmark => ({
            url: bookmark.url,
            title: bookmark.title,
            date_added: Math.floor(new Date(bookmark.dateAdded).getTime() / 1000)
          }))
        }
      }
    }, null, 2);
  }
}

export { BookmarkService };