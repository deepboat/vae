// background/bookmark-sync.js
import { BookmarkService } from '../js/services/bookmark-service.js';
import { StorageManager } from '../js/database/storage.js';

class BookmarkSyncService {
  constructor() {
    this.bookmarkService = new BookmarkService();
    this.storageManager = new StorageManager();
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.syncInterval = 30 * 60 * 1000; // 30 minutes
  }

  async init() {
    await this.storageManager.init();
    await this.bookmarkService.init();

    // Set up periodic sync
    this.scheduleSync();
    
    // Listen for Chrome bookmarks changes
    chrome.bookmarks.onCreated.addListener(this.handleBookmarkCreated.bind(this));
    chrome.bookmarks.onRemoved.addListener(this.handleBookmarkRemoved.bind(this));
    chrome.bookmarks.onChanged.addListener(this.handleBookmarkChanged.bind(this));
    chrome.bookmarks.onMoved.addListener(this.handleBookmarkMoved.bind(this));
    
    console.log('Bookmark sync service initialized');
  }

  async handleBookmarkCreated(id, bookmark) {
    console.log('Chrome bookmark created:', id, bookmark);
    
    try {
      // Import new bookmark from Chrome
      const importedBookmark = await this.importChromeBookmark(bookmark);
      if (importedBookmark) {
        await this.analyzeAndStoreBookmark(importedBookmark);
      }
    } catch (error) {
      console.error('Error handling Chrome bookmark creation:', error);
    }
  }

  async handleBookmarkRemoved(id, removeInfo) {
    console.log('Chrome bookmark removed:', id, removeInfo);
    
    try {
      // Remove from IndexedDB
      await this.storageManager.deleteBookmark(id);
    } catch (error) {
      console.error('Error handling Chrome bookmark removal:', error);
    }
  }

  async handleBookmarkChanged(id, changeInfo) {
    console.log('Chrome bookmark changed:', id, changeInfo);
    
    try {
      // Get current bookmark data
      const [chromeBookmark] = await chrome.bookmarks.get(id);
      if (chromeBookmark) {
        const importedBookmark = await this.importChromeBookmark(chromeBookmark);
        if (importedBookmark) {
          await this.storageManager.saveBookmark(importedBookmark);
        }
      }
    } catch (error) {
      console.error('Error handling Chrome bookmark change:', error);
    }
  }

  async handleBookmarkMoved(id, moveInfo) {
    console.log('Chrome bookmark moved:', id, moveInfo);
    
    // Handle folder structure changes if needed
    // For now, we just log the event
  }

  async importChromeBookmark(chromeBookmark) {
    if (!chromeBookmark.url) {
      return null; // Skip folder nodes
    }

    try {
      // Check if bookmark already exists
      const existing = await this.storageManager.getBookmark(chromeBookmark.id);
      if (existing) {
        return existing; // Bookmark already imported
      }

      // Import bookmark with Chrome ID
      const bookmark = {
        id: chromeBookmark.id, // Use Chrome ID for sync
        chromeId: chromeBookmark.id,
        url: chromeBookmark.url,
        title: chromeBookmark.title || 'Untitled',
        dateAdded: chromeBookmark.dateAdded ? new Date(chromeBookmark.dateAdded) : new Date(),
        dateModified: new Date(),
        description: '',
        tags: [],
        category: null,
        isDuplicate: false,
        isBroken: false,
        meta: {
          source: 'chrome',
          importDate: new Date()
        }
      };

      return bookmark;
    } catch (error) {
      console.error('Error importing Chrome bookmark:', error);
      return null;
    }
  }

