// tests/unit/bookmark-service.test.js
import { BookmarkService } from '../js/services/bookmark-service.js';

describe('BookmarkService', () => {
  let bookmarkService;

  beforeEach(() => {
    bookmarkService = new BookmarkService();
    // Mock the storage manager
    bookmarkService.storageManager = {
      init: jest.fn().mockResolvedValue(undefined),
      saveBookmark: jest.fn(),
      getBookmark: jest.fn(),
      getAllBookmarks: jest.fn().mockResolvedValue([]),
      deleteBookmark: jest.fn()
    };
  });

  describe('addBookmark', () => {
    it('should add a valid bookmark', async () => {
      const bookmarkData = {
        title: 'Test Bookmark',
        url: 'https://example.com',
        description: 'A test bookmark',
        tags: []
      };

      const result = await bookmarkService.addBookmark(bookmarkData);
      
      expect(result.id).toBeDefined();
      expect(result.title).toBe(bookmarkData.title);
      expect(result.url).toBe(bookmarkData.url);
      expect(result.isDuplicate).toBe(false);
      expect(bookmarkService.storageManager.saveBookmark).toHaveBeenCalled();
    });

    it('should detect duplicate URLs', async () => {
      // Mock existing bookmarks with same URL
      bookmarkService.storageManager.getAllBookmarks.mockResolvedValue([
        {
          id: 'existing-1',
          title: 'Existing Bookmark',
          url: 'https://example.com',
          isDuplicate: false
        }
      ]);

      const bookmarkData = {
        title: 'New Bookmark',
        url: 'https://example.com'
      };

      const result = await bookmarkService.addBookmark(bookmarkData);
      
      expect(result.isDuplicate).toBe(true);
      expect(result.duplicateOf).toBe('existing-1');
    });

    it('should validate bookmark data', async () => {
      const invalidData = {
        title: '', // Empty title
        url: 'invalid-url'
      };

      await expect(bookmarkService.addBookmark(invalidData))
        .rejects.toThrow('Invalid bookmark');
    });

    it('should reject dangerous URLs', async () => {
      const dangerousData = {
        title: 'Test',
        url: 'javascript:alert("xss")'
      };

      await expect(bookmarkService.addBookmark(dangerousData))
        .rejects.toThrow('Dangerous URL scheme detected');
    });
  });

  describe('updateBookmark', () => {
    it('should update an existing bookmark', async () => {
      // Mock existing bookmark
      bookmarkService.storageManager.getBookmark.mockResolvedValue({
        id: 'test-id',
        title: 'Original Title',
        url: 'https://example.com'
      });
      bookmarkService.storageManager.saveBookmark.mockResolvedValue({});

      const updates = {
        title: 'Updated Title',
        description: 'Updated description'
      };

      const result = await bookmarkService.updateBookmark('test-id', updates);
      
      expect(result.title).toBe('Updated Title');
      expect(result.description).toBe('Updated description');
      expect(bookmarkService.storageManager.saveBookmark).toHaveBeenCalled();
    });

    it('should throw error for non-existent bookmark', async () => {
      bookmarkService.storageManager.getBookmark.mockResolvedValue(null);

      await expect(bookmarkService.updateBookmark('non-existent', {}))
        .rejects.toThrow('Bookmark not found');
    });
  });

  describe('findDuplicates', () => {
    it('should find duplicate bookmarks', async () => {
      const bookmarks = [
        {
          id: '1',
          title: 'Bookmark 1',
          url: 'https://example.com',
          dateAdded: new Date('2023-01-01')
        },
        {
          id: '2',
          title: 'Bookmark 2',
          url: 'https://example.com', // Same URL
          dateAdded: new Date('2023-01-02')
        },
        {
          id: '3',
          title: 'Different URL',
          url: 'https://different.com'
        }
      ];

      bookmarkService.storageManager.getAllBookmarks.mockResolvedValue(bookmarks);

      const duplicates = await bookmarkService.findDuplicates();
      
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].bookmarks).toHaveLength(2);
      expect(duplicates[0].url).toBe('https://example.com');
    });

    it('should handle URL normalization', async () => {
      const bookmarks = [
        {
          id: '1',
          title: 'With www',
          url: 'https://www.example.com/path/'
        },
        {
          id: '2',
          title: 'Without www',
          url: 'https://example.com/path' // Should be treated as duplicate
        }
      ];

      bookmarkService.storageManager.getAllBookmarks.mockResolvedValue(bookmarks);

      const duplicates = await bookmarkService.findDuplicates();
      
      expect(duplicates).toHaveLength(1);
    });
  });

  describe('validateBookmark', () => {
    it('should validate a correct bookmark', () => {
      const validBookmark = {
        title: 'Valid Bookmark',
        url: 'https://example.com',
        description: 'A valid bookmark description'
      };

      const result = bookmarkService.validateBookmark(validBookmark);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject bookmarks with missing title', () => {
      const invalidBookmark = {
        title: '',
        url: 'https://example.com'
      };

      const result = bookmarkService.validateBookmark(invalidBookmark);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Title is required');
    });

    it('should reject bookmarks with missing URL', () => {
      const invalidBookmark = {
        title: 'Test Bookmark'
      };

      const result = bookmarkService.validateBookmark(invalidBookmark);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('URL is required');
    });

    it('should reject invalid URLs', () => {
      const invalidBookmark = {
        title: 'Test',
        url: 'not-a-url'
      };

      const result = bookmarkService.validateBookmark(invalidBookmark);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Invalid URL'))).toBe(true);
    });

    it('should reject overly long titles', () => {
      const invalidBookmark = {
        title: 'a'.repeat(256), // Too long
        url: 'https://example.com'
      };

      const result = bookmarkService.validateBookmark(invalidBookmark);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Title too long');
    });
  });

  describe('normalizeUrl', () => {
    it('should normalize URLs correctly', () => {
      const testCases = [
        {
          input: 'https://www.example.com/path/',
          expected: 'example.com/path'
        },
        {
          input: 'http://example.com/path',
          expected: 'example.com/path'
        },
        {
          input: 'https://example.com/path?param=value&other=test',
          expected: 'example.com/path?other=test&param=value' // Sorted params
        },
        {
          input: 'https://example.com/path#section',
          expected: 'example.com/path#section'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = bookmarkService.normalizeUrl(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = bookmarkService.generateId();
      const id2 = bookmarkService.generateId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^bm_\d+_[a-z0-9]+$/);
    });
  });
});