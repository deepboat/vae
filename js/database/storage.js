// js/database/storage.js
class StorageManager {
  constructor() {
    this.dbName = 'BookmarkManagerDB';
    this.dbVersion = 1;
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create bookmarks store
        if (!db.objectStoreNames.contains('bookmarks')) {
          const bookmarksStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
          bookmarksStore.createIndex('by-url', 'url', { unique: false });
          bookmarksStore.createIndex('by-domain', 'meta.domain', { unique: false });
          bookmarksStore.createIndex('by-date', 'dateAdded', { unique: false });
          bookmarksStore.createIndex('by-category', 'category.id', { unique: false });
          bookmarksStore.createIndex('by-broken', 'isBroken', { unique: false });
          bookmarksStore.createIndex('by-duplicate', 'isDuplicate', { unique: false });
        }

        // Create tags store
        if (!db.objectStoreNames.contains('tags')) {
          const tagsStore = db.createObjectStore('tags', { keyPath: 'id' });
          tagsStore.createIndex('by-name', 'name', { unique: false });
          tagsStore.createIndex('by-category', 'category', { unique: false });
          tagsStore.createIndex('by-usage', 'usageCount', { unique: false });
        }

        // Create categories store
        if (!db.objectStoreNames.contains('categories')) {
          const categoriesStore = db.createObjectStore('categories', { keyPath: 'id' });
          categoriesStore.createIndex('by-name', 'name', { unique: false });
          categoriesStore.createIndex('by-parent', 'parentId', { unique: false });
          categoriesStore.createIndex('by-order', 'order', { unique: false });
        }

        // Create settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  // Bookmark operations
  async saveBookmark(bookmark) {
    const transaction = this.db.transaction(['bookmarks'], 'readwrite');
    const store = transaction.objectStore('bookmarks');
    
    const request = store.put({
      ...bookmark,
      dateModified: new Date()
    });
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(bookmark);
      request.onerror = () => reject(request.error);
    });
  }

  async getBookmark(id) {
    const transaction = this.db.transaction(['bookmarks'], 'readonly');
    const store = transaction.objectStore('bookmarks');
    
    const request = store.get(id);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllBookmarks() {
    const transaction = this.db.transaction(['bookmarks'], 'readonly');
    const store = transaction.objectStore('bookmarks');
    
    const request = store.getAll();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteBookmark(id) {
    const transaction = this.db.transaction(['bookmarks'], 'readwrite');
    const store = transaction.objectStore('bookmarks');
    
    const request = store.delete(id);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async searchBookmarks(query, filters = {}) {
    const allBookmarks = await this.getAllBookmarks();
    
    return allBookmarks.filter(bookmark => {
      // Text search
      if (query) {
        const searchText = query.toLowerCase();
        const matchesTitle = bookmark.title?.toLowerCase().includes(searchText);
        const matchesUrl = bookmark.url?.toLowerCase().includes(searchText);
        const matchesTags = bookmark.tags?.some(tag => 
          tag.name.toLowerCase().includes(searchText)
        );
        
        if (!matchesTitle && !matchesUrl && !matchesTags) {
          return false;
        }
      }

      // Category filter
      if (filters.category && bookmark.category?.id !== filters.category) {
        return false;
      }

      // Tag filter
      if (filters.tags && filters.tags.length > 0) {
        const hasRequiredTags = filters.tags.every(tagId =>
          bookmark.tags?.some(tag => tag.id === tagId)
        );
        if (!hasRequiredTags) {
          return false;
        }
      }

      // Status filters
      if (filters.showBroken && !bookmark.isBroken) {
        return false;
      }
      
      if (filters.showDuplicates && !bookmark.isDuplicate) {
        return false;
      }

      return true;
    });
  }

  // Tag operations
  async saveTag(tag) {
    const transaction = this.db.transaction(['tags'], 'readwrite');
    const store = transaction.objectStore('tags');
    
    const request = store.put({
      ...tag,
      modified: new Date()
    });
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(tag);
      request.onerror = () => reject(request.error);
    });
  }

  async getTag(id) {
    const transaction = this.db.transaction(['tags'], 'readonly');
    const store = transaction.objectStore('tags');
    
    const request = store.get(id);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllTags() {
    const transaction = this.db.transaction(['tags'], 'readonly');
    const store = transaction.objectStore('tags');
    
    const request = store.getAll();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteTag(id) {
    const transaction = this.db.transaction(['tags'], 'readwrite');
    const store = transaction.objectStore('tags');
    
    const request = store.delete(id);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Category operations
  async saveCategory(category) {
    const transaction = this.db.transaction(['categories'], 'readwrite');
    const store = transaction.objectStore('categories');
    
    const request = store.put({
      ...category,
      modified: new Date()
    });
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(category);
      request.onerror = () => reject(request.error);
    });
  }

  async getCategory(id) {
    const transaction = this.db.transaction(['categories'], 'readonly');
    const store = transaction.objectStore('categories');
    
    const request = store.get(id);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllCategories() {
    const transaction = this.db.transaction(['categories'], 'readonly');
    const store = transaction.objectStore('categories');
    
    const request = store.getAll();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // Settings operations
  async saveSettings(settings) {
    const transaction = this.db.transaction(['settings'], 'readwrite');
    const store = transaction.objectStore('settings');
    
    const requests = Object.entries(settings).map(([key, value]) => {
      return new Promise((resolve, reject) => {
        const request = store.put({ key, value });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
    
    return Promise.all(requests);
  }

  async getSettings() {
    const transaction = this.db.transaction(['settings'], 'readonly');
    const store = transaction.objectStore('settings');
    
    const request = store.getAll();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const settings = {};
        request.result.forEach(item => {
          settings[item.key] = item.value;
        });
        resolve(settings);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getSetting(key, defaultValue = null) {
    const transaction = this.db.transaction(['settings'], 'readonly');
    const store = transaction.objectStore('settings');
    
    const request = store.get(key);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result ? request.result.value : defaultValue);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Utility methods
  async clearAllData() {
    const stores = ['bookmarks', 'tags', 'categories'];
    const transactions = stores.map(storeName => 
      this.db.transaction([storeName], 'readwrite')
    );
    
    const requests = transactions.map((transaction, index) => {
      const store = transaction.objectStore(stores[index]);
      return store.clear();
    });
    
    return Promise.all(requests);
  }

  async exportData() {
    const [bookmarks, tags, categories, settings] = await Promise.all([
      this.getAllBookmarks(),
      this.getAllTags(),
      this.getAllCategories(),
      this.getSettings()
    ]);
    
    return {
      bookmarks,
      tags,
      categories,
      settings,
      exportDate: new Date(),
      version: this.dbVersion
    };
  }

  async importData(data) {
    // Validate data structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid import data');
    }

    const { bookmarks, tags, categories, settings } = data;
    
    // Clear existing data
    await this.clearAllData();
    
    // Import in order (categories and tags first, then bookmarks)
    if (Array.isArray(categories)) {
      for (const category of categories) {
        await this.saveCategory(category);
      }
    }
    
    if (Array.isArray(tags)) {
      for (const tag of tags) {
        await this.saveTag(tag);
      }
    }
    
    if (Array.isArray(bookmarks)) {
      for (const bookmark of bookmarks) {
        await this.saveBookmark(bookmark);
      }
    }
    
    if (settings && typeof settings === 'object') {
      await this.saveSettings(settings);
    }
  }
}

export { StorageManager };