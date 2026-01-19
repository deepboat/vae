// background/duplicate-detector.js
import { BookmarkService } from '../js/services/bookmark-service.js';

class DuplicateDetector {
  constructor() {
    this.bookmarkService = new BookmarkService();
  }

  async init() {
    await this.bookmarkService.init();
  }

  // Main duplicate detection method
  async findAll() {
    try {
      const allBookmarks = await this.bookmarkService.getAllBookmarks();
      const duplicateGroups = this.groupDuplicates(allBookmarks);
      
      return duplicateGroups.map(group => ({
        id: group.id,
        url: group.normalizedUrl,
        bookmarks: group.bookmarks,
        count: group.bookmarks.length,
        recommendedAction: this.recommendAction(group.bookmarks),
        severity: this.calculateSeverity(group.bookmarks.length)
      }));
      
    } catch (error) {
      console.error('Error finding duplicates:', error);
      return [];
    }
  }

  // Group bookmarks by normalized URL
  groupDuplicates(bookmarks) {
    const urlGroups = new Map();
    
    bookmarks.forEach(bookmark => {
      if (!bookmark.url) return;
      
      const normalizedUrl = this.normalizeUrl(bookmark.url);
      
      if (!urlGroups.has(normalizedUrl)) {
        urlGroups.set(normalizedUrl, {
          id: `dup_${normalizedUrl.replace(/[^a-zA-Z0-9]/g, '_')}`,
          normalizedUrl,
          bookmarks: []
        });
      }
      
      urlGroups.get(normalizedUrl).bookmarks.push(bookmark);
    });
    
    // Return only groups with more than one bookmark
    return Array.from(urlGroups.values()).filter(group => group.bookmarks.length > 1);
  }

  // Normalize URL for comparison
  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      let normalized = urlObj.hostname.toLowerCase();
      
      // Remove www prefix
      normalized = normalized.replace(/^www\./, '');
      
