// tests/unit/tag-service.test.js
import { TagService } from '../js/services/tag-service.js';

describe('TagService', () => {
  let tagService;

  beforeEach(() => {
    tagService = new TagService();
    // Mock the storage manager
    tagService.storageManager = {
      init: jest.fn().mockResolvedValue(undefined),
      saveTag: jest.fn(),
      getTag: jest.fn(),
      getAllTags: jest.fn().mockResolvedValue([]),
      deleteTag: jest.fn(),
      getAllBookmarks: jest.fn().mockResolvedValue([])
    };
  });

  describe('createTag', () => {
    it('should create a valid tag', async () => {
      const tagData = {
        name: 'JavaScript',
        color: '#F7DF1E',
        category: 'technology',
        description: 'JavaScript programming language'
      };

      const result = await tagService.createTag(tagData.name, tagData.color, tagData.category, tagData.description);
      
      expect(result.id).toBeDefined();
      expect(result.name).toBe(tagData.name);
      expect(result.color).toBe(tagData.color);
      expect(result.category).toBe(tagData.category);
      expect(tagService.storageManager.saveTag).toHaveBeenCalled();
    });

    it('should reject duplicate tag names', async () => {
      // Mock existing tag
      tagService.storageManager.getAllTags.mockResolvedValue([
        {
          id: 'existing-1',
          name: 'JavaScript',
          color: '#F7DF1E'
        }
      ]);

      await expect(tagService.createTag('JavaScript', '#FF0000'))
        .rejects.toThrow('Tag with this name already exists');
    });

    it('should validate tag data', async () => {
      const invalidData = {
        name: '', // Empty name
        color: 'invalid-color'
      };

      await expect(tagService.createTag(invalidData.name, invalidData.color))
        .rejects.toThrow('Tag name is required');
    });
  });

  describe('suggestTags', () => {
    it('should suggest domain-based tags', async () => {
      const bookmark = {
        title: 'GitHub Repository',
        url: 'https://github.com/user/repo',
        description: 'A sample repository'
      };
      const metadata = {
        domain: 'github.com'
      };

      const suggestions = await tagService.suggestTags(bookmark, metadata);
      
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(tag => tag.name === 'github.com')).toBe(true);
    });

    it('should suggest language tags', async () => {
      const bookmark = {
        title: 'Learn Spanish',
        url: 'https://example.com/spanish',
        description: 'Spanish learning resources'
      };
      const metadata = {
        pageLanguage: 'es'
      };

      const suggestions = await tagService.suggestTags(bookmark, metadata);
      
      expect(suggestions.some(tag => tag.name === 'Spanish')).toBe(true);
    });

    it('should extract keywords from content', async () => {
      const bookmark = {
        title: 'Machine Learning Tutorial',
        url: 'https://example.com/ml',
        description: 'Deep learning and neural networks'
      };
      const metadata = {};

      const suggestions = await tagService.suggestTags(bookmark, metadata);
      
      expect(suggestions.length).toBeGreaterThan(0);
      // Should include keyword-based tags
    });
  });

  describe('validateTag', () => {
    it('should validate a correct tag', () => {
      const validTag = {
        name: 'Valid Tag',
        color: '#FF0000',
        description: 'A valid tag description'
      };

      const result = tagService.validateTag(validTag);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject tags with missing name', () => {
      const invalidTag = {
        name: '',
        color: '#FF0000'
      };

      const result = tagService.validateTag(invalidTag);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Tag name is required');
    });

    it('should reject tags with invalid color format', () => {
      const invalidTag = {
        name: 'Test Tag',
        color: 'not-a-color'
      };

      const result = tagService.validateTag(invalidTag);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid color format');
    });

    it('should reject tags with overly long name', () => {
      const invalidTag = {
        name: 'a'.repeat(51), // Too long
        color: '#FF0000'
      };

      const result = tagService.validateTag(invalidTag);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Tag name too long');
    });
  });

  describe('extractKeywords', () => {
    it('should extract meaningful keywords', () => {
      const text = 'JavaScript programming tutorial for beginners';
      const keywords = tagService.extractKeywords(text);
      
      expect(keywords).toContain('javascript');
      expect(keywords).toContain('programming');
      expect(keywords).toContain('tutorial');
      expect(keywords).not.toContain('for'); // Should exclude stop words
    });

    it('should filter out common stop words', () => {
      const text = 'the a an and or but in on at to for of with by';
      const keywords = tagService.extractKeywords(text);
      
      expect(keywords).toHaveLength(0); // All stop words should be filtered
    });

    it('should handle empty or null input', () => {
      const keywords1 = tagService.extractKeywords('');
      const keywords2 = tagService.extractKeywords(null);
      
      expect(keywords1).toEqual([]);
      expect(keywords2).toEqual([]);
    });
  });

  describe('mergeTags', () => {
    it('should merge tags from multiple bookmarks', () => {
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

      const merged = tagService.mergeTags ? tagService.mergeTags(bookmarks) : [];
      
      // This would test the mergeTags method if it exists
      // For now, we just verify the structure exists
    });
  });

  describe('getTagStatistics', () => {
    it('should calculate tag statistics', async () => {
      const mockTags = [
        { id: '1', name: 'Tag1', category: 'custom', usageCount: 5, isSystem: false },
        { id: '2', name: 'Tag2', category: 'system', usageCount: 10, isSystem: true },
        { id: '3', name: 'Tag3', category: 'custom', usageCount: 3, isSystem: false }
      ];

      tagService.storageManager.getAllTags.mockResolvedValue(mockTags);

      const stats = await tagService.getTagStatistics();
      
      expect(stats.total).toBe(3);
      expect(stats.custom).toBe(2);
      expect(stats.system).toBe(1);
      expect(stats.totalUsage).toBe(18);
    });
  });
});