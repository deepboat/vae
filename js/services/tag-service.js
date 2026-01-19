// js/services/tag-service.js
import { StorageManager } from '../database/storage.js';

class TagService {
  constructor() {
    this.storageManager = new StorageManager();
  }

  async init() {
    await this.storageManager.init();
  }

  // Tag CRUD operations
  async createTag(name, color = '#6B7280', category = 'custom', description = '') {
    const tag = {
      id: this.generateId(),
      name: name.trim(),
      color,
      description: description.trim(),
      category,
      usageCount: 0,
      isSystem: false,
      created: new Date(),
      modified: new Date()
    };

    // Validate tag
    const validation = this.validateTag(tag);
    if (!validation.isValid) {
      throw new Error(`Invalid tag: ${validation.errors.join(', ')}`);
    }

    // Check if tag with same name already exists
    const existing = await this.findTagByName(tag.name);
    if (existing) {
      throw new Error('Tag with this name already exists');
    }

    await this.storageManager.saveTag(tag);
    return tag;
  }

  async updateTag(id, updates) {
    const existingTag = await this.storageManager.getTag(id);
    if (!existingTag) {
      throw new Error('Tag not found');
    }

    const updatedTag = {
      ...existingTag,
      ...updates,
      id: id, // Ensure ID doesn't change
      modified: new Date()
    };

    // Validate updated tag
    const validation = this.validateTag(updatedTag);
    if (!validation.isValid) {
      throw new Error(`Invalid tag: ${validation.errors.join(', ')}`);
    }

    await this.storageManager.saveTag(updatedTag);
    return updatedTag;
  }

  async deleteTag(id) {
    // Remove tag from all bookmarks
    const allBookmarks = await this.storageManager.getAllBookmarks();
    for (const bookmark of allBookmarks) {
      if (bookmark.tags && bookmark.tags.some(tag => tag.id === id)) {
        const updatedTags = bookmark.tags.filter(tag => tag.id !== id);
        await this.storageManager.saveBookmark({
          ...bookmark,
          tags: updatedTags
        });
      }
    }

    return await this.storageManager.deleteTag(id);
  }

  async getTag(id) {
    return await this.storageManager.getTag(id);
  }

  async getAllTags() {
    return await this.storageManager.getAllTags();
  }

  async findTagByName(name) {
    const allTags = await this.getAllTags();
    return allTags.find(tag => tag.name.toLowerCase() === name.toLowerCase());
  }

  // Tag suggestions
  async suggestTags(bookmark, metadata = {}) {
    const suggestions = [];
    const { url, title, description = '' } = bookmark;
    const { domain, pageLanguage, contentType } = metadata;

    // Domain-based suggestions
    if (domain) {
      const domainTag = await this.getOrCreateDomainTag(domain);
      if (domainTag) suggestions.push(domainTag);
    }

    // Language-based suggestions
    if (pageLanguage) {
      const languageTag = await this.getOrCreateLanguageTag(pageLanguage);
      if (languageTag) suggestions.push(languageTag);
    }

    // Content type suggestions
    if (contentType) {
      const contentTypeTag = await this.getOrCreateContentTypeTag(contentType);
      if (contentTypeTag) suggestions.push(contentTypeTag);
    }

    // Keyword-based suggestions from title and description
    const keywordTags = await this.generateKeywordTags(title + ' ' + description);
    suggestions.push(...keywordTags);

    // URL pattern suggestions
    const urlPatternTags = await this.generateUrlPatternTags(url);
    suggestions.push(...urlPatternTags);

    // Remove duplicates and return top suggestions
    const uniqueSuggestions = this.deduplicateTags(suggestions);
    return uniqueSuggestions.slice(0, 5); // Return top 5 suggestions
  }

  async getOrCreateDomainTag(domain) {
    let tag = await this.findTagByName(domain);
    
    if (!tag) {
      tag = await this.createTag(domain, '#3B82F6', 'domain', `Domain: ${domain}`);
    }
    
    return tag;
  }

  async getOrCreateLanguageTag(language) {
    const langMap = {
      'en': { name: 'English', color: '#10B981' },
      'es': { name: 'Spanish', color: '#F59E0B' },
      'fr': { name: 'French', color: '#EF4444' },
      'de': { name: 'German', color: '#8B5CF6' },
      'zh': { name: 'Chinese', color: '#F97316' },
      'ja': { name: 'Japanese', color: '#EC4899' },
      'ko': { name: 'Korean', color: '#06B6D4' },
      'ru': { name: 'Russian', color: '#84CC16' }
    };

    const langInfo = langMap[language] || { name: language, color: '#6B7280' };
    
    let tag = await this.findTagByName(langInfo.name);
    
    if (!tag) {
      tag = await this.createTag(langInfo.name, langInfo.color, 'language', `Language: ${langInfo.name}`);
    }
    
    return tag;
  }

  async getOrCreateContentTypeTag(contentType) {
    const typeMap = {
      'text/html': { name: 'Web Page', color: '#3B82F6' },
      'application/pdf': { name: 'PDF', color: '#EF4444' },
      'image/': { name: 'Image', color: '#10B981' },
      'video/': { name: 'Video', color: '#8B5CF6' },
      'audio/': { name: 'Audio', color: '#F59E0B' }
    };

    for (const [pattern, info] of Object.entries(typeMap)) {
      if (contentType.includes(pattern)) {
        let tag = await this.findTagByName(info.name);
        
        if (!tag) {
          tag = await this.createTag(info.name, info.color, 'type', `Content type: ${info.name}`);
        }
        
        return tag;
      }
    }
    
    return null;
  }

