// ========================================
// データモデル
// ========================================

const UNTAGGED_FILTER = '__untagged__';

// ストレージインターフェース(抽象クラス)
class StorageInterface {
    async getAll() { throw new Error('Not implemented'); }
    async add(item) { throw new Error('Not implemented'); }
    async update(id, updatedData) { throw new Error('Not implemented'); }
    async delete(id) { throw new Error('Not implemented'); }
    async findById(id) { throw new Error('Not implemented'); }
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

// LocalStorage版StorageManager(レガシー・フォールバック用)
class StorageManager extends StorageInterface {
    constructor(key) {
        super();
        this.key = key;
    }

    async getAll() {
        const data = localStorage.getItem(this.key);
        return data ? JSON.parse(data) : [];
    }

    save(items) {
        localStorage.setItem(this.key, JSON.stringify(items));
    }

    async add(item) {
        const items = await this.getAll();
        item.id = this.generateId();
        item.createdAt = new Date().toISOString();
        item.updatedAt = new Date().toISOString();
        items.push(item);
        this.save(items);
        return item;
    }

    async update(id, updatedData) {
        const items = await this.getAll();
        const index = items.findIndex(item => item.id === id);
        if (index !== -1) {
            items[index] = {
                ...items[index],
                ...updatedData,
                updatedAt: new Date().toISOString()
            };
            this.save(items);
            return items[index];
        }
        return null;
    }

    async delete(id) {
        const items = await this.getAll();
        const filtered = items.filter(item => item.id !== id);
        this.save(filtered);
        return filtered.length < items.length;
    }

    async findById(id) {
        const items = await this.getAll();
        return items.find(item => item.id === id);
    }
}

// IndexedDB版StorageManager
class IndexedDBManager extends StorageInterface {
    constructor(dbName, storeName, version = 3) {
        super();
        this.dbName = dbName;
        this.storeName = storeName;
        this.version = version;
        this.dbPromise = null;
    }

    async init() {
        if (this.dbPromise) return this.dbPromise;

        this.dbPromise = idb.openDB(this.dbName, this.version, {
            upgrade(db, oldVersion, newVersion, transaction) {
                // prompts Object Store
                if (!db.objectStoreNames.contains('prompts')) {
                    const promptStore = db.createObjectStore('prompts', { keyPath: 'id' });
                    promptStore.createIndex('title', 'title', { unique: false });
                    promptStore.createIndex('createdAt', 'createdAt', { unique: false });
                    promptStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
                    promptStore.createIndex('folder', 'folder', { unique: false });
                }

                // contexts Object Store
                if (!db.objectStoreNames.contains('contexts')) {
                    const contextStore = db.createObjectStore('contexts', { keyPath: 'id' });
                    contextStore.createIndex('title', 'title', { unique: false });
                    contextStore.createIndex('createdAt', 'createdAt', { unique: false });
                    contextStore.createIndex('category', 'category', { unique: false });
                    contextStore.createIndex('folder', 'folder', { unique: false });
                }

                // folders Object Store
                if (!db.objectStoreNames.contains('folders')) {
                    const folderStore = db.createObjectStore('folders', { keyPath: 'id' });
                    folderStore.createIndex('name', 'name', { unique: false });
                    folderStore.createIndex('type', 'type', { unique: false });
                }

                // Phase 1: PM特化基盤 - projects Object Store
                if (!db.objectStoreNames.contains('projects')) {
                    const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
                    projectStore.createIndex('name', 'name', { unique: false });
                    projectStore.createIndex('currentPhase', 'currentPhase', { unique: false });
                    projectStore.createIndex('startDate', 'startDate', { unique: false });
                }

                // Phase 2: テンプレートライブラリ - templates Object Store
                if (!db.objectStoreNames.contains('templates')) {
                    const templateStore = db.createObjectStore('templates', { keyPath: 'id' });
                    templateStore.createIndex('name', 'name', { unique: false });
                    templateStore.createIndex('category', 'category', { unique: false });
                    templateStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
                    templateStore.createIndex('usageCount', 'usageCount', { unique: false });
                    templateStore.createIndex('author', 'author', { unique: false });
                }

                // Phase 1: マイグレーション - 既存プロンプトにpmConfigフィールド追加
                if (oldVersion < 2 && transaction.objectStoreNames.contains('prompts')) {
                    const promptStore = transaction.objectStore('prompts');
                    promptStore.getAll().then(prompts => {
                        prompts.forEach(prompt => {
                            if (!prompt.pmConfig) {
                                prompt.pmConfig = {
                                    projectId: null,
                                    projectName: "",
                                    phase: "未分類",
                                    stakeholders: [],
                                    relatedDocs: [],
                                    priority: "中",
                                    importance: 3,
                                    status: "下書き",
                                    dueDate: null,
                                    stats: {
                                        usageCount: 0,
                                        lastUsed: null,
                                        effectiveness: 0
                                    }
                                };
                                promptStore.put(prompt);
                            }
                        });
                    }).catch(err => console.error('Prompt migration failed:', err));
                }

                // Phase 1: マイグレーション - 既存コンテキストにpmConfigフィールド追加
                if (oldVersion < 2 && transaction.objectStoreNames.contains('contexts')) {
                    const contextStore = transaction.objectStore('contexts');
                    contextStore.getAll().then(contexts => {
                        contexts.forEach(context => {
                            if (!context.pmConfig) {
                                context.pmConfig = {
                                    projectId: null,
                                    projectName: "",
                                    contextType: "背景情報",
                                    visibility: "個人",
                                    version: "1.0",
                                    previousVersionId: null,
                                    relatedPrompts: []
                                };
                                contextStore.put(context);
                            }
                        });
                    }).catch(err => console.error('Context migration failed:', err));
                }
            }
        });

        return this.dbPromise;
    }

    async getAll() {
        const db = await this.dbPromise;
        return db.getAll(this.storeName);
    }

    async add(item) {
        item.id = this.generateId();
        item.createdAt = new Date().toISOString();
        item.updatedAt = new Date().toISOString();

        const db = await this.dbPromise;
        await db.add(this.storeName, item);
        return item;
    }

    async update(id, updatedData) {
        const db = await this.dbPromise;
        const item = await db.get(this.storeName, id);
        if (!item) return null;

        const newItem = {
            ...item,
            ...updatedData,
            updatedAt: new Date().toISOString()
        };
        await db.put(this.storeName, newItem);
        return newItem;
    }

    async delete(id) {
        const db = await this.dbPromise;
        await db.delete(this.storeName, id);
        return true;
    }

    async findById(id) {
        const db = await this.dbPromise;
        return db.get(this.storeName, id);
    }

    // 高度な検索メソッド(オプション)
    async findByTag(tag) {
        const db = await this.dbPromise;
        const index = db.transaction(this.storeName).objectStore(this.storeName).index('tags');
        return index.getAll(tag);
    }

