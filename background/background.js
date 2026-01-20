// background/background.js
import { DuplicateDetector } from './duplicate-detector.js';
import { StorageManager } from '../js/database/storage.js';
import { BookmarkService } from '../js/services/bookmark-service.js';
import { TagService } from '../js/services/tag-service.js';
import { Categorizer } from '../js/services/categorizer.js';

class BookmarkManagerServiceWorker {
  constructor() {
    this.initializeEventListeners();
    this.initializeManagers();
  }

  initializeEventListeners() {
    // Chrome bookmarks change listener
    chrome.bookmarks.onCreated.addListener(this.handleBookmarkCreated.bind(this));
    chrome.bookmarks.onRemoved.addListener(this.handleBookmarkRemoved.bind(this));
    chrome.bookmarks.onChanged.addListener(this.handleBookmarkChanged.bind(this));
    
    // Extension installation
    chrome.runtime.onInstalled.addListener(this.handleInstalled.bind(this));
    
    // Alarms for periodic cleanup
    chrome.alarms.create('cleanup', { delayInMinutes: 60, periodInMinutes: 60 });
    chrome.alarms.create('sync', { delayInMinutes: 5, periodInMinutes: 30 });
    chrome.alarms.onAlarm.addListener(this.handleAlarm.bind(this));
  }

  initializeManagers() {
    this.storageManager = new StorageManager();
    this.duplicateDetector = new DuplicateDetector();
    this.categorizer = new Categorizer();
    this.tagService = new TagService();
    this.bookmarkService = new BookmarkService();
    this.bookmarkManager = new BookmarkManagerServiceWorker();
  }

  async handleBookmarkCreated(id, bookmark) {
    try {
      console.log('New bookmark created:', bookmark);
      
      // Analyze new bookmark and auto-categorize
      const analyzedBookmark = await this.analyzeBookmark({
        id: bookmark.id,
        url: bookmark.url,
        title: bookmark.title,
        dateAdded: new Date()
      });

      // Store in IndexedDB
      await this.storageManager.saveBookmark(analyzedBookmark);
      
      // Update search index
      await this.updateSearchIndex(analyzedBookmark);
      
    } catch (error) {
      console.error('Error handling bookmark creation:', error);
    }
  }

  async handleBookmarkRemoved(id, removeInfo) {
    try {
      console.log('Bookmark removed:', id);
      
      // Remove from IndexedDB
      await this.storageManager.deleteBookmark(id);
      
    } catch (error) {
      console.error('Error handling bookmark removal:', error);
    }
  }

  async handleBookmarkChanged(id, changeInfo) {
    try {
      console.log('Bookmark changed:', id, changeInfo);
      
      // Update in IndexedDB
      const bookmark = await this.storageManager.getBookmark(id);
      if (bookmark) {
        const updatedBookmark = {
          ...bookmark,
          title: changeInfo.title,
          url: changeInfo.url,
          dateModified: new Date()
        };
        
        await this.storageManager.saveBookmark(updatedBookmark);
        await this.updateSearchIndex(updatedBookmark);
      }
      
    } catch (error) {
      console.error('Error handling bookmark change:', error);
    }
  }

  async handleInstalled(details) {
    if (details.reason === 'install') {
      console.log('Extension installed');
      
      // Initialize default categories and settings
      await this.initializeDefaultData();
      
      // Show welcome message
      chrome.action.setBadgeText({ text: 'NEW' });
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
      
    } else if (details.reason === 'update') {
      console.log('Extension updated');
    }
  }

  async handleAlarm(alarm) {
    switch (alarm.name) {
      case 'cleanup':
        await this.performCleanup();
        break;
      case 'sync':
        await this.syncBookmarks();
        break;
    }
  }