  async generateKeywordTags(text) {
    const keywords = this.extractKeywords(text);
    const tags = [];

    for (const keyword of keywords.slice(0, 3)) { // Top 3 keywords
      let tag = await this.findTagByName(keyword);
      
      if (!tag) {
        tag = await this.createTag(keyword, '#6B7280', 'keyword', `Keyword: ${keyword}`);
      }
      
      tags.push(tag);
    }

    return tags;
  }

  async generateUrlPatternTags(url) {
    const patterns = [
      { pattern: /^https:\/\/github\.com/, tag: 'GitHub', color: '#24292E' },
      { pattern: /^https:\/\/stackoverflow\.com/, tag: 'Stack Overflow', color: '#F48024' },
      { pattern: /^https:\/\/medium\.com/, tag: 'Medium', color: '#00AB6C' },
      { pattern: /^https:\/\/www\.youtube\.com/, tag: 'YouTube', color: '#FF0000' },
      { pattern: /^https:\/\/twitter\.com/, tag: 'Twitter', color: '#1DA1F2' },
      { pattern: /^https:\/\/www\.reddit\.com/, tag: 'Reddit', color: '#FF4500' },
      { pattern: /^https:\/\/news\.ycombinator\.com/, tag: 'Hacker News', color: '#FF6600' }
    ];

    const tags = [];
    
    for (const { pattern, tag: tagName, color } of patterns) {
      if (pattern.test(url)) {
        let tag = await this.findTagByName(tagName);
        
        if (!tag) {
          tag = await this.createTag(tagName, color, 'platform', `Platform: ${tagName}`);
        }
        
        tags.push(tag);
        break; // Only match one platform
      }
    }

    return tags;
  }

  extractKeywords(text) {
    if (!text) return [];
    
    // Common words to exclude
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those'
    ]);

    // Extract words (letters and numbers)
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => 
        word.length > 2 && 
        !stopWords.has(word) &&
        !/^\d+$/.test(word) // Exclude pure numbers
      );

    // Count word frequency
    const wordCount = {};
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });

    // Sort by frequency and return top words
    return Object.entries(wordCount)
      .sort(([,a], [,b]) => b - a)
      .map(([word]) => word);
  }

  deduplicateTags(tags) {
    const seen = new Set();
    return tags.filter(tag => {
      if (seen.has(tag.id)) {
        return false;
      }
      seen.add(tag.id);
      return true;
    });
  }

  // Tag management
  async incrementUsageCount(tagId) {
    const tag = await this.getTag(tagId);
    if (tag) {
      tag.usageCount = (tag.usageCount || 0) + 1;
      await this.storageManager.saveTag(tag);
    }
  }

  async getMostUsedTags(limit = 20) {
    const allTags = await this.getAllTags();
    
    return allTags
      .filter(tag => !tag.isSystem || tag.usageCount > 0)
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .slice(0, limit);
  }

  async searchTags(query) {
    const allTags = await this.getAllTags();
    const searchTerm = query.toLowerCase();
    
    return allTags.filter(tag => 
      tag.name.toLowerCase().includes(searchTerm) ||
      tag.description?.toLowerCase().includes(searchTerm)
    );
  }

  // Tag validation
  validateTag(tag) {
    const errors = [];

    if (!tag.name || tag.name.trim().length === 0) {
      errors.push('Tag name is required');
    }

    if (tag.name && tag.name.length > 50) {
      errors.push('Tag name too long (max 50 characters)');
    }

    if (tag.description && tag.description.length > 200) {
      errors.push('Tag description too long (max 200 characters)');
    }

    // Validate color format
    if (tag.color && !/^#[0-9A-F]{6}$/i.test(tag.color)) {
      errors.push('Invalid color format (must be hex color like #FFFFFF)');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Utility methods
  generateId() {
    return 'tag_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Bulk operations
  async mergeTags(sourceTagId, targetTagId) {
    const sourceTag = await this.getTag(sourceTagId);
    const targetTag = await this.getTag(targetTagId);
    
    if (!sourceTag || !targetTag) {
      throw new Error('One or both tags not found');
    }

    // Find all bookmarks with source tag
    const allBookmarks = await this.storageManager.getAllBookmarks();
    for (const bookmark of allBookmarks) {
      if (bookmark.tags && bookmark.tags.some(tag => tag.id === sourceTagId)) {
        const updatedTags = bookmark.tags.map(tag => 
          tag.id === sourceTagId ? targetTag : tag
        );
        
        await this.storageManager.saveBookmark({
          ...bookmark,
          tags: updatedTags
        });
      }
    }

    // Delete source tag
    await this.deleteTag(sourceTagId);
    
    // Update target tag usage count
    targetTag.usageCount += sourceTag.usageCount;
    await this.storageManager.saveTag(targetTag);
  }

  async getTagStatistics() {
    const allTags = await this.getAllTags();
    const totalUsage = allTags.reduce((sum, tag) => sum + (tag.usageCount || 0), 0);
    
    return {
      total: allTags.length,
      custom: allTags.filter(tag => !tag.isSystem).length,
      system: allTags.filter(tag => tag.isSystem).length,
      totalUsage,
      averageUsage: totalUsage / allTags.length || 0
    };
  }
}

export { TagService };