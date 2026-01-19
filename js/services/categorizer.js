// js/services/categorizer.js
import { StorageManager } from '../database/storage.js';

class Categorizer {
  constructor() {
    this.storageManager = new StorageManager();
    this.categoryRules = new Map();
  }

  async init() {
    await this.storageManager.init();
    await this.loadCategoryRules();
  }

  // Auto-categorization
  async categorize(bookmark, metadata = {}) {
    try {
      const categories = await this.storageManager.getAllCategories();
      const scores = new Map();

      // Score each category based on rules
      for (const category of categories) {
        const score = await this.calculateCategoryScore(bookmark, metadata, category);
        if (score > 0) {
          scores.set(category.id, score);
        }
      }

      // Return category with highest score
      if (scores.size > 0) {
        const bestCategoryId = Array.from(scores.entries())
          .sort(([,a], [,b]) => b - a)[0][0];
        
        return categories.find(cat => cat.id === bestCategoryId);
      }

      // Return default category if no match
      return categories.find(cat => cat.name === 'Navigation') || categories[0];
      
    } catch (error) {
      console.error('Error categorizing bookmark:', error);
      return null;
    }
  }

  async calculateCategoryScore(bookmark, metadata, category) {
    let score = 0;

    // Apply category rules
    for (const rule of category.rules || []) {
      if (!rule.isActive) continue;

      let ruleScore = 0;
      const weight = rule.weight || 1;

      switch (rule.type) {
        case 'domain':
          ruleScore = this.scoreDomain(bookmark.url, metadata.domain, rule.pattern);
          break;
        case 'keyword':
          ruleScore = this.scoreKeyword(bookmark, rule.pattern);
          break;
        case 'content':
          ruleScore = this.scoreContent(bookmark, rule.pattern);
          break;
        case 'language':
          ruleScore = this.scoreLanguage(metadata.pageLanguage, rule.pattern);
          break;
      }

      score += ruleScore * weight;
    }

    // Default scoring based on domain patterns
    score += this.getDefaultDomainScore(bookmark.url, metadata.domain, category);

    return score;
  }

  scoreDomain(url, domain, pattern) {
    if (!domain) return 0;

    try {
      const regex = new RegExp(pattern, 'i');
      return regex.test(domain) ? 1 : 0;
    } catch (error) {
      // Simple string matching if regex is invalid
      return domain.toLowerCase().includes(pattern.toLowerCase()) ? 1 : 0;
    }
  }

