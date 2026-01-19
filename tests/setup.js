// tests/setup.js
// Jest setup file for Chrome extension testing

// Mock Chrome APIs
global.chrome = {
  bookmarks: {
    onCreated: { addListener: jest.fn() },
    onRemoved: { addListener: jest.fn() },
    onChanged: { addListener: jest.fn() },
    onMoved: { addListener: jest.fn() },
    getTree: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'test-id' }),
    get: jest.fn().mockResolvedValue([]),
    remove: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue({})
  },
  storage: {
    local: {
      get: jest.fn().mockImplementation((keys, callback) => {
        const result = {};
        if (Array.isArray(keys)) {
          keys.forEach(key => {
            result[key] = global.mockStorage[key] || null;
          });
        } else if (typeof keys === 'object') {
          Object.keys(keys).forEach(key => {
            result[key] = global.mockStorage[key] !== undefined ? global.mockStorage[key] : keys[key];
          });
        }
        callback(result);
      }),
      set: jest.fn().mockImplementation((items, callback) => {
        Object.assign(global.mockStorage, items);
        if (callback) callback();
      }),
      remove: jest.fn().mockImplementation((keys, callback) => {
        if (Array.isArray(keys)) {
          keys.forEach(key => delete global.mockStorage[key]);
        } else {
          delete global.mockStorage[keys];
        }
        if (callback) callback();
      }),
      clear: jest.fn().mockImplementation((callback) => {
        global.mockStorage = {};
        if (callback) callback();
      })
    }
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 1 }),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({})
  },
  runtime: {
    onInstalled: { addListener: jest.fn() },
    onMessage: { addListener: jest.fn() },
    sendMessage: jest.fn().mockResolvedValue({ success: true })
  },
  alarms: {
    create: jest.fn(),
    onAlarm: { addListener: jest.fn() }
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn()
  }
};

// Mock IndexedDB
global.indexedDB = {
  open: jest.fn().mockReturnValue({
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: {
      objectStoreNames: { contains: jest.fn().mockReturnValue(false) },
      createObjectStore: jest.fn().mockReturnValue({
        createIndex: jest.fn(),
        put: jest.fn(),
        get: jest.fn(),
        getAll: jest.fn().mockReturnValue([]),
        delete: jest.fn(),
        clear: jest.fn()
      }),
      transaction: jest.fn().mockReturnValue({
        objectStore: jest.fn().mockReturnValue({
          createIndex: jest.fn(),
          put: jest.fn(),
          get: jest.fn(),
          getAll: jest.fn().mockReturnValue([]),
          delete: jest.fn(),
          clear: jest.fn()
        }),
        oncomplete: null,
        onerror: null
      })
    }
  })
};

// Mock global storage for Chrome storage API
global.mockStorage = {};

// Mock fetch for URL validation
global.fetch = jest.fn().mockImplementation(() => {
  return Promise.resolve({
    ok: true,
    status: 200,
    headers: new Headers(),
    text: () => Promise.resolve('mock response'),
    json: () => Promise.resolve({})
  });
});

// Mock URL constructor
global.URL = class {
  constructor(url) {
    this.href = url;
    this.protocol = url.startsWith('https') ? 'https:' : 'http:';
    this.hostname = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    this.pathname = url.replace(/^https?:\/\/[^/]+/, '') || '/';
    this.search = url.includes('?') ? url.split('?')[1] : '';
    this.hash = url.includes('#') ? url.split('#')[1] : '';
  }
};

// Mock performance.now
global.performance = {
  now: jest.fn().mockReturnValue(0)
};

// Suppress console warnings in tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn()
};