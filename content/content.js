// content/content.js
class BookmarkContentScript {
  constructor() {
    this.init();
  }

  init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.onReady());
    } else {
      this.onReady();
    }
  }

  async onReady() {
    try {
      // Inject bookmark detection
      this.detectBookmarkableContent();
      
      // Listen for page changes (SPA support)
      this.setupPageChangeDetection();
      
      // Add keyboard shortcuts
      this.setupKeyboardShortcuts();
      
      // Add context menu for bookmarks
      this.setupContextMenu();
      
    } catch (error) {
      console.error('Error initializing content script:', error);
    }
  }

  detectBookmarkableContent() {
    // Detect if current page has bookmark-worthy content
    const pageData = this.extractPageData();
    
    // Add visual indicator for bookmarkable content
    this.addBookmarkIndicator(pageData);
  }

  extractPageData() {
    const data = {
      url: window.location.href,
      title: document.title,
      description: this.getMetaContent('description') || this.getMetaContent('og:description') || '',
      favicon: this.getFaviconUrl(),
      language: document.documentElement.lang || 'unknown',
      contentType: this.detectContentType(),
      keywords: this.extractKeywords(),
      images: this.extractImages(),
      readingTime: this.estimateReadingTime()
    };

    return data;
  }

  getMetaContent(name) {
    const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
    return meta ? meta.content : '';
  }

  getFaviconUrl() {
    // Try various favicon sources
    const favicon = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
    if (favicon) {
      return new URL(favicon.href, window.location.href).href;
    }
    
    // Default favicon locations
    const defaultLocations = [
      '/favicon.ico',
      '/favicon.png',
      '/apple-touch-icon.png',
      '/site.webmanifest'
    ];
    
    for (const location of defaultLocations) {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = new URL(location, window.location.href).href;
      if (link.complete) {
        return link.href;
      }
    }
    
    // Fallback to Google favicon service
    return `https://www.google.com/s2/favicons?domain=${window.location.hostname}&sz=32`;
  }

  detectContentType() {
    const contentType = document.querySelector('meta[http-equiv="Content-Type"]');
    if (contentType) {
      return contentType.content;
    }
    
    // Detect by content patterns
    const text = document.body.textContent.toLowerCase();
    
    if (text.includes('article') || text.includes('blog post')) {
      return 'article';
    } else if (text.includes('video') || document.querySelector('video')) {
      return 'video';
    } else if (text.includes('documentation') || text.includes('api reference')) {
      return 'documentation';
    } else if (text.includes('tutorial') || text.includes('how to')) {
      return 'tutorial';
    }
    
    return 'webpage';
  }

  extractKeywords() {
    // Extract from meta keywords, OpenGraph, or content
    let keywords = [];
    
    // Try meta keywords
    const metaKeywords = this.getMetaContent('keywords');
    if (metaKeywords) {
      keywords = metaKeywords.split(',').map(k => k.trim());
    }
    
    // Try OpenGraph tags
    const ogTags = ['og:title', 'og:description'];
    ogTags.forEach(tag => {
      const content = this.getMetaContent(tag);
      if (content) {
        keywords.push(...content.split(/\s+/).slice(0, 5));
      }
    });
    
    // Extract from headings
    const headings = document.querySelectorAll('h1, h2, h3');
    headings.forEach(heading => {
      const text = heading.textContent.trim();
      if (text && text.length > 3) {
        keywords.push(...text.split(/\s+/).slice(0, 3));
      }
    });
    
    return [...new Set(keywords)].slice(0, 10);
  }

  extractImages() {
    const images = [];
    const imgElements = document.querySelectorAll('img');
    
    imgElements.forEach(img => {
      if (img.src && img.naturalWidth > 100 && img.naturalHeight > 100) {
        images.push({
          src: img.src,
          alt: img.alt || '',
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      }
    });
    
    return images.slice(0, 5); // Limit to 5 images
  }

  estimateReadingTime() {
    const text = document.body.textContent || '';
    const wordsPerMinute = 200;
    const words = text.trim().split(/\s+/).length;
    const minutes = Math.ceil(words / wordsPerMinute);
    return Math.max(1, minutes);
  }

  addBookmarkIndicator(pageData) {
    // Only show for pages with substantial content
    if (pageData.title && pageData.description) {
      this.createBookmarkButton(pageData);
    }
  }

  createBookmarkButton(pageData) {
    // Create floating bookmark button
    const button = document.createElement('div');
    button.id = 'bookmark-manager-float-btn';
    button.innerHTML = `
      <div class="bookmark-btn-content">
        <svg class="bookmark-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
        </svg>
        <span class="bookmark-text">Bookmark</span>
      </div>
    `;
    
    // Add styles
    button.style.cssText = `
      position: fixed;
      top: 50%;
      right: 20px;
      transform: translateY(-50%);
      background: #3b82f6;
      color: white;
      border-radius: 25px;
      padding: 12px 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      cursor: pointer;
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 8px;
      border: none;
      outline: none;
    `;
    
    // Add hover effect
    button.addEventListener('mouseenter', () => {
      button.style.background = '#2563eb';
      button.style.transform = 'translateY(-50%) scale(1.05)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.background = '#3b82f6';
      button.style.transform = 'translateY(-50%) scale(1)';
    });
    
    // Click handler
    button.addEventListener('click', () => {
      this.quickBookmark(pageData);
    });
    
    document.body.appendChild(button);
  }

  async quickBookmark(pageData) {
    try {
      // Send message to background script to create bookmark
      const response = await chrome.runtime.sendMessage({
        type: 'CREATE_BOOKMARK',
        data: {
          ...pageData,
          timestamp: Date.now()
        }
      });
      
      if (response.success) {
        this.showBookmarkSuccess();
      } else {
        this.showBookmarkError(response.error);
      }
      
    } catch (error) {
      console.error('Error creating bookmark:', error);
      this.showBookmarkError('Failed to create bookmark');
    }
  }

  showBookmarkSuccess() {
    const notification = this.createNotification('Bookmark added successfully!', 'success');
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  showBookmarkError(message) {
    const notification = this.createNotification(message, 'error');
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 5000);
  }

  createNotification(message, type = 'info') {
    const notification = document.createElement('div');
    const bgColor = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6';
    
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${bgColor};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      max-width: 300px;
      animation: slideIn 0.3s ease;
    `;
    
    notification.textContent = message;
    
    // Add animation keyframes if not already present
    if (!document.getElementById('bookmark-notification-styles')) {
      const style = document.createElement('style');
      style.id = 'bookmark-notification-styles';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
    
    return notification;
  }

  setupPageChangeDetection() {
    // Handle single-page applications
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(() => this.onReady(), 1000); // Wait for content to load
      }
    }).observe(document, { subtree: true, childList: true });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+A or Cmd+Shift+A to add bookmark
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        const pageData = this.extractPageData();
        this.quickBookmark(pageData);
      }
    });
  }

  setupContextMenu() {
    // Add context menu option for bookmarking
    document.addEventListener('contextmenu', (e) => {
      // Only show for links or selected text
      if (e.target.tagName === 'A' || window.getSelection().toString()) {
        const bookmarkOption = document.createElement('div');
        bookmarkOption.id = 'bookmark-context-option';
        bookmarkOption.textContent = 'Bookmark with Bookmark Manager';
        bookmarkOption.style.cssText = `
          padding: 8px 12px;
          cursor: pointer;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
        `;
        
        bookmarkOption.addEventListener('click', () => {
          const pageData = this.extractPageData();
          if (e.target.tagName === 'A') {
            pageData.url = e.target.href;
            pageData.title = e.target.textContent.trim() || pageData.title;
          }
          this.quickBookmark(pageData);
          document.getElementById('bookmark-context-option')?.remove();
        });
        
        // Position the option
        bookmarkOption.style.position = 'fixed';
        bookmarkOption.style.left = e.pageX + 'px';
        bookmarkOption.style.top = e.pageY + 'px';
        bookmarkOption.style.zIndex = '10000';
        bookmarkOption.style.background = 'white';
        bookmarkOption.style.border = '1px solid #e5e7eb';
        bookmarkOption.style.borderRadius = '6px';
        bookmarkOption.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        
        // Remove existing option
        document.getElementById('bookmark-context-option')?.remove();
        document.body.appendChild(bookmarkOption);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
          bookmarkOption.remove();
        }, 5000);
      }
    });
  }
}

// Initialize content script
new BookmarkContentScript();