  scoreKeyword(bookmark, pattern) {
    const text = `${bookmark.title} ${bookmark.description || ''}`.toLowerCase();
    const keywords = pattern.toLowerCase().split(',').map(k => k.trim());

    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        score += 1;
      }
    }

    return Math.min(score, 3); // Cap at 3
  }

  scoreContent(bookmark, pattern) {
    // This would analyze extracted content if available
    // For now, use title and description
    const content = `${bookmark.title} ${bookmark.description || ''}`.toLowerCase();
    const regex = new RegExp(pattern, 'i');
    return regex.test(content) ? 1 : 0;
  }

  scoreLanguage(language, pattern) {
    if (!language) return 0;
    return language.toLowerCase() === pattern.toLowerCase() ? 1 : 0;
  }

  getDefaultDomainScore(url, domain, category) {
    if (!domain) return 0;

    const defaultRules = this.getDefaultCategoryRules();
    const categoryDefaultRules = defaultRules[category.name] || [];

    let score = 0;
    for (const rule of categoryDefaultRules) {
      if (rule.type === 'domain' && this.scoreDomain(url, domain, rule.pattern) > 0) {
        score += rule.weight;
      }
    }

    return score;
  }

  getDefaultCategoryRules() {
    return {
      'Navigation': [
        { type: 'domain', pattern: '(google|bing|yahoo)', weight: 2 },
        { type: 'domain', pattern: '(wikipedia|wiktionary)', weight: 3 },
        { type: 'keyword', pattern: 'search,find,lookup', weight: 1 }
      ],
      'Development': [
        { type: 'domain', pattern: '(github|gitlab|bitbucket)', weight: 3 },
        { type: 'domain', pattern: '(stackoverflow|stackexchange)', weight: 3 },
        { type: 'domain', pattern: '(npm|pip|maven|gradle)', weight: 2 },
        { type: 'keyword', pattern: 'code,programming,development,api,docs', weight: 2 }
      ],
      'Productivity': [
        { type: 'domain', pattern: '(trello|asana|monday)', weight: 3 },
        { type: 'domain', pattern: '(slack|discord|teams)', weight: 2 },
        { type: 'keyword', pattern: 'productivity,task,project,team', weight: 1 }
      ],
      'Language': [
        { type: 'domain', pattern: '(duolingo|babbel|rosetta)', weight: 3 },
        { type: 'keyword', pattern: 'language,learn,translate', weight: 2 },
        { type: 'language', weight: 3 }
      ],
      'Automation': [
        { type: 'domain', pattern: '(zapier|ifttt|microsoft.powerautomate)', weight: 3 },
        { type: 'keyword', pattern: 'automation,workflow,integration', weight: 2 }
      ]
    };
  }

  // Category management
  async createCategory(name, description, color, icon, parentId = null, rules = []) {
    const category = {
      id: this.generateId(),
      name: name.trim(),
      description: description.trim(),
      color,
      icon,
      rules,
      parentId,
      order: await this.getNextCategoryOrder(),
      isSystem: false,
      created: new Date()
    };

    const validation = this.validateCategory(category);
    if (!validation.isValid) {
      throw new Error(`Invalid category: ${validation.errors.join(', ')}`);
    }

    await this.storageManager.saveCategory(category);
    return category;
  }

  async updateCategory(id, updates) {
    const existingCategory = await this.storageManager.getCategory(id);
    if (!existingCategory) {
      throw new Error('Category not found');
    }

    const updatedCategory = {
      ...existingCategory,
      ...updates,
      id: id,
      modified: new Date()
    };

    const validation = this.validateCategory(updatedCategory);
    if (!validation.isValid) {
      throw new Error(`Invalid category: ${validation.errors.join(', ')}`);
    }

    await this.storageManager.saveCategory(updatedCategory);
    return updatedCategory;
  }

  async deleteCategory(id) {
    const category = await this.storageManager.getCategory(id);
    if (!category) {
      throw new Error('Category not found');
    }

    // Check if category is in use
    const bookmarks = await this.storageManager.getAllBookmarks();
    const inUse = bookmarks.some(bookmark => bookmark.category?.id === id);
    
    if (inUse) {
      throw new Error('Cannot delete category that is in use');
    }

    // Check if category has children
    const allCategories = await this.storageManager.getAllCategories();
    const hasChildren = allCategories.some(cat => cat.parentId === id);
    
    if (hasChildren) {
      throw new Error('Cannot delete category that has subcategories');
    }

    return await this.storageManager.deleteCategory(id);
  }

  async getCategory(id) {
    return await this.storageManager.getCategory(id);
  }

  async getAllCategories() {
    const categories = await this.storageManager.getAllCategories();
    
    // Sort by order, then by name
    return categories.sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.name.localeCompare(b.name);
    });
  }

  async getCategoryTree() {
    const categories = await this.getAllCategories();
    const tree = [];
    const categoryMap = new Map();

    // Create map of all categories
    categories.forEach(category => {
      categoryMap.set(category.id, { ...category, children: [] });
    });

    // Build tree structure
    categories.forEach(category => {
      if (category.parentId) {
        const parent = categoryMap.get(category.parentId);
        if (parent) {
          parent.children.push(categoryMap.get(category.id));
        }
      } else {
        tree.push(categoryMap.get(category.id));
      }
    });

    return tree;
  }

  async getNextCategoryOrder() {
    const categories = await this.getAllCategories();
    return Math.max(...categories.map(cat => cat.order || 0), 0) + 1;
  }

  // Category rule management
  async addCategoryRule(categoryId, rule) {
    const category = await this.storageManager.getCategory(categoryId);
    if (!category) {
      throw new Error('Category not found');
    }

    const newRule = {
      id: this.generateId(),
      ...rule,
      isActive: true
    };

    const updatedCategory = {
      ...category,
      rules: [...(category.rules || []), newRule]
    };

    await this.storageManager.saveCategory(updatedCategory);
    return newRule;
  }

  async updateCategoryRule(categoryId, ruleId, updates) {
    const category = await this.storageManager.getCategory(categoryId);
    if (!category) {
      throw new Error('Category not found');
    }

    const rules = category.rules || [];
    const ruleIndex = rules.findIndex(rule => rule.id === ruleId);
    
    if (ruleIndex === -1) {
      throw new Error('Rule not found');
    }

    rules[ruleIndex] = { ...rules[ruleIndex], ...updates };
    
    const updatedCategory = {
      ...category,
      rules
    };

    await this.storageManager.saveCategory(updatedCategory);
    return rules[ruleIndex];
  }

  async deleteCategoryRule(categoryId, ruleId) {
    const category = await this.storageManager.getCategory(categoryId);
    if (!category) {
      throw new Error('Category not found');
    }

    const rules = category.rules || [];
    const filteredRules = rules.filter(rule => rule.id !== ruleId);
    
    const updatedCategory = {
      ...category,
      rules: filteredRules
    };

    await this.storageManager.saveCategory(updatedCategory);
  }

  // Validation
  validateCategory(category) {
    const errors = [];

    if (!category.name || category.name.trim().length === 0) {
      errors.push('Category name is required');
    }

    if (category.name && category.name.length > 50) {
      errors.push('Category name too long (max 50 characters)');
    }

    if (category.description && category.description.length > 200) {
      errors.push('Category description too long (max 200 characters)');
    }

    // Validate color format
    if (category.color && !/^#[0-9A-F]{6}$/i.test(category.color)) {
      errors.push('Invalid color format (must be hex color like #FFFFFF)');
    }

    // Validate rules
    if (category.rules) {
      for (const rule of category.rules) {
        if (!rule.type || !['domain', 'keyword', 'content', 'language'].includes(rule.type)) {
          errors.push('Invalid rule type');
        }
        if (!rule.pattern) {
          errors.push('Rule pattern is required');
        }
        if (rule.weight && (rule.weight < 0 || rule.weight > 10)) {
          errors.push('Rule weight must be between 0 and 10');
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Utility methods
  generateId() {
    return 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  async loadCategoryRules() {
    // Load and cache category rules for performance
    const categories = await this.storageManager.getAllCategories();
    
    this.categoryRules.clear();
    for (const category of categories) {
      this.categoryRules.set(category.id, category.rules || []);
    }
  }

  // Bulk operations
  async reCategorizeAllBookmarks() {
    const bookmarks = await this.storageManager.getAllBookmarks();
    let updated = 0;

    for (const bookmark of bookmarks) {
      try {
        const newCategory = await this.categorize(bookmark, bookmark.meta);
        if (newCategory && bookmark.category?.id !== newCategory.id) {
          await this.storageManager.saveBookmark({
            ...bookmark,
            category: newCategory
          });
          updated++;
        }
      } catch (error) {
        console.error('Error re-categorizing bookmark:', bookmark.id, error);
      }
    }

    return { updated, total: bookmarks.length };
  }

  async getCategoryStatistics() {
    const categories = await this.getAllCategories();
    const bookmarks = await this.storageManager.getAllBookmarks();
    
    const stats = categories.map(category => {
      const count = bookmarks.filter(bookmark => 
        bookmark.category?.id === category.id
      ).length;

      return {
        ...category,
        bookmarkCount: count
      };
    });

    return stats.sort((a, b) => b.bookmarkCount - a.bookmarkCount);
  }
}

export { Categorizer };