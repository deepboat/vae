// popup/popup.js
import { BookmarkService } from '../js/services/bookmark-service.js';
import { TagService } from '../js/services/tag-service.js';
import { Categorizer } from '../js/services/categorizer.js';
import { StorageManager } from '../js/database/storage.js';

class BookmarkManagerPopup {
  constructor() {
    this.bookmarkService = new BookmarkService();
    this.tagService = new TagService();
    this.categorizer = new Categorizer();
    this.storageManager = new StorageManager();
    
    this.currentView = 'list';
    this.currentFilters = {
      category: '',
      search: '',
      sortBy: 'dateModified',
      sortOrder: 'desc'
    };
    
    this.bookmarks = [];
    this.categories = [];
    this.tags = [];
  }

  async init() {
    try {
      // Initialize services
      await this.storageManager.init();
      await this.bookmarkService.init();
      await this.tagService.init();
      await this.categorizer.init();

      // Load initial data
      await this.loadData();

      // Setup event listeners
      this.setupEventListeners();

      // Render initial view
      await this.render();

    } catch (error) {
      console.error('Error initializing popup:', error);
      this.showStatus('Error initializing bookmark manager', 'error');
    }
  }

  async loadData() {
    try {
      this.bookmarks = await this.bookmarkService.getAllBookmarks();
      this.categories = await this.categorizer.getAllCategories();
      this.tags = await this.tagService.getAllTags();

      // Load settings
      const settings = await this.storageManager.getSettings();
      this.settings = settings || {};
      
    } catch (error) {
      console.error('Error loading data:', error);
      throw error;
    }
  }

