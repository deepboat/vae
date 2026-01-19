// tests/unit/categorizer.test.js
import { Categorizer } from '../js/services/categorizer.js';

describe('Categorizer', () => {
  let categorizer;

  beforeEach(() => {
    categorizer = new Categorizer();
    // Mock the storage manager
    categorizer.storageManager = {
      init: jest.fn().mockResolvedValue(undefined),
      saveCategory: jest.fn(),
      getCategory: jest.fn(),
      getAllCategories: jest.fn().mockResolvedValue([]),
      deleteCategory: jest.fn(),
      getAllBookmarks: jest.fn().mockResolvedValue([])
    };
  });

  describe('categorize', () => {
    it('should categorize bookmark based on domain rules', async () => {
      const categories = [
        {
          id: 'development',
          name: 'Development',
          color: '#F59E0B',
          rules: [
            { type: 'domain', pattern: 'github', weight: 3, isActive: true },
            { type: 'keyword', pattern: 'programming', weight: 2, isActive: true }
          ]
        }
      ];

      categorizer.storageManager.getAllCategories.mockResolvedValue(categories);

      const bookmark = {
        title: 'GitHub Repository',
        url: 'https://github.com/user/repo'
      };
      const metadata = { domain: 'github.com' };

      const result = await categorizer.categorize(bookmark, metadata);
      
      expect(result).toBeDefined();
      expect(result.name).toBe('Development');
    });

    it('should categorize bookmark based on keywords', async () => {
      const categories = [
        {
          id: 'language',
          name: 'Language',
          color: '#10B981',
          rules: [
            { type: 'keyword', pattern: 'spanish,tutorial,learn', weight: 2, isActive: true }
          ]
        }
      ];

      categorizer.storageManager.getAllCategories.mockResolvedValue(categories);

      const bookmark = {
        title: 'Spanish Tutorial',
        description: 'Learn Spanish language'
      };
      const metadata = {};

      const result = await categorizer.categorize(bookmark, metadata);
      
      expect(result).toBeDefined();
      expect(result.name).toBe('Language');
    });

    it('should return default category when no rules match', async () => {
      const categories = [
        {
          id: 'navigation',
          name: 'Navigation',
          color: '#3B82F6',
          rules: []
        },
        {
          id: 'development',
          name: 'Development',
          color: '#F59E0B',
          rules: []
        }
      ];

      categorizer.storageManager.getAllCategories.mockResolvedValue(categories);

      const bookmark = {
        title: 'Random Website',
        url: 'https://random.com'
      };
      const metadata = {};

      const result = await categorizer.categorize(bookmark, metadata);
      
      // Should return the first category (Navigation)
      expect(result).toBeDefined();
      expect(result.name).toBe('Navigation');
    });
  });

  describe('calculateCategoryScore', () => {
    it('should calculate score based on domain matching', () => {
      const category = {
        id: 'development',
        name: 'Development',
        rules: [
          { type: 'domain', pattern: 'github', weight: 3, isActive: true },
          { type: 'domain', pattern: 'stackoverflow', weight: 2, isActive: true }
        ]
      };

      const bookmark = {
        title: 'GitHub Project',
        url: 'https://github.com/user/project'
      };
      const metadata = { domain: 'github.com' };

      const score = categorizer.calculateCategoryScore(bookmark, metadata, category);
      
      expect(score).toBeGreaterThan(0);
    });

    it('should calculate score based on keyword matching', () => {
      const category = {
        id: 'productivity',
        name: 'Productivity',
        rules: [
          { type: 'keyword', pattern: 'task,project,workflow', weight: 2, isActive: true }
        ]
      };

      const bookmark = {
        title: 'Project Management Tool',
        description: 'Manage your tasks and projects efficiently'
      };
      const metadata = {};

      const score = categorizer.calculateCategoryScore(bookmark, metadata, category);
      
      expect(score).toBeGreaterThan(0);
    });

    it('should not score inactive rules', () => {
      const category = {
        id: 'development',
        name: 'Development',
        rules: [
          { type: 'domain', pattern: 'github', weight: 3, isActive: false } // Inactive
        ]
      };

      const bookmark = {
        title: 'GitHub Project',
        url: 'https://github.com/user/project'
      };
      const metadata = { domain: 'github.com' };

      const score = categorizer.calculateCategoryScore(bookmark, metadata, category);
      
      expect(score).toBe(0);
    });
  });

  describe('createCategory', () => {
    it('should create a valid category', async () => {
      const categoryData = {
        name: 'Research',
        description: 'Academic and research resources',
        color: '#8B5CF6',
        icon: 'research',
        rules: []
      };

      const result = await categorizer.createCategory(
        categoryData.name,
        categoryData.description,
        categoryData.color,
        categoryData.icon
      );
      
      expect(result.id).toBeDefined();
      expect(result.name).toBe(categoryData.name);
      expect(result.description).toBe(categoryData.description);
      expect(result.color).toBe(categoryData.color);
      expect(categorizer.storageManager.saveCategory).toHaveBeenCalled();
    });

    it('should validate category data', async () => {
      const invalidData = {
        name: '', // Empty name
        color: 'invalid-color'
      };

      await expect(categorizer.createCategory(invalidData.name, '', invalidData.color))
        .rejects.toThrow('Category name is required');
    });
  });

  describe('validateCategory', () => {
    it('should validate a correct category', () => {
      const validCategory = {
        name: 'Development',
        description: 'Programming and development resources',
        color: '#F59E0B',
        rules: [
          { type: 'domain', pattern: 'github', weight: 3, isActive: true }
        ]
      };

      const result = categorizer.validateCategory(validCategory);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject categories with missing name', () => {
      const invalidCategory = {
        name: '',
        color: '#F59E0B'
      };

      const result = categorizer.validateCategory(invalidCategory);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Category name is required');
    });

    it('should reject categories with invalid color format', () => {
      const invalidCategory = {
        name: 'Test Category',
        color: 'not-a-color'
      };

      const result = categorizer.validateCategory(invalidCategory);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid color format');
    });

    it('should reject categories with invalid rule types', () => {
      const invalidCategory = {
        name: 'Test Category',
        color: '#F59E0B',
        rules: [
          { type: 'invalid-type', pattern: 'test', weight: 1, isActive: true }
        ]
      };

      const result = categorizer.validateCategory(invalidCategory);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid rule type');
    });

    it('should reject categories with invalid rule weight', () => {
      const invalidCategory = {
        name: 'Test Category',
        color: '#F59E0B',
        rules: [
          { type: 'domain', pattern: 'test', weight: 15, isActive: true } // Too high
        ]
      };

      const result = categorizer.validateCategory(invalidCategory);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Rule weight must be between 0 and 10');
    });
  });

  describe('scoreDomain', () => {
    it('should match domain patterns correctly', () => {
      expect(categorizer.scoreDomain('https://github.com/user', 'github.com', 'github')).toBe(1);
      expect(categorizer.scoreDomain('https://github.com/user', 'github.com', 'stackoverflow')).toBe(0);
    });

    it('should handle regex patterns', () => {
      expect(categorizer.scoreDomain('https://stackoverflow.com', 'stackoverflow.com', '(github|stackoverflow)')).toBe(1);
      expect(categorizer.scoreDomain('https://example.com', 'example.com', '(github|stackoverflow)')).toBe(0);
    });

    it('should handle null domain', () => {
      expect(categorizer.scoreDomain('https://example.com', null, 'github')).toBe(0);
    });
  });

  describe('scoreKeyword', () => {
    it('should score keyword matches', () => {
      const bookmark = {
        title: 'Learn JavaScript Programming',
        description: 'JavaScript tutorial for beginners'
      };

      const score = categorizer.scoreKeyword(bookmark, 'javascript,programming,tutorial');
      
      expect(score).toBeGreaterThan(0);
    });

    it('should cap score at maximum', () => {
      const bookmark = {
        title: 'javascript javascript javascript programming tutorial guide learn',
        description: 'javascript programming tutorial guide'
      };

      const score = categorizer.scoreKeyword(bookmark, 'javascript,programming,tutorial,guide,learn');
      
      expect(score).toBe(3); // Maximum cap
    });
  });

  describe('getDefaultCategoryRules', () => {
    it('should return default rules for categories', () => {
      const defaultRules = categorizer.getDefaultCategoryRules();
      
      expect(defaultRules).toHaveProperty('Navigation');
      expect(defaultRules).toHaveProperty('Development');
      expect(defaultRules).toHaveProperty('Productivity');
      expect(defaultRules).toHaveProperty('Language');
      expect(defaultRules).toHaveProperty('Automation');
    });

    it('should have correct rule types in default rules', () => {
      const defaultRules = categorizer.getDefaultCategoryRules();
      
      const navigationRules = defaultRules['Navigation'];
      const hasDomainRule = navigationRules.some(rule => rule.type === 'domain');
      const hasKeywordRule = navigationRules.some(rule => rule.type === 'keyword');
      
      expect(hasDomainRule).toBe(true);
      expect(hasKeywordRule).toBe(true);
    });
  });
});