    async findByDateRange(startDate, endDate) {
        const db = await this.dbPromise;
        const index = db.transaction(this.storeName).objectStore(this.storeName).index('createdAt');
        const range = IDBKeyRange.bound(startDate, endDate);
        return index.getAll(range);
    }
}

// ========================================
// ストレージアダプター
// ========================================

class StorageAdapter {
    static async createManager(storeName, legacyKey) {
        // IndexedDB対応チェック
        if ('indexedDB' in window && typeof idb !== 'undefined') {
            try {
                const manager = new IndexedDBManager('cognishelf-db', storeName, 3);
                await manager.init();

                // LocalStorageからマイグレーション
                await this.migrateFromLocalStorage(manager, legacyKey);

                return manager;
            } catch (error) {
                console.error(`IndexedDB initialization failed for ${storeName}:`, error);
                console.warn(`Falling back to LocalStorage for ${storeName}`);
                return new StorageManager(legacyKey);
            }
        } else {
            console.warn('IndexedDB not supported. Using LocalStorage.');
            return new StorageManager(legacyKey);
        }
    }

    static async migrateFromLocalStorage(idbManager, legacyKey) {
        const oldData = localStorage.getItem(legacyKey);
        if (!oldData) return;

        console.log(`Migrating data from LocalStorage (${legacyKey}) to IndexedDB...`);

        try {
            const items = JSON.parse(oldData);
            const db = await idbManager.dbPromise;

            // トランザクションでまとめて移行
            const tx = db.transaction(idbManager.storeName, 'readwrite');
            const store = tx.objectStore(idbManager.storeName);

            for (const item of items) {
                // 既存データが存在しない場合のみ追加
                const existing = await store.get(item.id);
                if (!existing) {
                    await store.add(item);
                }
            }

            await tx.done;

            // 移行完了後にLocalStorageクリア
            localStorage.removeItem(legacyKey);
            console.log(`Migration completed for ${legacyKey}`);
        } catch (error) {
            console.error(`Migration failed for ${legacyKey}:`, error);
            // エラーが発生してもLocalStorageは残しておく
        }
    }
}

// ========================================
// アプリケーション状態
// ========================================

class CognishelfApp {
    constructor() {
        // ストレージマネージャーは init() で非同期初期化する
        this.promptsManager = null;
        this.contextsManager = null;
        this.foldersManager = null;
        this.templatesManager = null; // Phase 2: テンプレート管理
        this.currentTab = 'prompts';
        this.editingItem = null;
        this.editingType = null;
        this.currentPromptSort = 'date-desc';
        this.currentContextSort = 'date-desc';
        this.currentPromptFolder = null; // null = 全表示
        this.currentContextFolder = null;
        this.previewItem = null;
        this.previewType = null;
        this.promptSearchQuery = '';
        this.contextSearchQuery = '';
        this.currentPromptTag = null;
        this.currentContextTag = null;
        this.currentPromptGrouping = 'none';
        this.currentContextGrouping = 'none';
    }

    async init() {
        try {
            // ストレージマネージャーの初期化
            this.promptsManager = await StorageAdapter.createManager('prompts', 'cognishelf-prompts');
            this.contextsManager = await StorageAdapter.createManager('contexts', 'cognishelf-contexts');
            this.foldersManager = await StorageAdapter.createManager('folders', 'cognishelf-folders');
            this.templatesManager = await StorageAdapter.createManager('templates', 'cognishelf-templates'); // Phase 2

            this.setupEventListeners();
            const promptGroupingSelect = document.getElementById('prompt-grouping');
            if (promptGroupingSelect) {
                promptGroupingSelect.value = this.currentPromptGrouping;
            }
            const contextGroupingSelect = document.getElementById('context-grouping');
            if (contextGroupingSelect) {
                contextGroupingSelect.value = this.currentContextGrouping;
            }
            await this.initializeSampleData();
            await this.renderFolders('prompt');
            await this.renderFolders('context');
            await this.renderTagFilters('prompt');
            await this.renderTagFilters('context');
            await this.renderPrompts();
            await this.renderContexts();

            console.log('Cognishelf initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Cognishelf:', error);
            this.showToast('アプリケーションの初期化に失敗しました', 'error');
        }
    }

    async loadJSON(path) {
        try {
            const response = await fetch(path);
            if (!response.ok) {
                console.warn(`Failed to load ${path}: ${response.status}`);
                return [];
            }
            return await response.json();
        } catch (error) {
            console.error(`Error loading ${path}:`, error);
            return [];
        }
    }

    async initializeSampleData() {
        // サンプルデータを追加(初回のみ)
        const prompts = await this.promptsManager.getAll();
        if (prompts.length === 0) {
            const promptSamples = await this.loadJSON('data/sample-prompts.json');
            for (const sample of promptSamples) {
                await this.promptsManager.add(sample);
            }
        }

        const contexts = await this.contextsManager.getAll();
        if (contexts.length === 0) {
            const contextSamples = await this.loadJSON('data/sample-contexts.json');
            for (const sample of contextSamples) {
                const contextData = { ...sample };
                if (contextData.category) {
                    contextData.tags = [contextData.category];
                }
                await this.contextsManager.add(contextData);
            }
        }
    }

