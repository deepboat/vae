// tests/unit/duplicate-detector.test.js
import { DuplicateDetector } from '../background/duplicate-detector.js';

describe('DuplicateDetector', () => {
  let duplicateDetector;

  beforeEach(() => {
    duplicateDetector = new DuplicateDetector();
    // Mock the bookmark service
    duplicateDetector.bookmarkService = {
      init: jest.fn().mockResolvedValue(undefined),
      getAllBookmarks: jest.fn().mockResolvedValue([]),
      updateBookmark: jest.fn().mockResolvedValue({})
    };
  });

  describe('findAll', () => {
    it('should find duplicate bookmarks', async () => {
      const bookmarks = [
        {
          id: '1',
          title: 'GitHub Repository',
          url: 'https://github.com/user/repo'
        },
        {
          id: '2',
          title: 'GitHub Repo', // Same repository
          url: 'https://github.com/user/repo'
        },
        {
          id: '3',
          title: 'Different Site',
          url: 'https://example.com'
        }
      ];

      duplicateDetector.bookmarkService.getAllBookmarks.mockResolvedValue(bookmarks);

      const duplicates = await duplicateDetector.findAll();
      
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].bookmarks).toHaveLength(2);
      expect(duplicates[0].count).toBe(2);
    });

    it('should return empty array when no duplicates found', async () => {
      const bookmarks = [
        {
          id: '1',
          title: 'Site 1',
          url: 'https://example1.com'
        },
        {
          id: '2',
          title: 'Site 2',
          url: 'https://example2.com'
        }
      ];

      duplicateDetector.bookmarkService.getAllBookmarks.mockResolvedValue(bookmarks);

      const duplicates = await duplicateDetector.findAll();
      
      expect(duplicates).toHaveLength(0);
    });
  });

  describe('normalizeUrl', () => {
    it('should normalize URLs correctly', () => {
      const testCases = [
        {
          input: 'https://www.github.com/user/repo/',
          expected: 'github.com/user/repo'
        },
        {
          input: 'http://github.com/user/repo',
          expected: 'github.com/user/repo'
        },
        {
          input: 'https://github.com/user/repo?utm_source=github',
          expected: 'github.com/user/repo'
        },
        {
          input: 'https://github.com/user/repo#readme',
          expected: 'github.com/user/repo#readme'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = duplicateDetector.normalizeUrl(input);
        expect(result).toBe(expected);
      });
    });

    it('should handle invalid URLs gracefully', () => {
      const invalidUrl = 'not-a-valid-url';
      const result = duplicateDetector.normalizeUrl(invalidUrl);
      
      expect(result).toBe('not-a-valid-url');
    });
  });

  describe('recommendAction', () => {
    it('should recommend keeping bookmark with best metadata', () => {
      const bookmarks = [
        {
          id: '1',
          title: 'Short Title',
          description: '',
          tags: [],
          visitCount: 0
        },
        {
          id: '2',
          title: 'This is a very descriptive and detailed title about this bookmark',
          description: 'A comprehensive description of the bookmark content',
          tags: [{ name: 'tag1' }, { name: 'tag2' }],
          visitCount: 5,
          dateVisited: new Date()
        }
      ];

      const recommendation = duplicateDetector.recommendAction(bookmarks);
      
      expect(recommendation.keep).toBe('2');
      expect(recommendation.action).toBe('merge_metadata');
    });

    it('should handle edge cases gracefully', () => {
      const bookmarks = [
        {
          id: '1',
          title: '',
          description: '',
          tags: [],
          visitCount: 0
        }
      ];

      const recommendation = duplicateDetector.recommendAction(bookmarks);
      
      expect(recommendation.keep).toBe('1');
    });
  });

  describe('scoreBookmarks', () => {
    it('should score bookmarks based on quality metrics', () => {
      const bookmarks = [
        {
          id: '1',
          title: 'Good Title',
          description: 'Good description',
          tags: [{ name: 'tag1' }],
          visitCount: 3,
          dateVisited: new Date()
        },
        {
          id: '2',
          title: 'Better and More Descriptive Title',
          description: 'Even better description with more details',
          tags: [{ name: 'tag1' }, { name: 'tag2' }],
          visitCount: 10,
          dateVisited: new Date(Date.now() - 1000) // More recent
        }
      ];

      const scored = duplicateDetector.scoreBookmarks(bookmarks);
      
      expect(scored).toHaveLength(2);
      expect(scored[0].bookmark.id).toBe('2'); // Second bookmark should score higher
      expect(scored[0].score).toBeGreaterThan(scored[1].score);
    });

    it('should penalize broken bookmarks', () => {
      const bookmarks = [
        {
          id: '1',
          title: 'Working Bookmark',
          isBroken: false,
          visitCount: 5
        },
        {
          id: '2',
          title: 'Broken Bookmark',
          isBroken: true,
          visitCount: 5
        }
      ];

      const scored = duplicateDetector.scoreBookmarks(bookmarks);
      
      expect(scored[0].bookmark.id).toBe('1'); // Working bookmark should score higher
      expect(scored[0].score).toBeGreaterThan(scored[1].score);
    });
  });

  describe('mergeTitles', () => {
    it('should merge titles from multiple bookmarks', () => {
      const bookmarks = [
        { title: 'Short Title' },
        { title: 'This is a very long and descriptive title' },
        { title: '' }
      ];

      const merged = duplicateDetector.mergeTitles(bookmarks);
      
      expect(merged).toBe('This is a very long and descriptive title');
    });

    it('should handle empty titles', () => {
      const bookmarks = [
        { title: '' },
        { title: '' }
      ];

      const merged = duplicateDetector.mergeTitles(bookmarks);
      
      expect(merged).toBe('');
    });
  });

  describe('mergeTags', () => {
    it('should merge tags without duplicates', () => {
      const bookmarks = [
        {
          tags: [
            { id: '1', name: 'JavaScript', color: '#F7DF1E' },
            { id: '2', name: 'Tutorial', color: '#10B981' }
          ]
        },
        {
          tags: [
            { id: '1', name: 'JavaScript', color: '#F7DF1E' }, // Duplicate
            { id: '3', name: 'Programming', color: '#3B82F6' }
          ]
        }
      ];

      const merged = duplicateDetector.mergeTags(bookmarks);
      
      expect(merged).toHaveLength(3);
      expect(merged.some(tag => tag.name === 'JavaScript')).toBe(true);
      expect(merged.some(tag => tag.name === 'Tutorial')).toBe(true);
      expect(merged.some(tag => tag.name === 'Programming')).toBe(true);
    });
  });

  describe('calculateSeverity', () => {
    it('should calculate correct severity levels', () => {
      expect(duplicateDetector.calculateSeverity(5)).toBe('critical');
      expect(duplicateDetector.calculateSeverity(3)).toBe('high');
      expect(duplicateDetector.calculateSeverity(2)).toBe('medium');
    });
  });

  describe('autoResolve', () => {
    it('should auto-resolve duplicates', async () => {
      const duplicateGroups = [
        {
          id: 'group1',
          bookmarks: [
            {
              id: '1',
              title: 'Better Title',
              description: 'Better description',
              tags: [{ name: 'tag1' }]
            },
            {
              id: '2',
              title: 'Short',
              description: '',
              tags: []
            }
          ],
          recommendedAction: {
            keep: '1',
            action: 'merge_metadata'
          }
        }
      ];

      duplicateDetector.findAll = jest.fn().mockResolvedValue(duplicateGroups);
      duplicateDetector.bookmarkService.updateBookmark = jest.fn().mockResolvedValue({});

      const results = await duplicateDetector.autoResolve();
      
      expect(results).toHaveLength(1);
      expect(results[0].kept).toBe('1');
      expect(results[0].removed).toContain('2');
    });
  });

  describe('cleanup', () => {
    it('should clean up orphaned duplicate flags', async () => {
      const bookmarks = [
        {
          id: '1',
          title: 'Original',
          isDuplicate: false
        },
        {
          id: '2',
          title: 'Duplicate',
          isDuplicate: true,
          duplicateOf: 'non-existent' // Original doesn't exist
        }
      ];

      duplicateDetector.bookmarkService.getAllBookmarks = jest.fn().mockResolvedValue(bookmarks);
      duplicateDetector.bookmarkService.getBookmark = jest.fn()
        .mockResolvedValueOnce(null) // Original doesn't exist
        .mockResolvedValueOnce(bookmarks[0]); // Second call for the duplicate
      duplicateDetector.bookmarkService.updateBookmark = jest.fn().mockResolvedValue({});

      await duplicateDetector.cleanup();
      
      expect(duplicateDetector.bookmarkService.updateBookmark).toHaveBeenCalledWith('2', {
        isDuplicate: false,
        duplicateOf: null
      });
    });
  });
});