  async performCleanup() {
    try {
      console.log('Starting cleanup process...');
      
      // Find and remove duplicates
      const duplicates = await this.duplicateDetector.findAll();
      if (duplicates.length > 0) {
        console.log(`Found ${duplicates.length} duplicate groups`);
        await this.handleDuplicates(duplicates);
      }

      // Validate bookmark URLs
      const brokenBookmarks = await this.findBrokenBookmarks();
      if (brokenBookmarks.length > 0) {
        console.log(`Found ${brokenBookmarks.length} broken bookmarks`);
        await this.handleBrokenBookmarks(brokenBookmarks);
      }

      // Clean up orphaned data
      await this.cleanupOrphanedData();
      
      console.log('Cleanup completed');
      
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  async analyzeBookmark(bookmarkData) {
    try {
      // Extract metadata
      const metadata = await this.extractMetadata(bookmarkData.url);
      
      // Auto-categorize
      const category = await this.categorizer.categorize(bookmarkData, metadata);
      
      // Suggest tags
      const suggestedTags = await this.tagService.suggestTags(bookmarkData, metadata);

      return {
        ...bookmarkData,
        category,
        tags: suggestedTags,
        metadata,
        isAnalyzed: true,
        analysisDate: new Date()
      };
    } catch (error) {
      console.error('Error analyzing bookmark:', error);
      return bookmarkData;
    }
  }

  async extractMetadata(url) {
    try {
      const urlObj = new URL(url);
      
      return {
        domain: urlObj.hostname,
        protocol: urlObj.protocol,
        pathname: urlObj.pathname,
        search: urlObj.search,
        hash: urlObj.hash,
        isSecure: urlObj.protocol === 'https:',
        pageLanguage: null, // Would be extracted by content script
        contentType: null, // Would be detected by fetch
        extractText: null, // Would be extracted by content script
        favicon: `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`
      };
    } catch (error) {
      console.error('Error extracting metadata:', error);
      return {
        domain: null,
        isSecure: false
      };
    }
  }

  async updateSearchIndex(bookmark) {
    // This would integrate with a search indexing service
    // For now, we'll store search terms in metadata
    const searchTerms = this.generateSearchTerms(bookmark);
    
    const updatedBookmark = {
      ...bookmark,
      metadata: {
        ...bookmark.metadata,
        searchTerms
      }
    };
    
    await this.storageManager.saveBookmark(updatedBookmark);
  }

  generateSearchTerms(bookmark) {
    const terms = [];
    
    // Add title words
    if (bookmark.title) {
      terms.push(...bookmark.title.toLowerCase().split(/\s+/));
    }
    
    // Add domain
    if (bookmark.metadata?.domain) {
      terms.push(bookmark.metadata.domain.toLowerCase());
    }
    
    // Add tag names
    if (bookmark.tags) {
      terms.push(...bookmark.tags.map(tag => tag.name.toLowerCase()));
    }
    
    // Add category
    if (bookmark.category) {
      terms.push(bookmark.category.name.toLowerCase());
    }
    
    return [...new Set(terms)]; // Remove duplicates
  }

  async findBrokenBookmarks() {
    const bookmarks = await this.storageManager.getAllBookmarks();
    const brokenBookmarks = [];
    
    // Check URLs in batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < bookmarks.length; i += batchSize) {
      const batch = bookmarks.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(bookmark => this.checkUrl(bookmark.url))
      );
      
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          brokenBookmarks.push(batch[index]);
        }
      });
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return brokenBookmarks;
  }

  async checkUrl(url) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        mode: 'no-cors' // Avoid CORS issues
      });
      
      clearTimeout(timeoutId);
      return response.ok || response.type === 'opaque';
    } catch (error) {
      return false;
    }
  }

  async handleBrokenBookmarks(brokenBookmarks) {
    for (const bookmark of brokenBookmarks) {
      // Mark as broken
      const updatedBookmark = {
        ...bookmark,
        isBroken: true,
        metadata: {
          ...bookmark.metadata,
          lastChecked: new Date()
        }
      };
      
      await this.storageManager.saveBookmark(updatedBookmark);
    }
  }

  async handleDuplicates(duplicates) {
    for (const group of duplicates) {
      // Find the "best" bookmark to keep
      const keeper = this.selectBestBookmark(group);
      
      // Mark others as duplicates
      for (const bookmark of group) {
        if (bookmark.id !== keeper.id) {
          const updatedBookmark = {
            ...bookmark,
            isDuplicate: true,
            duplicateOf: keeper.id
          };
          
          await this.storageManager.saveBookmark(updatedBookmark);
        }
      }
    }
  }

  selectBestBookmark(bookmarks) {
    // Select bookmark with best metadata, most recent visit, etc.
    return bookmarks.sort((a, b) => {
      // Prefer bookmarks with more complete metadata
      if (a.metadata && !b.metadata) return -1;
      if (!a.metadata && b.metadata) return 1;
      
      // Prefer recently visited bookmarks
      if (a.dateVisited && b.dateVisited) {
        return new Date(b.dateVisited) - new Date(a.dateVisited);
      }
      
      // Prefer longer titles (more descriptive)
      if (a.title && b.title) {
        return b.title.length - a.title.length;
      }
      
      // Default to first bookmark
      return 0;
    })[0];
  }

  async cleanupOrphanedData() {
    const allBookmarks = await this.storageManager.getAllBookmarks();
    const bookmarkIds = new Set(allBookmarks.map(b => b.id));
    
    // Clean up orphaned tags
    const allTags = await this.storageManager.getAllTags();
    const orphanedTags = allTags.filter(tag => {
      // Check if tag is used by any bookmark
      return !allBookmarks.some(bookmark => 
        bookmark.tags && bookmark.tags.some(t => t.id === tag.id)
      );
    });
    
    for (const tag of orphanedTags) {
      await this.storageManager.deleteTag(tag.id);
    }
  }

  async initializeDefaultData() {
    // Initialize default categories
    const defaultCategories = [
      {
        id: 'cat-navigation',
        name: 'Navigation',
        description: 'General websites and utilities',
        color: '#3B82F6',
        icon: 'navigation',
        rules: [],
        order: 1,
        isSystem: true,
        created: new Date()
      },
      {
        id: 'cat-language',
        name: 'Language',
        description: 'Language learning and translation',
        color: '#10B981',
        icon: 'language',
        rules: [],
        order: 2,
        isSystem: true,
        created: new Date()
      },
      {
        id: 'cat-automation',
        name: 'Automation',
        description: 'Tools and services for automation',
        color: '#8B5CF6',
        icon: 'automation',
        rules: [],
        order: 3,
        isSystem: true,
        created: new Date()
      },
      {
        id: 'cat-development',
        name: 'Development',
        description: 'Programming and development resources',
        color: '#F59E0B',
        icon: 'code',
        rules: [],
        order: 4,
        isSystem: true,
        created: new Date()
      },
      {
        id: 'cat-productivity',
        name: 'Productivity',
        description: 'Tools for productivity and organization',
        color: '#EF4444',
        icon: 'productivity',
        rules: [],
        order: 5,
        isSystem: true,
        created: new Date()
      }
    ];
    
    for (const category of defaultCategories) {
      await this.storageManager.saveCategory(category);
    }
    
    // Initialize default settings
    const defaultSettings = {
      autoCategorize: true,
      autoTag: true,
      checkBrokenLinks: true,
      duplicateDetection: true,
      theme: 'light',
      language: 'en',
      analyticsConsent: false
    };
    
    await this.storageManager.saveSettings(defaultSettings);
  }

  async syncBookmarks() {
    try {
      console.log('Syncing bookmarks with Chrome...');
      
      // Get Chrome bookmarks
      const chromeBookmarks = await chrome.bookmarks.getTree();
      const flatBookmarks = this.flattenBookmarks(chromeBookmarks);
      
      // Import any new bookmarks
      for (const chromeBookmark of flatBookmarks) {
        const existing = await this.storageManager.getBookmark(chromeBookmark.id);
        if (!existing && chromeBookmark.url) {
          await this.analyzeBookmark(chromeBookmark);
        }
      }
      
      console.log('Bookmark sync completed');
      
    } catch (error) {
      console.error('Error syncing bookmarks:', error);
    }
  }

  flattenBookmarks(bookmarkTree) {
    const bookmarks = [];
    
    const traverse = (nodes) => {
      for (const node of nodes) {
        if (node.url) {
          bookmarks.push({
            id: node.id,
            url: node.url,
            title: node.title,
            dateAdded: node.dateAdded ? new Date(node.dateAdded) : new Date()
          });
        }
        if (node.children) {
          traverse(node.children);
        }
      }
    };
    
    traverse(bookmarkTree);
    return bookmarks;
  }
}

// Initialize service worker
new BookmarkManagerServiceWorker();