    setupEventListeners() {
        // タブ切り替え
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // 新規追加ボタン
        document.getElementById('add-prompt-btn').addEventListener('click', () => {
            this.openPromptModal();
        });

        document.getElementById('add-context-btn').addEventListener('click', () => {
            this.openContextModal();
        });

        // モーダルのクローズボタン
        document.querySelectorAll('.close-btn, .cancel-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeAllModals();
            });
        });

        // モーダル外クリックで閉じる
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeAllModals();
                }
            });
        });

        // フォーム送信
        document.getElementById('prompt-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.savePrompt();
        });

        document.getElementById('context-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveContext();
        });

        // PM設定セクションの表示/非表示
        const togglePmConfigBtn = document.getElementById('toggle-pm-config-btn');
        if (togglePmConfigBtn) {
            togglePmConfigBtn.addEventListener('click', () => {
                const container = document.getElementById('pm-config-container');
                if (container.style.display === 'none') {
                    container.style.display = 'block';
                } else {
                    container.style.display = 'none';
                }
            });
        }

        const toggleContextPmConfigBtn = document.getElementById('toggle-context-pm-config-btn');
        if (toggleContextPmConfigBtn) {
            toggleContextPmConfigBtn.addEventListener('click', () => {
                const container = document.getElementById('context-pm-config-container');
                if (container.style.display === 'none') {
                    container.style.display = 'block';
                } else {
                    container.style.display = 'none';
                }
            });
        }

        // 検索機能
        document.getElementById('prompt-search').addEventListener('input', (e) => {
            this.searchPrompts(e.target.value);
        });

        document.getElementById('context-search').addEventListener('input', (e) => {
            this.searchContexts(e.target.value);
        });

        // ソート機能
        document.getElementById('prompt-sort').addEventListener('change', (e) => {
            this.currentPromptSort = e.target.value;
            this.renderPrompts();
        });

        document.getElementById('context-sort').addEventListener('change', (e) => {
            this.currentContextSort = e.target.value;
            this.renderContexts();
        });

        const promptGroupingSelect = document.getElementById('prompt-grouping');
        if (promptGroupingSelect) {
            promptGroupingSelect.addEventListener('change', (e) => {
                this.currentPromptGrouping = e.target.value;
                this.renderPrompts();
            });
        }

        const contextGroupingSelect = document.getElementById('context-grouping');
        if (contextGroupingSelect) {
            contextGroupingSelect.addEventListener('change', (e) => {
                this.currentContextGrouping = e.target.value;
                this.renderContexts();
            });
        }

        document.querySelectorAll('.json-export-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.exportJson();
            });
        });

        const jsonImportInput = document.getElementById('json-import-input');
        if (jsonImportInput) {
            jsonImportInput.addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) {
                    return;
                }

                await this.importJson(file);
                e.target.value = '';
            });
        }

        // プレビューモーダルのボタン
        document.getElementById('preview-copy-btn').addEventListener('click', () => {
            if (this.previewItem) {
                this.copyToClipboard(this.previewItem, this.previewType);
            }
        });

        document.getElementById('preview-edit-btn').addEventListener('click', () => {
            if (this.previewItem) {
                const itemId = this.previewItem;
                const itemType = this.previewType;
                this.closeAllModals();
                if (itemType === 'prompt') {
                    this.openPromptModal(itemId);
                } else {
                    this.openContextModal(itemId);
                }
            }
        });

        document.getElementById('preview-delete-btn').addEventListener('click', () => {
            if (this.previewItem) {
                const itemId = this.previewItem;
                const itemType = this.previewType;
                this.closeAllModals();
                this.deleteItem(itemId, itemType);
            }
        });

        // Phase 2: テンプレート検索
        const templateSearch = document.getElementById('template-search');
        if (templateSearch) {
            templateSearch.addEventListener('input', async (e) => {
                const query = e.target.value;
                const templates = await window.templateManager.searchTemplates(query);
                this.renderTemplatesList(templates);
            });
        }

        // Phase 2: テンプレートフィルター
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                // アクティブ状態切り替え
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                const category = e.target.dataset.category;
                const templates = await window.templateManager.getTemplatesByCategory(category);
                this.renderTemplatesList(templates);
            });
        });

        // キーボードショートカット
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }

    switchTab(tabName) {
        this.currentTab = tabName;

        // タブボタンの状態更新
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // セクションの表示切り替え
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.toggle('active', section.id === `${tabName}-section`);
        });
    }

    async exportJson() {
        try {
            const [prompts, contexts, folders] = await Promise.all([
                this.promptsManager.getAll(),
                this.contextsManager.getAll(),
                this.foldersManager.getAll()
            ]);

            const exportPayload = {
                version: 1,
                exportedAt: new Date().toISOString(),
                prompts,
                contexts,
                folders
            };

            const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            link.href = url;
            link.download = `cognishelf-backup-${timestamp}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            this.showToast('JSONをエクスポートしました', 'success');
        } catch (error) {
            console.error('Failed to export JSON:', error);
            this.showToast('JSONエクスポートに失敗しました', 'error');
        }
    }

    async importJson(file) {
        if (!file) return;

        try {
            const fileContent = await file.text();
            const data = JSON.parse(fileContent);

            if (!data || typeof data !== 'object') {
                throw new Error('Invalid JSON structure');
            }

            const prompts = Array.isArray(data.prompts) ? data.prompts : [];
            const contexts = Array.isArray(data.contexts) ? data.contexts : [];
            const folders = Array.isArray(data.folders) ? data.folders : [];

            const folderIdMap = {};

            for (const folder of folders) {
                if (!folder || typeof folder !== 'object') continue;

                const name = typeof folder.name === 'string' ? folder.name.trim() : '';
                const type = folder.type;

                if (!name || (type !== 'prompt' && type !== 'context')) {
                    continue;
                }

                const newFolder = await this.getOrCreateFolder(name, type);
                if (folder.id) {
                    folderIdMap[folder.id] = newFolder.id;
                }
            }

            let importedPromptCount = 0;

            for (const prompt of prompts) {
                if (!prompt || typeof prompt !== 'object') continue;

                const title = typeof prompt.title === 'string' ? prompt.title.trim() : '';
                const content = typeof prompt.content === 'string' ? prompt.content : '';

                if (!title || !content.trim()) {
                    continue;
                }

                const promptData = {
                    title,
                    content
                };

                if (Array.isArray(prompt.tags)) {
                    const tags = prompt.tags
                        .map(tag => typeof tag === 'string' ? tag.trim() : '')
                        .filter(tag => tag);
                    if (tags.length > 0) {
                        promptData.tags = tags;
                    }
                } else if (typeof prompt.tags === 'string' && prompt.tags.trim()) {
                    const tags = prompt.tags
                        .split(',')
                        .map(tag => tag.trim())
                        .filter(tag => tag);
                    if (tags.length > 0) {
                        promptData.tags = tags;
                    }
                }

                if (prompt.folder && folderIdMap[prompt.folder]) {
                    promptData.folder = folderIdMap[prompt.folder];
                }

                await this.promptsManager.add(promptData);
                importedPromptCount += 1;
            }

            let importedContextCount = 0;

            for (const context of contexts) {
                if (!context || typeof context !== 'object') continue;

                const title = typeof context.title === 'string' ? context.title.trim() : '';
                const content = typeof context.content === 'string' ? context.content : '';

                if (!title || !content.trim()) {
                    continue;
                }

                const contextData = {
                    title,
                    content
                };

                if (context.category && typeof context.category === 'string') {
                    const categoryValue = context.category.trim();
                    if (categoryValue) {
                        contextData.category = categoryValue;
                    }
                }

                if (Array.isArray(context.tags)) {
                    const tags = context.tags
                        .map(tag => typeof tag === 'string' ? tag.trim() : '')
                        .filter(tag => tag);
                    contextData.tags = tags;
                } else if (typeof context.tags === 'string' && context.tags.trim()) {
                    const tags = context.tags
                        .split(',')
                        .map(tag => tag.trim())
                        .filter(tag => tag);
                    contextData.tags = tags;
                } else {
                    contextData.tags = [];
                }

                if (context.folder && folderIdMap[context.folder]) {
                    contextData.folder = folderIdMap[context.folder];
                }

                await this.contextsManager.add(contextData);
                importedContextCount += 1;
            }

            await this.renderFolders('prompt');
            await this.renderFolders('context');
            await this.renderTagFilters('prompt');
            await this.renderTagFilters('context');
            await this.renderPrompts();
            await this.renderContexts();

            this.showToast(`インポートが完了しました (プロンプト${importedPromptCount}件, コンテキスト${importedContextCount}件)`, 'success');
        } catch (error) {
            console.error('Failed to import JSON:', error);
            this.showToast('JSONインポートに失敗しました', 'error');
        }
    }

    // ========================================
    // プロンプト管理
    // ========================================

    sortItems(items, sortBy) {
        const sorted = [...items];

        switch (sortBy) {
            case 'date-desc':
                sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            case 'date-asc':
                sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                break;
            case 'title-asc':
                sorted.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
                break;
            case 'title-desc':
                sorted.sort((a, b) => b.title.localeCompare(a.title, 'ja'));
                break;
            default:
                break;
        }

        return sorted;
    }

    async renderPrompts() {
        let prompts = await this.promptsManager.getAll();

        if (this.promptSearchQuery) {
            const query = this.promptSearchQuery.toLowerCase();
            prompts = prompts.filter(prompt => {
                const tagText = Array.isArray(prompt.tags) ? prompt.tags.join(' ') : '';
                const searchStr = `${prompt.title} ${prompt.content} ${tagText}`.toLowerCase();
                return searchStr.includes(query);
            });
        }

        if (this.currentPromptTag === UNTAGGED_FILTER) {
            prompts = prompts.filter(prompt => !prompt.tags || prompt.tags.length === 0);
        } else if (this.currentPromptTag) {
            prompts = prompts.filter(prompt => Array.isArray(prompt.tags) && prompt.tags.includes(this.currentPromptTag));
        }

        if (this.currentPromptFolder === 'uncategorized') {
            prompts = prompts.filter(p => !p.folder);
        } else if (this.currentPromptFolder) {
            prompts = this.filterByFolder(prompts, this.currentPromptFolder);
        }

        prompts = this.sortItems(prompts, this.currentPromptSort);

        const grid = document.getElementById('prompts-grid');
        if (!grid) return;

        const shouldGroup = this.currentPromptGrouping && this.currentPromptGrouping !== 'none';
        grid.classList.toggle('is-grouped', Boolean(shouldGroup));

        if (prompts.length === 0) {
            grid.classList.remove('is-grouped');
            const hasFilters = Boolean(
                this.promptSearchQuery ||
                this.currentPromptFolder ||
                this.currentPromptTag
            );
            const title = hasFilters ? '条件に一致するプロンプトがありません' : 'プロンプトがありません';
            const description = hasFilters ? '検索条件やフィルタを調整してください。' : '新規プロンプトを追加してください';
            grid.innerHTML = this.renderEmptyState('', title, description);
            return;
        }

        if (shouldGroup) {
            const groups = await this.groupItems(prompts, 'prompt', this.currentPromptGrouping);
            grid.innerHTML = this.renderGroupedItems(groups, 'prompt');
        } else {
            grid.innerHTML = prompts.map(prompt => this.createPromptCard(prompt)).join('');
        }

        this.attachCardEventListeners('prompt');
    }

    createPromptCard(prompt) {
        const tags = prompt.tags ?
            prompt.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('') :
            '';

        return `
            <div class="card" data-id="${prompt.id}" data-type="prompt">
                <div class="card-header">
                    <h3 class="card-title">${this.escapeHtml(prompt.title)}</h3>
                    <div class="card-meta">${this.formatDate(prompt.createdAt)}</div>
                </div>
                <div class="card-content markdown-content">${this.renderMarkdown(prompt.content)}</div>
                ${tags ? `<div class="card-tags">${tags}</div>` : ''}
                <div class="card-actions">
                    <button class="btn btn-small btn-success copy-btn" data-id="${prompt.id}" data-type="prompt">
                        コピー
                    </button>
                </div>
            </div>
        `;
    }

    async openPromptModal(promptId = null) {
        const modal = document.getElementById('prompt-modal');
        const title = document.getElementById('prompt-modal-title');
        const form = document.getElementById('prompt-form');

        if (promptId) {
            const prompt = await this.promptsManager.findById(promptId);
            if (prompt) {
                title.textContent = 'プロンプトを編集';
                document.getElementById('prompt-title').value = prompt.title;
                document.getElementById('prompt-content').value = prompt.content;
                document.getElementById('prompt-tags').value = prompt.tags ? prompt.tags.join(', ') : '';

                // フォルダ名取得
                if (prompt.folder) {
                    const folder = await this.foldersManager.findById(prompt.folder);
                    document.getElementById('prompt-folder').value = folder ? folder.name : '';
                } else {
                    document.getElementById('prompt-folder').value = '';
                }

                // PM設定を読み込み
                if (prompt.pmConfig) {
                    const pm = prompt.pmConfig;
                    document.getElementById('pm-project-name').value = pm.projectName || '';
                    document.getElementById('pm-phase').value = pm.phase || '未分類';
                    document.getElementById('pm-priority').value = pm.priority || '中';
                    document.getElementById('pm-status').value = pm.status || '下書き';
                    document.getElementById('pm-importance').value = pm.importance || 3;
                    document.getElementById('pm-due-date').value = pm.dueDate || '';

                    // ステークホルダーをテキストに変換
                    if (pm.stakeholders && pm.stakeholders.length > 0) {
                        const stakeholdersText = pm.stakeholders.map(s => {
                            return s.role ? `${s.name}(${s.role})` : s.name;
                        }).join(', ');
                        document.getElementById('pm-stakeholders').value = stakeholdersText;
                    } else {
                        document.getElementById('pm-stakeholders').value = '';
                    }
                }

                this.editingItem = promptId;
            }
        } else {
            title.textContent = 'プロンプトを追加';
            form.reset();
            this.editingItem = null;
        }

        this.editingType = 'prompt';
        modal.classList.add('active');
    }

    async savePrompt() {
        const title = document.getElementById('prompt-title').value.trim();
        const content = document.getElementById('prompt-content').value.trim();
        const tagsInput = document.getElementById('prompt-tags').value.trim();
        const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
        const folderName = document.getElementById('prompt-folder').value.trim();

        if (!title || !content) {
            this.showToast('タイトルと内容は必須です', 'error');
            return;
        }

        const promptData = { title, content, tags };

        // フォルダ処理
        if (folderName) {
            const folder = await this.getOrCreateFolder(folderName, 'prompt');
            promptData.folder = folder.id;
        } else {
            promptData.folder = null;
        }

        // PM設定処理
        const pmProjectName = document.getElementById('pm-project-name')?.value.trim();
        const pmPhase = document.getElementById('pm-phase')?.value;
        const pmPriority = document.getElementById('pm-priority')?.value;
        const pmStatus = document.getElementById('pm-status')?.value;
        const pmImportance = parseInt(document.getElementById('pm-importance')?.value || "3", 10);
        const pmDueDate = document.getElementById('pm-due-date')?.value || null;
        const pmStakeholders = document.getElementById('pm-stakeholders')?.value.trim() || "";

        // 既存データがあればpmConfigを保持、なければデフォルト作成
        const existingData = this.editingItem ? await this.promptsManager.findById(this.editingItem) : null;
        const pmConfig = existingData?.pmConfig || {
            projectId: null,
            projectName: "",
            phase: "未分類",
            stakeholders: [],
            relatedDocs: [],
            priority: "中",
            importance: 3,
            status: "下書き",
            dueDate: null,
            stats: {
                usageCount: 0,
                lastUsed: null,
                effectiveness: 0
            }
        };

        // PM設定を更新
        pmConfig.projectName = pmProjectName || pmConfig.projectName;
        pmConfig.phase = pmPhase || pmConfig.phase;
        pmConfig.priority = pmPriority || pmConfig.priority;
        pmConfig.status = pmStatus || pmConfig.status;
        pmConfig.importance = pmImportance;
        pmConfig.dueDate = pmDueDate;

        // ステークホルダーをパース
        if (pmStakeholders) {
            pmConfig.stakeholders = pmStakeholders.split(',').map(s => {
                const match = s.trim().match(/^(.+?)\((.+?)\)$/);
                if (match) {
                    return { name: match[1].trim(), role: match[2].trim(), email: "" };
                }
                return { name: s.trim(), role: "", email: "" };
            });
        }

        promptData.pmConfig = pmConfig;

        if (this.editingItem) {
            await this.promptsManager.update(this.editingItem, promptData);
            this.showToast('プロンプトを更新しました', 'success');
        } else {
            await this.promptsManager.add(promptData);
            this.showToast('プロンプトを追加しました', 'success');
        }

        await this.renderFolders('prompt');
        await this.renderTagFilters('prompt');
        await this.renderPrompts();
        this.closeAllModals();
    }

    async searchPrompts(query) {
        this.promptSearchQuery = query;
        await this.renderPrompts();
    }

    // ========================================
    // コンテキスト管理
    // ========================================

    async renderContexts() {
        let contexts = await this.contextsManager.getAll();

        if (this.contextSearchQuery) {
            const query = this.contextSearchQuery.toLowerCase();
            contexts = contexts.filter(context => {
                const tagText = Array.isArray(context.tags) ? context.tags.join(' ') : '';
                const searchStr = `${context.title} ${context.content} ${context.category || ''} ${tagText}`.toLowerCase();
                return searchStr.includes(query);
            });
        }

        if (this.currentContextTag === UNTAGGED_FILTER) {
            contexts = contexts.filter(context => !context.tags || context.tags.length === 0);
        } else if (this.currentContextTag) {
            contexts = contexts.filter(context => Array.isArray(context.tags) && context.tags.includes(this.currentContextTag));
        }

        if (this.currentContextFolder === 'uncategorized') {
            contexts = contexts.filter(c => !c.folder);
        } else if (this.currentContextFolder) {
            contexts = this.filterByFolder(contexts, this.currentContextFolder);
        }

        contexts = this.sortItems(contexts, this.currentContextSort);

        const grid = document.getElementById('contexts-grid');
        if (!grid) return;

        const shouldGroup = this.currentContextGrouping && this.currentContextGrouping !== 'none';
        grid.classList.toggle('is-grouped', Boolean(shouldGroup));

        if (contexts.length === 0) {
            grid.classList.remove('is-grouped');
            const hasFilters = Boolean(
                this.contextSearchQuery ||
                this.currentContextFolder ||
                this.currentContextTag
            );
            const title = hasFilters ? '条件に一致するコンテキストがありません' : 'コンテキストがありません';
            const description = hasFilters ? '検索条件やフィルタを調整してください。' : '新規コンテキストを追加してください';
            grid.innerHTML = this.renderEmptyState('', title, description);
            return;
        }

        if (shouldGroup) {
            const groups = await this.groupItems(contexts, 'context', this.currentContextGrouping);
            grid.innerHTML = this.renderGroupedItems(groups, 'context');
        } else {
            grid.innerHTML = contexts.map(context => this.createContextCard(context)).join('');
        }

        this.attachCardEventListeners('context');
    }

    createContextCard(context) {
        const tagElements = [];

        if (context.category) {
            tagElements.push(`<span class="tag tag-category">${this.escapeHtml(context.category)}</span>`);
        }

        if (Array.isArray(context.tags)) {
            const uniqueTags = Array.from(new Set(context.tags
                .map(tag => typeof tag === 'string' ? tag.trim() : '')
                .filter(tag => tag)));
            const filteredTags = context.category ? uniqueTags.filter(tag => tag !== context.category) : uniqueTags;
            for (const tag of filteredTags) {
                tagElements.push(`<span class="tag">${this.escapeHtml(tag)}</span>`);
            }
        }

        const tagsHtml = tagElements.length > 0 ? `<div class="card-tags">${tagElements.join('')}</div>` : '';

        return `
            <div class="card" data-id="${context.id}" data-type="context">
                <div class="card-header">
                    <h3 class="card-title">${this.escapeHtml(context.title)}</h3>
                    <div class="card-meta">${this.formatDate(context.createdAt)}</div>
                </div>
                <div class="card-content markdown-content">${this.renderMarkdown(context.content)}</div>
                ${tagsHtml}
                <div class="card-actions">
                    <button class="btn btn-small btn-success copy-btn" data-id="${context.id}" data-type="context">
                        コピー
                    </button>
                </div>
            </div>
        `;
    }

    async openContextModal(contextId = null) {
        const modal = document.getElementById('context-modal');
        const title = document.getElementById('context-modal-title');
        const form = document.getElementById('context-form');

        if (contextId) {
            const context = await this.contextsManager.findById(contextId);
            if (context) {
                title.textContent = 'コンテキストを編集';
                document.getElementById('context-title').value = context.title;
                document.getElementById('context-content').value = context.content;
                document.getElementById('context-category').value = context.category || '';
                document.getElementById('context-tags').value = Array.isArray(context.tags) ? context.tags.join(', ') : '';

                // フォルダ名取得
                if (context.folder) {
                    const folder = await this.foldersManager.findById(context.folder);
                    document.getElementById('context-folder').value = folder ? folder.name : '';
                } else {
                    document.getElementById('context-folder').value = '';
                }

                // PM設定を読み込み
                if (context.pmConfig) {
                    const pm = context.pmConfig;
                    document.getElementById('context-pm-project-name').value = pm.projectName || '';
                    document.getElementById('context-pm-type').value = pm.contextType || '背景情報';
                    document.getElementById('context-pm-visibility').value = pm.visibility || '個人';
                    document.getElementById('context-pm-version').value = pm.version || '1.0';
                }

                this.editingItem = contextId;
            }
        } else {
            title.textContent = 'コンテキストを追加';
            form.reset();
            this.editingItem = null;
        }

        this.editingType = 'context';
        modal.classList.add('active');
    }

    async saveContext() {
        const title = document.getElementById('context-title').value.trim();
        const content = document.getElementById('context-content').value.trim();
        const category = document.getElementById('context-category').value.trim();
        const tagsInput = document.getElementById('context-tags').value.trim();
        const folderName = document.getElementById('context-folder').value.trim();

        if (!title || !content) {
            this.showToast('タイトルと内容は必須です', 'error');
            return;
        }

        const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

        const contextData = {
            title,
            content,
            category: category || null,
            tags
        };

        // フォルダ処理
        if (folderName) {
            const folder = await this.getOrCreateFolder(folderName, 'context');
            contextData.folder = folder.id;
        } else {
            contextData.folder = null;
        }

        // PM設定処理
        const pmProjectName = document.getElementById('context-pm-project-name')?.value.trim();
        const pmType = document.getElementById('context-pm-type')?.value;
        const pmVisibility = document.getElementById('context-pm-visibility')?.value;
        const pmVersion = document.getElementById('context-pm-version')?.value.trim();

        // 既存データがあればpmConfigを保持、なければデフォルト作成
        const existingData = this.editingItem ? await this.contextsManager.findById(this.editingItem) : null;
        const pmConfig = existingData?.pmConfig || {
            projectId: null,
            projectName: "",
            contextType: "背景情報",
            visibility: "個人",
            version: "1.0",
            previousVersionId: null,
            relatedPrompts: []
        };

        // PM設定を更新
        pmConfig.projectName = pmProjectName || pmConfig.projectName;
        pmConfig.contextType = pmType || pmConfig.contextType;
        pmConfig.visibility = pmVisibility || pmConfig.visibility;
        pmConfig.version = pmVersion || pmConfig.version;

        contextData.pmConfig = pmConfig;

        if (this.editingItem) {
            await this.contextsManager.update(this.editingItem, contextData);
            this.showToast('コンテキストを更新しました', 'success');
        } else {
            await this.contextsManager.add(contextData);
            this.showToast('コンテキストを追加しました', 'success');
        }

        await this.renderFolders('context');
        await this.renderTagFilters('context');
        await this.renderContexts();
        this.closeAllModals();
    }

    async searchContexts(query) {
        this.contextSearchQuery = query;
        await this.renderContexts();
    }

    // ========================================
    // 共通機能
    // ========================================

    async getFolders(type) {
        const allFolders = await this.foldersManager.getAll();
        return allFolders.filter(f => f.type === type);
    }

    async getOrCreateFolder(name, type) {
        const folders = await this.getFolders(type);
        let folder = folders.find(f => f.name === name);

        if (!folder) {
            folder = await this.foldersManager.add({ name, type });
        }

        return folder;
    }

    filterByFolder(items, folderId) {
        if (!folderId) return items;
        return items.filter(item => item.folder === folderId);
    }

    async renderTagFilters(type) {
        const containerId = type === 'prompt' ? 'prompt-tags' : 'context-tags';
        const container = document.getElementById(containerId);

        if (!container) return;

        const manager = type === 'prompt' ? this.promptsManager : this.contextsManager;
        const items = await manager.getAll();

        const tagCounts = new Map();
        let untaggedCount = 0;

        for (const item of items) {
            const tags = Array.isArray(item.tags)
                ? item.tags.map(tag => typeof tag === 'string' ? tag.trim() : '').filter(tag => tag)
                : [];

            if (tags.length === 0) {
                untaggedCount += 1;
            } else {
                for (const tag of tags) {
                    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
                }
            }
        }

        if (type === 'prompt') {
            if (this.currentPromptTag === UNTAGGED_FILTER && untaggedCount === 0) {
                this.currentPromptTag = null;
            } else if (this.currentPromptTag && this.currentPromptTag !== UNTAGGED_FILTER && !tagCounts.has(this.currentPromptTag)) {
                this.currentPromptTag = null;
            }
        } else {
            if (this.currentContextTag === UNTAGGED_FILTER && untaggedCount === 0) {
                this.currentContextTag = null;
            } else if (this.currentContextTag && this.currentContextTag !== UNTAGGED_FILTER && !tagCounts.has(this.currentContextTag)) {
                this.currentContextTag = null;
            }
        }

        const activeTag = type === 'prompt' ? this.currentPromptTag : this.currentContextTag;
        const totalCount = items.length;
        const tagEntries = Array.from(tagCounts.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ja'));

        const parts = [];
        parts.push(`
            <li class="tag-filter-item ${!activeTag ? 'active' : ''}" data-tag="">
                <span class="tag-name">すべて</span>
                <span class="tag-count">${totalCount}</span>
            </li>
        `);

        if (untaggedCount > 0) {
            parts.push(`
                <li class="tag-filter-item ${activeTag === UNTAGGED_FILTER ? 'active' : ''}" data-tag="${UNTAGGED_FILTER}">
                    <span class="tag-name">タグなし</span>
                    <span class="tag-count">${untaggedCount}</span>
                </li>
            `);
        }

        for (const [tag, count] of tagEntries) {
            const isActive = activeTag === tag;
            parts.push(`
                <li class="tag-filter-item ${isActive ? 'active' : ''}" data-tag="${this.escapeHtml(tag)}">
                    <span class="tag-name">#${this.escapeHtml(tag)}</span>
                    <span class="tag-count">${count}</span>
                </li>
            `);
        }

        container.innerHTML = parts.join('');

        container.querySelectorAll('.tag-filter-item').forEach(item => {
            item.addEventListener('click', () => {
                const value = item.dataset.tag;
                let selectedTag = null;

                if (value === UNTAGGED_FILTER) {
                    selectedTag = UNTAGGED_FILTER;
                } else if (value) {
                    selectedTag = value;
                }

                if (type === 'prompt') {
                    this.currentPromptTag = selectedTag;
                } else {
                    this.currentContextTag = selectedTag;
                }

                container.querySelectorAll('.tag-filter-item').forEach(el => {
                    el.classList.toggle('active', el === item);
                });

                if (type === 'prompt') {
                    this.renderPrompts();
                } else {
                    this.renderContexts();
                }
            });
        });
    }

    async renderFolders(type) {
        const folders = await this.getFolders(type);
        const containerId = type === 'prompt' ? 'prompt-folders' : 'context-folders';
        const container = document.getElementById(containerId);

        if (!container) return;

        const currentFolder = type === 'prompt' ? this.currentPromptFolder : this.currentContextFolder;

        const folderItems = folders.map(folder => {
            const isActive = currentFolder === folder.id;
            return `
                <li class="folder-item ${isActive ? 'active' : ''}" data-folder-id="${folder.id}">
                    <span class="folder-icon">📁</span>
                    <span class="folder-name">${this.escapeHtml(folder.name)}</span>
                </li>
            `;
        }).join('');

        container.innerHTML = `
            <li class="folder-item ${!currentFolder ? 'active' : ''}" data-folder-id="">
                <span class="folder-icon">📂</span>
                <span class="folder-name">すべて</span>
            </li>
            <li class="folder-item ${currentFolder === 'uncategorized' ? 'active' : ''}" data-folder-id="uncategorized">
                <span class="folder-icon">📄</span>
                <span class="folder-name">未分類</span>
            </li>
            ${folderItems}
        `;

        // フォルダクリックイベント
        container.querySelectorAll('.folder-item').forEach(item => {
            item.addEventListener('click', () => {
                const folderId = item.dataset.folderId || null;
                if (type === 'prompt') {
                    this.currentPromptFolder = folderId === 'uncategorized' ? 'uncategorized' : folderId;
                    this.renderPrompts();
                    this.renderFolders('prompt');
                } else {
                    this.currentContextFolder = folderId === 'uncategorized' ? 'uncategorized' : folderId;
                    this.renderContexts();
                    this.renderFolders('context');
                }
            });
        });
    }

    async groupItems(items, type, grouping) {
        switch (grouping) {
            case 'folder':
                return this.groupByFolder(items, type);
            case 'tag':
                return this.groupByTag(items);
            case 'category':
                return this.groupByCategory(items);
            default:
                return [];
        }
    }

    async groupByFolder(items, type) {
        const folders = await this.getFolders(type);
        const folderMap = new Map(folders.map(folder => [folder.id, folder.name]));
        const groups = new Map();

        for (const item of items) {
            let key = 'uncategorized';
            let label = '未分類';

            if (item.folder) {
                if (folderMap.has(item.folder)) {
                    key = item.folder;
                    label = folderMap.get(item.folder);
                } else {
                    key = 'missing-folder';
                    label = 'フォルダ未設定';
                }
            }

            if (!groups.has(key)) {
                groups.set(key, { key, label, items: [] });
            }

            groups.get(key).items.push(item);
        }

        const sorted = Array.from(groups.values());
        sorted.sort((a, b) => {
            if (a.key === 'uncategorized') return 1;
            if (b.key === 'uncategorized') return -1;
            return a.label.localeCompare(b.label, 'ja');
        });

        return sorted;
    }

    groupByTag(items) {
        const groups = new Map();
        const untagged = [];

        for (const item of items) {
            const tags = Array.isArray(item.tags)
                ? item.tags.map(tag => typeof tag === 'string' ? tag.trim() : '').filter(tag => tag)
                : [];

            if (tags.length === 0) {
                untagged.push(item);
                continue;
            }

            for (const tag of tags) {
                if (!groups.has(tag)) {
                    groups.set(tag, { key: tag, label: tag, items: [] });
                }
                groups.get(tag).items.push(item);
            }
        }

        const sorted = Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label, 'ja'));
        if (untagged.length > 0) {
            sorted.push({ key: UNTAGGED_FILTER, label: 'タグなし', items: untagged });
        }
        return sorted;
    }

    groupByCategory(items) {
        const groups = new Map();
        const uncategorized = [];

        for (const item of items) {
            const category = typeof item.category === 'string' ? item.category.trim() : '';
            if (!category) {
                uncategorized.push(item);
                continue;
            }

            if (!groups.has(category)) {
                groups.set(category, { key: category, label: category, items: [] });
            }
            groups.get(category).items.push(item);
        }

        const sorted = Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label, 'ja'));
        if (uncategorized.length > 0) {
            sorted.push({ key: '__no_category__', label: 'カテゴリ未設定', items: uncategorized });
        }

        return sorted;
    }

    renderGroupedItems(groups, type) {
        if (!groups || groups.length === 0) {
            return '';
        }

        return groups.map(group => {
            const cards = group.items.map(item => type === 'prompt'
                ? this.createPromptCard(item)
                : this.createContextCard(item)).join('');
            const label = this.escapeHtml(group.label);

            return `
                <section class="group-section">
                    <div class="group-header">
                        <span class="group-title">${label}</span>
                        <span class="group-count">${group.items.length}</span>
                    </div>
                    <div class="group-grid">
                        ${cards}
                    </div>
                </section>
            `;
        }).join('');
    }

    attachCardEventListeners(type) {
        // カードクリックでプレビュー
        document.querySelectorAll(`.card[data-type="${type}"]`).forEach(card => {
            card.addEventListener('click', (e) => {
                // ボタンクリック時はプレビューを開かない
                if (e.target.closest('button')) {
                    return;
                }
                const id = card.dataset.id;
                this.openPreviewModal(id, type);
            });
        });

        // コピーボタン
        document.querySelectorAll(`.copy-btn[data-type="${type}"]`).forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.copyToClipboard(id, type);
            });
        });
    }

    async copyToClipboard(id, type) {
        const manager = type === 'prompt' ? this.promptsManager : this.contextsManager;
        const item = await manager.findById(id);

        if (item) {
            navigator.clipboard.writeText(item.content)
                .then(() => {
                    this.showToast('クリップボードにコピーしました', 'success');
                })
                .catch(() => {
                    this.showToast('コピーに失敗しました', 'error');
                });
        }
    }

    async deleteItem(id, type) {
        if (!confirm('本当に削除しますか?')) {
            return;
        }

        const manager = type === 'prompt' ? this.promptsManager : this.contextsManager;
        const success = await manager.delete(id);

        if (success) {
            this.showToast('削除しました', 'success');
            if (type === 'prompt') {
                await this.renderTagFilters('prompt');
                await this.renderPrompts();
            } else {
                await this.renderTagFilters('context');
                await this.renderContexts();
            }
        } else {
            this.showToast('削除に失敗しました', 'error');
        }
    }

    async openPreviewModal(id, type) {
        const manager = type === 'prompt' ? this.promptsManager : this.contextsManager;
        const item = await manager.findById(id);

        if (!item) return;

        this.previewItem = id;
        this.previewType = type;

        const modal = document.getElementById('preview-modal');
        const titleEl = document.getElementById('preview-title');
        const metaEl = document.getElementById('preview-meta');
        const contentEl = document.getElementById('preview-content');

        // タイトル設定
        titleEl.textContent = item.title;

        // メタ情報
        const metaInfo = [];
        metaInfo.push(`作成日: ${this.formatDate(item.createdAt)}`);

        if (type === 'prompt') {
            const promptTags = Array.isArray(item.tags)
                ? Array.from(new Set(item.tags.map(tag => typeof tag === 'string' ? tag.trim() : '').filter(tag => tag)))
                : [];
            if (promptTags.length > 0) {
                metaInfo.push(`タグ: ${promptTags.join(', ')}`);
            }
        }

        if (type === 'context') {
            if (item.category) {
                metaInfo.push(`カテゴリ: ${item.category}`);
            }
            const contextTags = Array.isArray(item.tags)
                ? Array.from(new Set(item.tags.map(tag => typeof tag === 'string' ? tag.trim() : '').filter(tag => tag)))
                : [];
            if (contextTags.length > 0) {
                metaInfo.push(`タグ: ${contextTags.join(', ')}`);
            }
        }

        if (item.folder) {
            const folder = await this.foldersManager.findById(item.folder);
            if (folder) {
                metaInfo.push(`フォルダ: ${folder.name}`);
            }
        }

        metaEl.innerHTML = metaInfo.map(info => `<span>${this.escapeHtml(info)}</span>`).join('');

        // コンテンツ（Markdownレンダリング）
        contentEl.innerHTML = this.renderMarkdown(item.content);

        modal.classList.add('active');
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
        this.editingItem = null;
        this.editingType = null;
        this.previewItem = null;
        this.previewType = null;
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideInRight 0.3s ease reverse';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }

    renderEmptyState(icon, title, description) {
        return `
            <div class="empty-state">
                <h3>${title}</h3>
                <p>${description}</p>
            </div>
        `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    renderMarkdown(text) {
        if (typeof marked === 'undefined') {
            // marked.jsが読み込まれていない場合はエスケープのみ
            return this.escapeHtml(text);
        }

        // marked.jsの設定: XSS対策とシンプルなレンダリング
        marked.setOptions({
            breaks: true,        // 改行を<br>に変換
            gfm: true,           // GitHub Flavored Markdown
            headerIds: false,    // ヘッダーIDを無効化
            mangle: false        // メールアドレスの難読化を無効化
        });

        try {
            return marked.parse(text);
        } catch (e) {
            console.error('Markdown parsing error:', e);
            return this.escapeHtml(text);
        }
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) {
            return '今日';
        } else if (days === 1) {
            return '昨日';
        } else if (days < 7) {
            return `${days}日前`;
        } else {
            return date.toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        }
    }

    // ========================================
    // Phase 2: テンプレート管理メソッド
    // ========================================

    async renderTemplates() {
        const grid = document.getElementById('templates-grid');
        if (!grid) return;

        try {
            const templates = await window.templateManager.getAllTemplates();
            this.renderTemplatesList(templates);
        } catch (error) {
            console.error('Failed to render templates:', error);
            grid.innerHTML = '<p class="no-items">テンプレートの読み込みに失敗しました</p>';
        }
    }

    renderTemplatesList(templates) {
        const grid = document.getElementById('templates-grid');
        if (!grid) return;

        if (templates.length === 0) {
            grid.innerHTML = '<p class="no-items">テンプレートがありません</p>';
            return;
        }

        grid.innerHTML = templates.map(template => this.createTemplateCard(template)).join('');
        this.attachTemplateEventListeners();
    }

    createTemplateCard(template) {
        const cardClass = template.author === 'system' ? 'template-card system-template' : 'template-card custom-template';

        return `
            <div class="${cardClass}" data-template-id="${template.id}">
                <div class="template-card-header">
                    <span class="template-category">${this.escapeHtml(template.category)}</span>
                    <h3>${this.escapeHtml(template.name)}</h3>
                </div>
                <p class="template-description">${this.escapeHtml(template.description)}</p>
                ${template.tags && template.tags.length > 0 ? `
                    <div class="template-tags">
                        ${template.tags.map(tag => `<span class="template-tag">${this.escapeHtml(tag)}</span>`).join('')}
                    </div>
                ` : ''}
                <div class="template-meta">
                    <div class="template-meta-item">
                        <span>📊</span>
                        <span>${template.usageCount || 0}回使用</span>
                    </div>
                    ${template.rating > 0 ? `
                        <div class="template-meta-item">
                            <span>⭐</span>
                            <span>${template.rating.toFixed(1)}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="template-actions">
                    <button class="btn btn-primary apply-template-btn">適用</button>
                    <button class="btn btn-secondary preview-template-btn">プレビュー</button>
                    <button class="btn btn-secondary copy-template-btn" title="テンプレートをコピー">📋</button>
                </div>
            </div>
        `;
    }

    attachTemplateEventListeners() {
        // 適用ボタン
        document.querySelectorAll('.apply-template-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = e.target.closest('.template-card');
                const templateId = card.dataset.templateId;
                this.openTemplateApplyModal(templateId);
            });
        });

        // プレビューボタン
        document.querySelectorAll('.preview-template-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const card = e.target.closest('.template-card');
                const templateId = card.dataset.templateId;
                await this.previewTemplate(templateId);
            });
        });

        // コピーボタン
        document.querySelectorAll('.copy-template-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const card = e.target.closest('.template-card');
                const templateId = card.dataset.templateId;
                await this.copyTemplateToClipboard(templateId);
            });
        });
    }

    async copyTemplateToClipboard(templateId) {
        try {
            const template = await window.templateManager.storage.findById(templateId);
            if (!template) {
                this.showToast('テンプレートが見つかりません', 'error');
                return;
            }

            // テンプレートの内容をクリップボードにコピー
            const textToCopy = `${template.name}\n\n${template.promptTemplate}${template.contextTemplate ? `\n\n---\n\n${template.contextTemplate}` : ''}`;
            await navigator.clipboard.writeText(textToCopy);
            this.showToast('テンプレートをクリップボードにコピーしました', 'success');
        } catch (error) {
            console.error('Failed to copy template:', error);
            this.showToast('コピーに失敗しました', 'error');
        }
    }

    async openTemplateApplyModal(templateId) {
        const template = await window.templateManager.storage.findById(templateId);
        if (!template) {
            this.showToast('テンプレートが見つかりません', 'error');
            return;
        }

        const modal = document.getElementById('template-apply-modal');
        const title = document.getElementById('template-apply-title');
        const container = document.getElementById('template-variables-container');

        title.textContent = `${template.name} を適用`;

        // 変数入力フォームを生成
        container.innerHTML = template.variables.map(variable => {
            const required = variable.required ? '<span class="required">*</span>' : '';
            const placeholder = variable.placeholder ? `placeholder="${this.escapeHtml(variable.placeholder)}"` : '';

            let inputHtml = '';
            switch (variable.type) {
                case 'textarea':
                    inputHtml = `<textarea name="${variable.name}" ${placeholder}></textarea>`;
                    break;
                case 'select':
                    inputHtml = `
                        <select name="${variable.name}">
                            ${variable.options.map(opt => `<option value="${this.escapeHtml(opt)}">${this.escapeHtml(opt)}</option>`).join('')}
                        </select>
                    `;
                    break;
                case 'date':
                case 'datetime':
                    inputHtml = `<input type="${variable.type === 'datetime' ? 'datetime-local' : 'date'}" name="${variable.name}">`;
                    break;
                default:
                    inputHtml = `<input type="text" name="${variable.name}" ${placeholder}>`;
            }

            return `
                <div class="variable-input-group">
                    <label>${this.escapeHtml(variable.label)}${required}</label>
                    ${inputHtml}
                    ${variable.placeholder ? `<span class="variable-placeholder">${this.escapeHtml(variable.placeholder)}</span>` : ''}
                </div>
            `;
        }).join('');

        modal.classList.add('active');

        // フォーム送信処理
        const form = document.getElementById('template-apply-form');
        form.onsubmit = async (e) => {
            e.preventDefault();
            await this.applyTemplateToPrompt(templateId, new FormData(form));
            this.closeAllModals();
        };
    }

    async applyTemplateToPrompt(templateId, formData) {
        try {
            // FormDataから変数値を取得
            const variableValues = {};
            for (const [key, value] of formData.entries()) {
                variableValues[key] = value;
            }

            // テンプレートを適用
            const result = await window.templateManager.applyTemplate(templateId, variableValues);

            // プロンプトモーダルを開いて適用
            this.openPromptModal();

            // プロンプト内容を設定
            document.getElementById('prompt-title').value = result.templateName;
            document.getElementById('prompt-content').value = result.prompt;

            // タグも設定
            if (result.tags && result.tags.length > 0) {
                document.getElementById('prompt-tags').value = result.tags.join(', ');
            }

            this.showToast('テンプレートを適用しました', 'success');
        } catch (error) {
            console.error('Failed to apply template:', error);
            this.showToast('テンプレートの適用に失敗しました', 'error');
        }
    }

    async previewTemplate(templateId) {
        const template = await window.templateManager.storage.findById(templateId);
        if (!template) return;

        const modal = document.getElementById('preview-modal');
        const title = document.getElementById('preview-title');
        const meta = document.getElementById('preview-meta');
        const content = document.getElementById('preview-content');

        title.textContent = template.name;

        meta.innerHTML = `
            <div class="meta-item"><strong>カテゴリ:</strong> ${this.escapeHtml(template.category)}</div>
            <div class="meta-item"><strong>タグ:</strong> ${template.tags ? template.tags.map(t => this.escapeHtml(t)).join(', ') : 'なし'}</div>
            <div class="meta-item"><strong>使用回数:</strong> ${template.usageCount || 0}回</div>
            <div class="meta-item"><strong>種別:</strong> ${template.author === 'system' ? '公式テンプレート' : 'カスタムテンプレート'}</div>
        `;

        // テンプレート本文をプレビュー
        const previewText = `## プロンプトテンプレート\n\n${template.promptTemplate}\n\n${template.contextTemplate ? `## コンテキストテンプレート\n\n${template.contextTemplate}` : ''}`;
        content.innerHTML = marked.parse(previewText);

        // モーダルフッターのボタンをテンプレート用に変更
        const footer = modal.querySelector('.modal-footer');
        footer.innerHTML = `
            <button class="btn btn-success" id="preview-apply-template-btn">適用</button>
            ${template.author === 'custom' ? '<button class="btn btn-danger" id="preview-delete-template-btn">削除</button>' : ''}
            <button class="btn btn-secondary cancel-btn">閉じる</button>
        `;

        // 適用ボタンのイベント
        const applyBtn = document.getElementById('preview-apply-template-btn');
        if (applyBtn) {
            applyBtn.onclick = () => {
                this.closeAllModals();
                this.openTemplateApplyModal(templateId);
            };
        }

        // 削除ボタンのイベント（カスタムテンプレートのみ）
        const deleteBtn = document.getElementById('preview-delete-template-btn');
        if (deleteBtn) {
            deleteBtn.onclick = async () => {
                if (confirm('このテンプレートを削除してもよろしいですか？')) {
                    try {
                        await window.templateManager.deleteTemplate(templateId);
                        this.closeAllModals();
                        await this.renderTemplates();
                        this.showToast('テンプレートを削除しました', 'success');
                    } catch (error) {
                        console.error('Failed to delete template:', error);
                        this.showToast('テンプレートの削除に失敗しました', 'error');
                    }
                }
            };
        }

        // 閉じるボタンのイベント
        const cancelBtns = footer.querySelectorAll('.cancel-btn');
        cancelBtns.forEach(btn => {
            btn.onclick = () => this.closeAllModals();
        });

        modal.classList.add('active');
    }
}

// ========================================
// Export for ES Modules
// ========================================

export { CognishelfApp, StorageInterface, StorageManager, IndexedDBManager, StorageAdapter };