  setupEventListeners() {
    // Search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.currentFilters.search = e.target.value;
        this.debounce(() => this.renderBookmarks(), 300)();
      });
    }

    // Filters
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
      categoryFilter.addEventListener('change', (e) => {
        this.currentFilters.category = e.target.value;
        this.renderBookmarks();
      });
    }

    const sortFilter = document.getElementById('sortFilter');
    if (sortFilter) {
      sortFilter.addEventListener('change', (e) => {
        this.currentFilters.sortBy = e.target.value;
        this.renderBookmarks();
      });
    }

    // View toggles
    const listViewBtn = document.getElementById('listViewBtn');
    if (listViewBtn) {
      listViewBtn.addEventListener('click', () => this.switchView('list'));
    }

    const gridViewBtn = document.getElementById('gridViewBtn');
    if (gridViewBtn) {
      gridViewBtn.addEventListener('click', () => this.switchView('grid'));
    }

    // Buttons
    const addBookmarkBtn = document.getElementById('addBookmarkBtn');
    if (addBookmarkBtn) {
      addBookmarkBtn.addEventListener('click', () => this.showAddBookmarkModal());
    }

    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.showSettingsModal());
    }

    // Modals
    const addBookmarkForm = document.getElementById('addBookmarkForm');
    if (addBookmarkForm) {
      addBookmarkForm.addEventListener('submit', (e) => this.handleAddBookmark(e));
    }

    const cancelAddBookmark = document.getElementById('cancelAddBookmark');
    if (cancelAddBookmark) {
      cancelAddBookmark.addEventListener('click', () => this.hideAddBookmarkModal());
    }

    const closeSettings = document.getElementById('closeSettings');
    if (closeSettings) {
      closeSettings.addEventListener('click', () => this.hideSettingsModal());
    }

    // Settings checkboxes
    const settingsCheckboxes = ['autoCategorize', 'autoTag', 'checkBrokenLinks', 'duplicateDetection'];
    settingsCheckboxes.forEach(id => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        checkbox.checked = this.settings[id] !== false;
        checkbox.addEventListener('change', (e) => this.updateSetting(id, e.target.checked));
      }
    });

    // Modal close on background click
    const modals = ['addBookmarkModal', 'settingsModal'];
    modals.forEach(modalId => {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            this.hideModal(modalId);
          }
        });
      }
    });

    // Status bar
    const statusClose = document.getElementById('statusClose');
    if (statusClose) {
      statusClose.addEventListener('click', () => this.hideStatus());
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'f':
            e.preventDefault();
            searchInput?.focus();
            break;
          case 'n':
            e.preventDefault();
            this.showAddBookmarkModal();
            break;
          case ',':
            e.preventDefault();
            this.showSettingsModal();
            break;
        }
      }
    });
  }

  async render() {
    await this.renderFilters();
    await this.renderBookmarks();
    this.renderStats();
    this.hideLoading();
  }

  async renderFilters() {
    // Populate category filter
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
      categoryFilter.innerHTML = '<option value="">All Categories</option>';
      
      this.categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        categoryFilter.appendChild(option);
      });
      
      categoryFilter.value = this.currentFilters.category;
    }
  }

  async renderBookmarks() {
    const bookmarkList = document.getElementById('bookmarkList');
    if (!bookmarkList) return;

    // Apply filters
    let filteredBookmarks = this.applyFilters(this.bookmarks);

    // Sort bookmarks
    filteredBookmarks = this.sortBookmarks(filteredBookmarks);

    // Show/hide empty state
    const emptyState = document.getElementById('emptyState');
    if (filteredBookmarks.length === 0) {
      bookmarkList.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    } else {
      bookmarkList.classList.remove('hidden');
      emptyState.classList.add('hidden');
    }

    // Render bookmarks
    bookmarkList.innerHTML = '';
    
    if (this.currentView === 'list') {
      this.renderListView(bookmarkList, filteredBookmarks);
    } else {
      this.renderGridView(bookmarkList, filteredBookmarks);
    }
  }

  applyFilters(bookmarks) {
    return bookmarks.filter(bookmark => {
      // Search filter
      if (this.currentFilters.search) {
        const query = this.currentFilters.search.toLowerCase();
        const matchesTitle = bookmark.title?.toLowerCase().includes(query);
        const matchesUrl = bookmark.url?.toLowerCase().includes(query);
        const matchesTags = bookmark.tags?.some(tag => 
          tag.name.toLowerCase().includes(query)
        );
        
        if (!matchesTitle && !matchesUrl && !matchesTags) {
          return false;
        }
      }

      // Category filter
      if (this.currentFilters.category && bookmark.category?.id !== this.currentFilters.category) {
        return false;
      }

      return true;
    });
  }

  sortBookmarks(bookmarks) {
    const { sortBy, sortOrder } = this.currentFilters;
    
    return [...bookmarks].sort((a, b) => {
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
  }

  renderListView(container, bookmarks) {
    container.className = 'space-y-1 p-2';
    
    bookmarks.forEach(bookmark => {
      const item = this.createListItem(bookmark);
      container.appendChild(item);
    });
  }

  renderGridView(container, bookmarks) {
    container.className = 'grid grid-cols-2 gap-2 p-2';
    
    bookmarks.forEach(bookmark => {
      const item = this.createGridItem(bookmark);
      container.appendChild(item);
    });
  }

  createListItem(bookmark) {
    const div = document.createElement('div');
    div.className = 'bookmark-item bg-white border border-gray-200 rounded p-3 hover:shadow-sm transition-shadow cursor-pointer';
    div.dataset.bookmarkId = bookmark.id;

    const categoryColor = bookmark.category?.color || '#6B7280';
    const faviconUrl = bookmark.meta?.favicon || `https://www.google.com/s2/favicons?domain=${this.extractDomain(bookmark.url)}&sz=32`;

    div.innerHTML = `
      <div class="flex items-start space-x-3">
        <img src="${faviconUrl}" alt="" class="w-5 h-5 flex-shrink-0 mt-0.5" onerror="this.style.display='none'">
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between">
            <h3 class="text-sm font-medium text-gray-900 truncate">${this.escapeHtml(bookmark.title)}</h3>
            <div class="flex items-center space-x-1 ml-2">
              ${bookmark.isDuplicate ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">Duplicate</span>' : ''}
              ${bookmark.isBroken ? '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Broken</span>' : ''}
            </div>
          </div>
          <p class="text-xs text-gray-500 truncate">${this.escapeHtml(bookmark.url)}</p>
          ${bookmark.description ? `<p class="text-xs text-gray-600 mt-1 line-clamp-2">${this.escapeHtml(bookmark.description)}</p>` : ''}
          <div class="flex items-center justify-between mt-2">
            <div class="flex items-center space-x-2">
              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style="background-color: ${categoryColor}20; color: ${categoryColor}">
                ${bookmark.category?.name || 'Uncategorized'}
              </span>
              ${this.renderTags(bookmark.tags)}
            </div>
            <span class="text-xs text-gray-400">${this.formatDate(bookmark.dateModified)}</span>
          </div>
        </div>
      </div>
    `;

    // Add click handler
    div.addEventListener('click', () => this.openBookmark(bookmark));

    // Add context menu
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e, bookmark);
    });

    return div;
  }

  createGridItem(bookmark) {
    const div = document.createElement('div');
    div.className = 'bookmark-item bg-white border border-gray-200 rounded p-3 hover:shadow-sm transition-shadow cursor-pointer';
    div.dataset.bookmarkId = bookmark.id;

    const categoryColor = bookmark.category?.color || '#6B7280';
    const faviconUrl = bookmark.meta?.favicon || `https://www.google.com/s2/favicons?domain=${this.extractDomain(bookmark.url)}&sz=32`;

    div.innerHTML = `
      <div class="text-center">
        <img src="${faviconUrl}" alt="" class="w-8 h-8 mx-auto mb-2" onerror="this.style.display='none'">
        <h3 class="text-sm font-medium text-gray-900 truncate mb-1">${this.escapeHtml(bookmark.title)}</h3>
        <p class="text-xs text-gray-500 truncate mb-2">${this.escapeHtml(this.extractDomain(bookmark.url))}</p>
        <div class="flex items-center justify-center space-x-1 mb-2">
          ${bookmark.isDuplicate ? '<span class="inline-flex items-center px-1 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">D</span>' : ''}
          ${bookmark.isBroken ? '<span class="inline-flex items-center px-1 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">B</span>' : ''}
        </div>
        <span class="inline-flex items-center px-2 py-1 rounded text-xs font-medium" style="background-color: ${categoryColor}20; color: ${categoryColor}">
          ${bookmark.category?.name || 'Uncategorized'}
        </span>
      </div>
    `;

    // Add click handler
    div.addEventListener('click', () => this.openBookmark(bookmark));

    // Add context menu
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e, bookmark);
    });

    return div;
  }

  renderTags(tags) {
    if (!tags || tags.length === 0) return '';
    
    const maxTags = 3;
    const visibleTags = tags.slice(0, maxTags);
    const hiddenCount = tags.length - maxTags;
    
    return `
      <div class="flex items-center space-x-1">
        ${visibleTags.map(tag => `
          <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium" style="background-color: ${tag.color}20; color: ${tag.color}">
            ${this.escapeHtml(tag.name)}
          </span>
        `).join('')}
        ${hiddenCount > 0 ? `<span class="text-xs text-gray-400">+${hiddenCount}</span>` : ''}
      </div>
    `;
  }

  renderStats() {
    const totalBookmarks = this.bookmarks.length;
    const duplicates = this.bookmarks.filter(b => b.isDuplicate).length;
    const broken = this.bookmarks.filter(b => b.isBroken).length;

    // Update count display
    const bookmarkCount = document.getElementById('bookmarkCount');
    if (bookmarkCount) {
      bookmarkCount.textContent = `${totalBookmarks} bookmark${totalBookmarks !== 1 ? 's' : ''}`;
    }

    // Update duplicate count
    const duplicateCount = document.getElementById('duplicateCount');
    if (duplicateCount) {
      if (duplicates > 0) {
        duplicateCount.textContent = `${duplicates} duplicate${duplicates !== 1 ? 's' : ''}`;
        duplicateCount.classList.remove('hidden');
      } else {
        duplicateCount.classList.add('hidden');
      }
    }

    // Update broken count
    const brokenCount = document.getElementById('brokenCount');
    if (brokenCount) {
      if (broken > 0) {
        brokenCount.textContent = `${broken} broken`;
        brokenCount.classList.remove('hidden');
      } else {
        brokenCount.classList.add('hidden');
      }
    }
  }

  // Event Handlers
  async handleAddBookmark(e) {
    e.preventDefault();
    
    const title = document.getElementById('newBookmarkTitle')?.value;
    const url = document.getElementById('newBookmarkUrl')?.value;
    const description = document.getElementById('newBookmarkDescription')?.value;

    if (!title || !url) {
      this.showStatus('Title and URL are required', 'error');
      return;
    }

    try {
      this.showStatus('Adding bookmark...', 'info');

      // Auto-categorize and tag if enabled
      let category = null;
      let tags = [];

      if (this.settings.autoCategorize) {
        const metadata = await this.extractMetadata(url);
        category = await this.categorizer.categorize({ title, url }, metadata);
      }

      if (this.settings.autoTag) {
        const metadata = await this.extractMetadata(url);
        tags = await this.tagService.suggestTags({ title, url, description }, metadata);
      }

      // Add bookmark
      const bookmark = await this.bookmarkService.addBookmark({
        title,
        url,
        description,
        category,
        tags
      });

      // Update local data
      this.bookmarks.unshift(bookmark);

      // Refresh UI
      await this.render();

      // Hide modal and reset form
      this.hideAddBookmarkModal();
      this.resetAddBookmarkForm();

      this.showStatus('Bookmark added successfully', 'success');

    } catch (error) {
      console.error('Error adding bookmark:', error);
      this.showStatus('Error adding bookmark: ' + error.message, 'error');
    }
  }

  async openBookmark(bookmark) {
    try {
      // Mark as visited
      await this.bookmarkService.markAsVisited(bookmark.id);
      
      // Open in new tab
      await chrome.tabs.create({ url: bookmark.url });
      
      // Close popup
      window.close();
      
    } catch (error) {
      console.error('Error opening bookmark:', error);
      this.showStatus('Error opening bookmark', 'error');
    }
  }

  showContextMenu(e, bookmark) {
    // Create a simple context menu
    const menu = document.createElement('div');
    menu.className = 'fixed bg-white border border-gray-200 rounded shadow-lg py-1 z-50 text-sm';
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';

    const actions = [
      { label: 'Open', action: () => this.openBookmark(bookmark) },
      { label: 'Edit', action: () => this.editBookmark(bookmark) },
      { label: 'Delete', action: () => this.deleteBookmark(bookmark) },
      { label: 'Mark as Duplicate', action: () => this.markAsDuplicate(bookmark) },
      { label: 'Mark as Broken', action: () => this.markAsBroken(bookmark) }
    ];

    actions.forEach(({ label, action }) => {
      const item = document.createElement('div');
      item.className = 'px-3 py-2 hover:bg-gray-100 cursor-pointer';
      item.textContent = label;
      item.addEventListener('click', () => {
        action();
        menu.remove();
      });
      menu.appendChild(item);
    });

    document.body.appendChild(menu);

    // Remove menu on click outside
    setTimeout(() => {
      document.addEventListener('click', function removeMenu() {
        menu.remove();
        document.removeEventListener('click', removeMenu);
      });
    }, 0);
  }

  async deleteBookmark(bookmark) {
    if (!confirm(`Delete bookmark "${bookmark.title}"?`)) {
      return;
    }

    try {
      await this.bookmarkService.deleteBookmark(bookmark.id);
      
      // Remove from local data
      this.bookmarks = this.bookmarks.filter(b => b.id !== bookmark.id);
      
      // Refresh UI
      await this.render();
      
      this.showStatus('Bookmark deleted', 'success');
      
    } catch (error) {
      console.error('Error deleting bookmark:', error);
      this.showStatus('Error deleting bookmark', 'error');
    }
  }

  // UI State Management
  switchView(view) {
    this.currentView = view;
    
    // Update button states
    const listBtn = document.getElementById('listViewBtn');
    const gridBtn = document.getElementById('gridViewBtn');
    
    if (listBtn && gridBtn) {
      listBtn.classList.toggle('active', view === 'list');
      gridBtn.classList.toggle('active', view === 'grid');
    }
    
    this.renderBookmarks();
  }

  showAddBookmarkModal() {
    const modal = document.getElementById('addBookmarkModal');
    if (modal) {
      modal.classList.remove('hidden');
      
      // Pre-fill with current tab if available
      this.prefillCurrentTab();
    }
  }

  hideAddBookmarkModal() {
    const modal = document.getElementById('addBookmarkModal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  resetAddBookmarkForm() {
    const form = document.getElementById('addBookmarkForm');
    if (form) {
      form.reset();
    }
  }

  showSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  hideSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  showStatus(message, type = 'info') {
    const statusBar = document.getElementById('statusBar');
    const statusMessage = document.getElementById('statusMessage');
    
    if (statusBar && statusMessage) {
      statusMessage.textContent = message;
      
      // Set color based on type
      statusBar.className = 'px-3 py-1 text-xs border-b ' + 
        (type === 'error' ? 'bg-red-50 text-red-700' :
         type === 'success' ? 'bg-green-50 text-green-700' :
         'bg-blue-50 text-blue-700');
      
      statusBar.classList.remove('hidden');
      
      // Auto-hide after 5 seconds
      setTimeout(() => this.hideStatus(), 5000);
    }
  }

  hideStatus() {
    const statusBar = document.getElementById('statusBar');
    if (statusBar) {
      statusBar.classList.add('hidden');
    }
  }

  hideLoading() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) {
      loadingSpinner.classList.add('hidden');
    }
  }

  // Utility Methods
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  formatDate(date) {
    if (!date) return '';
    
    const now = new Date();
    const diff = now - new Date(date);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    
    return `${Math.floor(days / 365)} years ago`;
  }

  async prefillCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && tab.title) {
        const titleInput = document.getElementById('newBookmarkTitle');
        const urlInput = document.getElementById('newBookmarkUrl');
        
        if (titleInput && !titleInput.value) {
          titleInput.value = tab.title;
        }
        
        if (urlInput && !urlInput.value) {
          urlInput.value = tab.url;
        }
      }
    } catch (error) {
      console.error('Error getting current tab:', error);
    }
  }

  async extractMetadata(url) {
    try {
      const urlObj = new URL(url);
      return {
        domain: urlObj.hostname,
        protocol: urlObj.protocol,
        pathname: urlObj.pathname,
        isSecure: urlObj.protocol === 'https:'
      };
    } catch {
      return {};
    }
  }

  async updateSetting(key, value) {
    try {
      await this.storageManager.saveSetting(key, value);
      this.settings[key] = value;
    } catch (error) {
      console.error('Error updating setting:', error);
    }
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const popup = new BookmarkManagerPopup();
  popup.init();
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BookmarkManagerPopup;
}