  async analyzeAndStoreBookmark(bookmark) {
    try {
      // Extract metadata
      const metadata = await this.extractMetadata(bookmark.url);
      
      // Auto-categorize if enabled
      let category = null;
      const settings = await this.storageManager.getSettings();
      if (settings.autoCategorize) {
        const { Categorizer } = await import('../js/services/categorizer.js');
        const categorizer = new Categorizer();
        await categorizer.init();
        category = await categorizer.categorize(bookmark, metadata);
      }

      // Auto-tag if enabled
      let tags = [];
      if (settings.autoTag) {
        const { TagService } = await import('../js/services/tag-service.js');
        const tagService = new TagService();
        await tagService.init();
        tags = await tagService.suggestTags(bookmark, metadata);
      }

      // Update bookmark with analysis results
      const analyzedBookmark = {
        ...bookmark,
        category,
        tags,
        metadata: {
          ...metadata,
          ...bookmark.meta,
          analyzed: true,
          analysisDate: new Date()
        }
      };

      // Save to IndexedDB
      await this.storageManager.saveBookmark(analyzedBookmark);
      
      return analyzedBookmark;
    } catch (error) {
      console.error('Error analyzing bookmark:', error);
      
      // Save basic bookmark without analysis
      await this.storageManager.saveBookmark(bookmark);
      return bookmark;
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

  // Full sync operation
  async fullSync() {
    if (this.isSyncing) {
      console.log('Sync already in progress');
      return;
    }

    this.isSyncing = true;
    console.log('Starting full bookmark sync...');

    try {
      // Get Chrome bookmarks tree
      const chromeBookmarks = await chrome.bookmarks.getTree();
      const allChromeBookmarks = this.flattenBookmarks(chromeBookmarks);
      
      // Get IndexedDB bookmarks
      const localBookmarks = await this.storageManager.getAllBookmarks();
      const localBookmarkIds = new Set(localBookmarks.map(b => b.id));

      console.log(`Chrome: ${allChromeBookmarks.length}, Local: ${localBookmarks.length}`);

      // Import new Chrome bookmarks
      let imported = 0;
      for (const chromeBookmark of allChromeBookmarks) {
        if (!localBookmarkIds.has(chromeBookmark.id)) {
          const importedBookmark = await this.importChromeBookmark(chromeBookmark);
          if (importedBookmark) {
            await this.analyzeAndStoreBookmark(importedBookmark);
            imported++;
          }
        }
      }

      // Update existing bookmarks
      let updated = 0;
      for (const chromeBookmark of allChromeBookmarks) {
        const localBookmark = localBookmarks.find(b => b.id === chromeBookmark.id);
        if (localBookmark) {
          // Check if Chrome bookmark has been modified
          const chromeModified = chromeBookmark.dateModified || chromeBookmark.dateAdded || 0;
          const localModified = new Date(localBookmark.dateModified).getTime();
          
          if (chromeModified > localModified) {
            const updatedBookmark = {
              ...localBookmark,
              title: chromeBookmark.title || localBookmark.title,
              url: chromeBookmark.url || localBookmark.url,
              dateModified: new Date()
            };
            
            await this.storageManager.saveBookmark(updatedBookmark);
            updated++;
          }
        }
      }

      this.lastSyncTime = new Date();
      console.log(`Sync completed: ${imported} imported, ${updated} updated`);

      // Notify popup if open
      this.notifyPopup('sync_completed', {
        imported,
        updated,
        timestamp: this.lastSyncTime
      });

    } catch (error) {
      console.error('Error during full sync:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  // Schedule periodic sync
  scheduleSync() {
    // Sync immediately on startup
    this.fullSync();
    
    // Set up interval for periodic sync
    setInterval(() => {
      if (!this.isSyncing) {
        this.fullSync();
      }
    }, this.syncInterval);
  }

  // Flatten bookmark tree structure
  flattenBookmarks(bookmarkTree) {
    const bookmarks = [];
    
    const traverse = (nodes) => {
      for (const node of nodes) {
        if (node.url) {
          bookmarks.push({
            id: node.id,
            url: node.url,
            title: node.title || 'Untitled',
            dateAdded: node.dateAdded || Date.now(),
            dateModified: node.dateModified || node.dateAdded || Date.now()
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

  // Export Chrome bookmarks
  async exportToChrome() {
    try {
      const bookmarks = await this.storageManager.getAllBookmarks();
      
      // Create Chrome bookmark structure
      const chromeBookmarks = bookmarks.map(bookmark => ({
        url: bookmark.url,
        title: bookmark.title,
        dateAdded: Math.floor(new Date(bookmark.dateAdded).getTime() / 1000)
      }));

      // Create a folder for exported bookmarks
      const folderId = await chrome.bookmarks.create({
        parentId: '1', // Bookmarks bar
        title: 'Bookmark Manager Export',
        index: 0
      });

      // Add bookmarks to folder
      for (const bookmark of chromeBookmarks) {
        await chrome.bookmarks.create({
          parentId: folderId.id,
          title: bookmark.title,
          url: bookmark.url
        });
      }

      console.log(`Exported ${chromeBookmarks.length} bookmarks to Chrome`);
      return { success: true, count: chromeBookmarks.length };
      
    } catch (error) {
      console.error('Error exporting to Chrome:', error);
      throw error;
    }
  }

  // Notify popup of changes
  notifyPopup(type, data) {
    chrome.runtime.sendMessage({
      type,
      data
    }).catch(error => {
      // Popup not open, ignore error
      console.log('Popup not available for notification:', type);
    });
  }

  // Get sync statistics
  async getSyncStats() {
    const bookmarks = await this.storageManager.getAllBookmarks();
    const chromeSourceCount = bookmarks.filter(b => b.meta?.source === 'chrome').length;
    
    return {
      totalBookmarks: bookmarks.length,
      chromeBookmarks: chromeSourceCount,
      localBookmarks: bookmarks.length - chromeSourceCount,
      lastSyncTime: this.lastSyncTime,
      isSyncing: this.isSyncing,
      syncInterval: this.syncInterval
    };
  }

  // Force sync
  async forceSync() {
    console.log('Manual sync requested');
    await this.fullSync();
  }
}

// Export for use in background.js
export { BookmarkSyncService };