      // Normalize path (remove trailing slash unless root)
      let path = urlObj.pathname;
      if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
      }
      normalized += path.toLowerCase();
      
      // Add hash if present (some URLs use hash for content)
      if (urlObj.hash) {
        normalized += urlObj.hash.toLowerCase();
      }
      
      // Remove common tracking parameters
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
      const searchParams = new URLSearchParams(urlObj.search);
      
      let query = '';
      const cleanParams = [];
      for (const [key, value] of searchParams) {
        if (!trackingParams.includes(key.toLowerCase())) {
          cleanParams.push(`${key}=${value}`);
        }
      }
      
      if (cleanParams.length > 0) {
        normalized += '?' + cleanParams.sort().join('&');
      }
      
      return normalized;
      
    } catch (error) {
      // Fallback for invalid URLs
      return url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
    }
  }

  // Recommend action for duplicate group
  recommendAction(bookmarks) {
    const scored = this.scoreBookmarks(bookmarks);
    scored.sort((a, b) => b.score - a.score);
    
    const best = scored[0];
    const others = scored.slice(1);
    
    return {
      keep: best.bookmark.id,
      action: this.determineAction(bookmarks),
      reason: this.getActionReason(bookmarks),
      merge: {
        title: this.mergeTitles(bookmarks),
        description: this.mergeDescriptions(bookmarks),
        tags: this.mergeTags(bookmarks),
        metadata: this.mergeMetadata(bookmarks)
      }
    };
  }

  // Score bookmarks for quality
  scoreBookmarks(bookmarks) {
    return bookmarks.map(bookmark => {
      let score = 0;
      
      // Title quality (non-empty, descriptive)
      if (bookmark.title && bookmark.title.trim().length > 0) {
        score += 10;
        // Bonus for longer, more descriptive titles
        score += Math.min(bookmark.title.length / 10, 5);
      }
      
      // Description quality
      if (bookmark.description && bookmark.description.trim().length > 0) {
        score += 8;
        // Bonus for longer descriptions
        score += Math.min(bookmark.description.length / 20, 4);
      }
      
      // Metadata completeness
      if (bookmark.meta) {
        const metaKeys = Object.keys(bookmark.meta).length;
        score += metaKeys * 2;
      }
      
      // Visit information
      if (bookmark.dateVisited) {
        const daysSinceVisit = (Date.now() - new Date(bookmark.dateVisited)) / (1000 * 60 * 60 * 24);
        // Recent visits get higher scores
        score += Math.max(0, 20 - daysSinceVisit / 30);
      }
      
      // Visit count
      score += (bookmark.visitCount || 0) * 0.5;
      
      // Tag richness
      if (bookmark.tags && bookmark.tags.length > 0) {
        score += bookmark.tags.length * 3;
      }
      
      // Category assignment
      if (bookmark.category) {
        score += 5;
      }
      
      // Date added (newer is better)
      if (bookmark.dateAdded) {
        const daysSinceAdded = (Date.now() - new Date(bookmark.dateAdded)) / (1000 * 60 * 60 * 24);
        score += Math.max(0, 15 - daysSinceAdded / 60);
      }
      
      // URL quality (HTTPS preferred)
      if (bookmark.url && bookmark.url.startsWith('https://')) {
        score += 3;
      }
      
      // Avoid broken links
      if (bookmark.isBroken) {
        score -= 50;
      }
      
      return {
        bookmark,
        score: Math.max(0, score)
      };
    });
  }

  // Determine the best action type
  determineAction(bookmarks) {
    const hasCompleteMetadata = bookmarks.some(b => 
      b.title && b.description && b.tags && b.tags.length > 0
    );
    
    if (hasCompleteMetadata) {
      return 'merge_metadata';
    } else if (bookmarks.some(b => b.title && b.title.length > 20)) {
      return 'keep_most_descriptive';
    } else if (bookmarks.some(b => b.dateVisited)) {
      return 'keep_most_recent';
    } else {
      return 'keep_first';
    }
  }

  // Get reason for recommended action
  getActionReason(bookmarks) {
    const scores = this.scoreBookmarks(bookmarks);
    const best = scores[0];
    
    const reasons = [];
    
    if (best.bookmark.title && best.bookmark.title.length > 20) {
      reasons.push('Most descriptive title');
    }
    
    if (best.bookmark.description) {
      reasons.push('Has description');
    }
    
    if (best.bookmark.tags && best.bookmark.tags.length > 0) {
      reasons.push('Most tagged');
    }
    
    if (best.bookmark.dateVisited) {
      const daysSinceVisit = (Date.now() - new Date(best.bookmark.dateVisited)) / (1000 * 60 * 60 * 24);
      if (daysSinceVisit < 30) {
        reasons.push('Recently visited');
      }
    }
    
    if (best.bookmark.category) {
      reasons.push('Categorized');
    }
    
    return reasons.length > 0 ? reasons.join(', ') : 'Highest overall quality';
  }

  // Merge titles from multiple bookmarks
  mergeTitles(bookmarks) {
    const titles = bookmarks
      .map(b => b.title)
      .filter(title => title && title.trim().length > 0);
    
    if (titles.length === 0) return '';
    
    // Return the longest, most descriptive title
    return titles.sort((a, b) => b.length - a.length)[0];
  }

  // Merge descriptions
  mergeDescriptions(bookmarks) {
    const descriptions = bookmarks
      .map(b => b.description)
      .filter(desc => desc && desc.trim().length > 0);
    
    if (descriptions.length === 0) return '';
    
    // Combine all descriptions, removing duplicates
    const uniqueDescriptions = [...new Set(descriptions)];
    return uniqueDescriptions.join(' | ');
  }

  // Merge tags
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

  // Merge metadata
  mergeMetadata(bookmarks) {
    const merged = {};
    
    bookmarks.forEach(bookmark => {
      if (bookmark.meta) {
        Object.assign(merged, bookmark.meta);
      }
    });
    
    // Merge visit count
    const totalVisits = bookmarks.reduce((sum, b) => sum + (b.visitCount || 0), 0);
    merged.totalVisits = totalVisits;
    
    // Get most recent visit
    const visits = bookmarks
      .map(b => b.dateVisited)
      .filter(date => date)
      .sort((a, b) => new Date(b) - new Date(a));
    
    if (visits.length > 0) {
      merged.lastVisited = visits[0];
    }
    
    return merged;
  }

  // Calculate severity level
  calculateSeverity(count) {
    if (count >= 5) return 'critical';
    if (count >= 3) return 'high';
    return 'medium';
  }

  // Auto-resolve duplicates
  async autoResolve(options = {}) {
    const duplicateGroups = await this.findAll();
    const results = [];
    
    const {
      mergeMetadata = true,
      keepBestQuality = true,
      preserveUserChoices = true
    } = options;
    
    for (const group of duplicateGroups) {
      if (group.count < 2) continue;
      
      const { keep, action, merge } = group.recommendedAction;
      const keeper = group.bookmarks.find(b => b.id === keep);
      
      if (!keeper) continue;
      
      // Update keeper with merged data
      if (mergeMetadata && action === 'merge_metadata') {
        const updates = {
          title: merge.title || keeper.title,
          description: merge.description || keeper.description,
          tags: merge.tags || keeper.tags,
          meta: { ...keeper.meta, ...merge.metadata }
        };
        
        await this.bookmarkService.updateBookmark(keeper.id, updates);
      }
      
      // Mark duplicates
      for (const bookmark of group.bookmarks) {
        if (bookmark.id !== keeper.id) {
          await this.bookmarkService.updateBookmark(bookmark.id, {
            isDuplicate: true,
            duplicateOf: keeper.id
          });
        }
      }
      
      results.push({
        group: group.id,
        kept: keeper.id,
        removed: group.bookmarks.filter(b => b.id !== keeper.id).map(b => b.id),
        action
      });
    }
    
    return results;
  }

  // Manual resolution
  async resolveManually(groupId, keepBookmarkId, action = 'merge_metadata') {
    const duplicateGroups = await this.findAll();
    const group = duplicateGroups.find(g => g.id === groupId);
    
    if (!group) {
      throw new Error('Duplicate group not found');
    }
    
    const keeper = group.bookmarks.find(b => b.id === keepBookmarkId);
    const duplicates = group.bookmarks.filter(b => b.id !== keepBookmarkId);
    
    if (!keeper) {
      throw new Error('Bookmark to keep not found');
    }
    
    // Apply manual choice
    if (action === 'merge_metadata') {
      const allData = {
        title: keeper.title,
        description: keeper.description,
        tags: keeper.tags,
        meta: keeper.meta
      };
      
      // Merge data from duplicates if better
      for (const duplicate of duplicates) {
        if (duplicate.title && duplicate.title.length > (allData.title?.length || 0)) {
          allData.title = duplicate.title;
        }
        
        if (duplicate.description && !allData.description) {
          allData.description = duplicate.description;
        }
        
        if (duplicate.tags && duplicate.tags.length > (allData.tags?.length || 0)) {
          allData.tags = duplicate.tags;
        }
      }
      
      await this.bookmarkService.updateBookmark(keeper.id, allData);
    }
    
    // Mark duplicates
    for (const duplicate of duplicates) {
      await this.bookmarkService.updateBookmark(duplicate.id, {
        isDuplicate: true,
        duplicateOf: keeper.id
      });
    }
    
    return {
      kept: keeper.id,
      removed: duplicates.map(d => d.id),
      action
    };
  }

  // Statistics
  async getStatistics() {
    const duplicateGroups = await this.findAll();
    const totalDuplicates = duplicateGroups.reduce((sum, group) => sum + group.count, 0);
    
    const severityCounts = {
      critical: duplicateGroups.filter(g => g.severity === 'critical').length,
      high: duplicateGroups.filter(g => g.severity === 'high').length,
      medium: duplicateGroups.filter(g => g.severity === 'medium').length
    };
    
    return {
      totalGroups: duplicateGroups.length,
      totalDuplicates,
      totalBookmarksAffected: totalDuplicates,
      severityCounts,
      resolution: {
        autoResolved: 0, // Would track resolved duplicates
        manualResolution: 0
      }
    };
  }

  // Clean up duplicate flags
  async cleanup() {
    const allBookmarks = await this.bookmarkService.getAllBookmarks();
    
    for (const bookmark of allBookmarks) {
      if (bookmark.isDuplicate && bookmark.duplicateOf) {
        // Check if the original still exists
        const original = await this.bookmarkService.getBookmark(bookmark.duplicateOf);
        if (!original) {
          // Original doesn't exist, remove duplicate flag
          await this.bookmarkService.updateBookmark(bookmark.id, {
            isDuplicate: false,
            duplicateOf: null
          });
        }
      }
    }
  }
}

export { DuplicateDetector };