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
    constructor(dbName, storeName, version = 2) {
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
                    promptStore.createIndex('projectId', 'projectId', { unique: false });
                }

                // contexts Object Store
                if (!db.objectStoreNames.contains('contexts')) {
                    const contextStore = db.createObjectStore('contexts', { keyPath: 'id' });
                    contextStore.createIndex('title', 'title', { unique: false });
                    contextStore.createIndex('createdAt', 'createdAt', { unique: false });
                    contextStore.createIndex('category', 'category', { unique: false });
                    contextStore.createIndex('folder', 'folder', { unique: false });
                    contextStore.createIndex('projectId', 'projectId', { unique: false });
                }

                // folders Object Store
                if (!db.objectStoreNames.contains('folders')) {
                    const folderStore = db.createObjectStore('folders', { keyPath: 'id' });
                    folderStore.createIndex('name', 'name', { unique: false });
                    folderStore.createIndex('type', 'type', { unique: false });
                    folderStore.createIndex('projectId', 'projectId', { unique: false });
                }

                // projects Object Store (Phase 3)
                if (!db.objectStoreNames.contains('projects')) {
                    const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
                    projectStore.createIndex('name', 'name', { unique: false });
                    projectStore.createIndex('status', 'status', { unique: false });
                    projectStore.createIndex('startDate', 'startDate', { unique: false });
                    projectStore.createIndex('priority', 'priority', { unique: false });
                }

                // Version 2へのマイグレーション: 既存データにprojectIdを追加
                if (oldVersion < 2) {
                    const stores = ['prompts', 'contexts', 'folders'];
                    stores.forEach(storeName => {
                        if (db.objectStoreNames.contains(storeName)) {
                            const store = transaction.objectStore(storeName);

                            // projectIdインデックスを追加
                            if (!store.indexNames.contains('projectId')) {
                                store.createIndex('projectId', 'projectId', { unique: false });
                            }

                            // 既存データにデフォルトプロジェクトIDを追加
                            store.openCursor().onsuccess = (event) => {
                                const cursor = event.target.result;
                                if (cursor) {
                                    const item = cursor.value;
                                    if (!item.projectId) {
                                        item.projectId = 'default-project';
                                        cursor.update(item);
                                    }
                                    cursor.continue();
                                }
                            };
                        }
                    });
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

    // プロジェクトIDで検索
    async findByProject(projectId) {
        const db = await this.dbPromise;
        const index = db.transaction(this.storeName).objectStore(this.storeName).index('projectId');
        return index.getAll(projectId);
    }
}

// ========================================
// プロジェクト管理専用Manager
// ========================================
class ProjectManager extends IndexedDBManager {
    constructor(dbName = 'cognishelf-db') {
        super(dbName, 'projects', 2);
    }

    // アクティブプロジェクトの取得
    async getActiveProject() {
        const projectId = localStorage.getItem('cognishelf-active-project');
        if (!projectId) {
            // デフォルトプロジェクトを作成または取得
            return this.getOrCreateDefaultProject();
        }
        const project = await this.findById(projectId);
        return project || this.getOrCreateDefaultProject();
    }

    // アクティブプロジェクトの設定
    async setActiveProject(projectId) {
        const project = await this.findById(projectId);
        if (!project) {
            throw new Error('Project not found');
        }
        localStorage.setItem('cognishelf-active-project', projectId);
        return project;
    }

    // デフォルトプロジェクトの取得または作成
    async getOrCreateDefaultProject() {
        const defaultProject = await this.findById('default-project');
        if (defaultProject) {
            return defaultProject;
        }

        // デフォルトプロジェクトを作成
        const newProject = {
            id: 'default-project',
            name: 'デフォルトプロジェクト',
            description: '初期プロジェクト',
            status: 'active',
            startDate: new Date().toISOString().split('T')[0],
            targetEndDate: null,
            actualEndDate: null,
            stakeholders: [],
            priority: 'medium',
            metadata: {
                budget: '',
                team: [],
                technologies: []
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const db = await this.dbPromise;
        await db.add(this.storeName, newProject);
        localStorage.setItem('cognishelf-active-project', 'default-project');
        return newProject;
    }

    // プロジェクト統計の取得
    async getProjectStats(projectId) {
        const db = await this.dbPromise;

        const prompts = await db.getAllFromIndex('prompts', 'projectId', projectId);
        const contexts = await db.getAllFromIndex('contexts', 'projectId', projectId);
        const folders = await db.getAllFromIndex('folders', 'projectId', projectId);

        return {
            promptCount: prompts.length,
            contextCount: contexts.length,
            folderCount: folders.length,
            totalItems: prompts.length + contexts.length
        };
    }

    // プロジェクトのアーカイブ
    async archiveProject(projectId) {
        if (projectId === 'default-project') {
            throw new Error('Cannot archive default project');
        }
        return this.update(projectId, { status: 'archived' });
    }

    // ステータス別のプロジェクト取得
    async findByStatus(status) {
        const db = await this.dbPromise;
        const index = db.transaction(this.storeName).objectStore(this.storeName).index('status');
        return index.getAll(status);
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
                const manager = new IndexedDBManager('cognishelf-db', storeName, 2);
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
        this.projectsManager = null; // Phase 3
        this.currentProject = null; // Phase 3
        this.currentTab = 'prompts';
        this.editingItem = null;
        this.editingType = null;
        this.editingProject = null; // Phase 3
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

            // Phase 3: プロジェクトマネージャーの初期化
            this.projectsManager = new ProjectManager();
            await this.projectsManager.init();
            this.currentProject = await this.projectsManager.getActiveProject();

            // プロジェクトセレクターを更新
            await this.updateProjectSelector();

            // Phase 3: 既存データのマイグレーション（初回のみ）
            await this.migrateExistingDataToProject();

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

        // キーボードショートカット
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });

        // Phase 3: プロジェクト管理イベントリスナー
        const projectSelect = document.getElementById('active-project-select');
        if (projectSelect) {
            projectSelect.addEventListener('change', (e) => {
                this.switchProject(e.target.value);
            });
        }

        const addProjectBtn = document.getElementById('add-project-btn');
        if (addProjectBtn) {
            addProjectBtn.addEventListener('click', () => {
                this.openProjectModal();
            });
        }

        const manageProjectsBtn = document.getElementById('manage-projects-btn');
        if (manageProjectsBtn) {
            manageProjectsBtn.addEventListener('click', () => {
                this.openProjectsListModal();
            });
        }

        const projectForm = document.getElementById('project-form');
        if (projectForm) {
            projectForm.addEventListener('submit', (e) => {
                this.saveProject(e);
            });
        }

        const projectsSearch = document.getElementById('projects-search');
        if (projectsSearch) {
            projectsSearch.addEventListener('input', (e) => {
                const filter = document.getElementById('projects-status-filter').value;
                this.renderProjectsList(filter, e.target.value);
            });
        }

        const projectsFilter = document.getElementById('projects-status-filter');
        if (projectsFilter) {
            projectsFilter.addEventListener('change', (e) => {
                const query = document.getElementById('projects-search').value;
                this.renderProjectsList(e.target.value, query);
            });
        }
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

        // Phase 3: ダッシュボードタブの場合はレンダリング
        if (tabName === 'dashboard') {
            this.renderDashboard();
        }
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

        // Phase 3: 現在のプロジェクトのアイテムのみ表示
        if (this.currentProject) {
            prompts = prompts.filter(p => p.projectId === this.currentProject.id);
        }

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

        const promptData = {
            title,
            content,
            tags,
            projectId: this.currentProject.id // Phase 3: プロジェクトID追加
        };

        // フォルダ処理
        if (folderName) {
            const folder = await this.getOrCreateFolder(folderName, 'prompt');
            promptData.folder = folder.id;
        } else {
            promptData.folder = null;
        }

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

        // Phase 3: 現在のプロジェクトのアイテムのみ表示
        if (this.currentProject) {
            contexts = contexts.filter(c => c.projectId === this.currentProject.id);
        }

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
            tags,
            projectId: this.currentProject.id // Phase 3: プロジェクトID追加
        };

        // フォルダ処理
        if (folderName) {
            const folder = await this.getOrCreateFolder(folderName, 'context');
            contextData.folder = folder.id;
        } else {
            contextData.folder = null;
        }

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
        let folder = folders.find(f => f.name === name && f.projectId === this.currentProject.id);

        if (!folder) {
            folder = await this.foldersManager.add({
                name,
                type,
                projectId: this.currentProject.id // Phase 3: プロジェクトID追加
            });
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
        let folders = await this.getFolders(type);

        // Phase 3: 現在のプロジェクトのフォルダのみ表示
        if (this.currentProject) {
            folders = folders.filter(f => f.projectId === this.currentProject.id);
        }

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
            modal.style.display = 'none'; // Phase 3: display: none も設定
        });
        this.editingItem = null;
        this.editingType = null;
        this.editingProject = null; // Phase 3
        this.previewItem = null;
        this.previewType = null;
    }

    // Phase 3: 特定のモーダルを閉じる
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }
        if (modalId === 'project-modal') {
            this.editingProject = null;
        }
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
    // Phase 3: プロジェクト管理機能
    // ========================================

    // プロジェクトセレクターの更新
    async updateProjectSelector() {
        const allProjects = await this.projectsManager.getAll();
        const projectSelect = document.getElementById('active-project-select');

        if (!projectSelect) return;

        projectSelect.innerHTML = '';
        allProjects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name;
            option.selected = project.id === this.currentProject.id;
            projectSelect.appendChild(option);
        });
    }

    // プロジェクト切り替え
    async switchProject(projectId) {
        try {
            this.currentProject = await this.projectsManager.setActiveProject(projectId);
            await this.updateProjectSelector();

            // 全セクションを再レンダリング
            await this.renderPrompts();
            await this.renderContexts();
            await this.renderFolders('prompt');
            await this.renderFolders('context');

            // ダッシュボードが表示されている場合は更新
            if (this.currentTab === 'dashboard') {
                await this.renderDashboard();
            }

            this.showToast(`プロジェクト「${this.currentProject.name}」に切り替えました`);
        } catch (error) {
            console.error('Failed to switch project:', error);
            this.showToast('プロジェクトの切り替えに失敗しました', 'error');
        }
    }

    // プロジェクトモーダルを開く
    openProjectModal(projectId = null) {
        const modal = document.getElementById('project-modal');
        const modalTitle = document.getElementById('project-modal-title');
        const form = document.getElementById('project-form');

        if (projectId) {
            // 編集モード
            this.editingProject = projectId;
            modalTitle.textContent = 'プロジェクトを編集';
            this.loadProjectData(projectId);
        } else {
            // 新規作成モード
            this.editingProject = null;
            modalTitle.textContent = '新規プロジェクト';
            form.reset();
            document.getElementById('project-status').value = 'active';
            document.getElementById('project-priority').value = 'medium';
            document.getElementById('project-start-date').value = new Date().toISOString().split('T')[0];
        }

        modal.style.display = 'flex';
    }

    // プロジェクトデータをフォームに読み込む
    async loadProjectData(projectId) {
        const project = await this.projectsManager.findById(projectId);
        if (!project) return;

        document.getElementById('project-name').value = project.name;
        document.getElementById('project-description').value = project.description || '';
        document.getElementById('project-status').value = project.status;
        document.getElementById('project-priority').value = project.priority;
        document.getElementById('project-start-date').value = project.startDate || '';
        document.getElementById('project-target-end-date').value = project.targetEndDate || '';
        document.getElementById('project-stakeholders').value = project.stakeholders.join(', ');
        document.getElementById('project-budget').value = project.metadata.budget || '';
        document.getElementById('project-team').value = project.metadata.team.join(', ');
        document.getElementById('project-technologies').value = project.metadata.technologies.join(', ');
    }

    // プロジェクトを保存
    async saveProject(e) {
        e.preventDefault();

        const formData = {
            name: document.getElementById('project-name').value.trim(),
            description: document.getElementById('project-description').value.trim(),
            status: document.getElementById('project-status').value,
            priority: document.getElementById('project-priority').value,
            startDate: document.getElementById('project-start-date').value || null,
            targetEndDate: document.getElementById('project-target-end-date').value || null,
            actualEndDate: null,
            stakeholders: document.getElementById('project-stakeholders').value.split(',').map(s => s.trim()).filter(s => s),
            metadata: {
                budget: document.getElementById('project-budget').value.trim(),
                team: document.getElementById('project-team').value.split(',').map(s => s.trim()).filter(s => s),
                technologies: document.getElementById('project-technologies').value.split(',').map(s => s.trim()).filter(s => s)
            }
        };

        try {
            if (this.editingProject) {
                // 更新
                await this.projectsManager.update(this.editingProject, formData);
                this.showToast('プロジェクトを更新しました');

                // 編集中のプロジェクトがアクティブプロジェクトの場合は再読み込み
                if (this.editingProject === this.currentProject.id) {
                    this.currentProject = await this.projectsManager.findById(this.editingProject);
                }
            } else {
                // 新規作成
                await this.projectsManager.add(formData);
                this.showToast('プロジェクトを作成しました');
            }

            await this.updateProjectSelector();
            this.closeModal('project-modal');
        } catch (error) {
            console.error('Failed to save project:', error);
            this.showToast('プロジェクトの保存に失敗しました', 'error');
        }
    }

    // プロジェクト一覧モーダルを開く
    async openProjectsListModal() {
        const modal = document.getElementById('projects-list-modal');
        modal.style.display = 'flex';
        await this.renderProjectsList();
    }

    // プロジェクト一覧をレンダリング
    async renderProjectsList(filterStatus = 'all', searchQuery = '') {
        const projectsList = document.getElementById('projects-list');
        let projects = await this.projectsManager.getAll();

        // ステータスフィルタ
        if (filterStatus !== 'all') {
            projects = projects.filter(p => p.status === filterStatus);
        }

        // 検索フィルタ
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            projects = projects.filter(p =>
                p.name.toLowerCase().includes(query) ||
                (p.description && p.description.toLowerCase().includes(query))
            );
        }

        if (projects.length === 0) {
            projectsList.innerHTML = '<div style="text-align: center; padding: 2rem; color: #6b7280;">プロジェクトがありません</div>';
            return;
        }

        projectsList.innerHTML = projects.map(project => `
            <div class="project-item" data-project-id="${project.id}">
                <div class="project-item-main">
                    <div class="project-item-header">
                        <h3 class="project-item-title">${this.escapeHtml(project.name)}</h3>
                        <span class="status-badge status-${project.status}">${this.getStatusLabel(project.status)}</span>
                        <span class="priority-badge priority-${project.priority}">${this.getPriorityLabel(project.priority)}</span>
                    </div>
                    <p class="project-item-description">${this.escapeHtml(project.description || '')}</p>
                    <div class="project-item-meta">
                        <span>開始: ${project.startDate || '未設定'}</span>
                        ${project.targetEndDate ? `<span>目標: ${project.targetEndDate}</span>` : ''}
                        ${project.stakeholders.length > 0 ? `<span>関係者: ${project.stakeholders.length}名</span>` : ''}
                    </div>
                </div>
                <div class="project-item-actions">
                    <button class="btn btn-small" onclick="app.switchProject('${project.id}'); app.closeModal('projects-list-modal');">選択</button>
                    <button class="btn btn-small btn-secondary" onclick="app.openProjectModal('${project.id}');">編集</button>
                    ${project.id !== 'default-project' ? `<button class="btn btn-small btn-danger" onclick="app.deleteProject('${project.id}');">削除</button>` : ''}
                </div>
            </div>
        `).join('');
    }

    // プロジェクトを削除
    async deleteProject(projectId) {
        if (projectId === 'default-project') {
            this.showToast('デフォルトプロジェクトは削除できません', 'error');
            return;
        }

        if (projectId === this.currentProject.id) {
            this.showToast('現在アクティブなプロジェクトは削除できません', 'error');
            return;
        }

        if (!confirm('このプロジェクトを削除してもよろしいですか?')) return;

        try {
            await this.projectsManager.delete(projectId);
            await this.renderProjectsList();
            this.showToast('プロジェクトを削除しました');
        } catch (error) {
            console.error('Failed to delete project:', error);
            this.showToast('プロジェクトの削除に失敗しました', 'error');
        }
    }

    // ダッシュボードをレンダリング
    async renderDashboard() {
        if (!this.currentProject) return;

        // デバッグ: 既存データのマイグレーション確認
        await this.migrateExistingDataToProject();

        // 統計情報を取得
        const stats = await this.projectsManager.getProjectStats(this.currentProject.id);
        console.log('Dashboard stats:', stats, 'Project:', this.currentProject.id);

        // 統計カードを更新
        document.getElementById('stat-prompts').textContent = stats.promptCount;
        document.getElementById('stat-contexts').textContent = stats.contextCount;
        document.getElementById('stat-folders').textContent = stats.folderCount;
        document.getElementById('stat-total').textContent = stats.totalItems;

        // プロジェクト情報を表示
        const projectInfo = document.getElementById('dashboard-project-info');
        projectInfo.innerHTML = `
            <h2>${this.escapeHtml(this.currentProject.name)}</h2>
            <p>${this.escapeHtml(this.currentProject.description || '')}</p>
            <div class="project-meta">
                <div class="meta-item">
                    <div class="meta-label">ステータス</div>
                    <div class="meta-value">
                        <span class="status-badge status-${this.currentProject.status}">${this.getStatusLabel(this.currentProject.status)}</span>
                    </div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">優先度</div>
                    <div class="meta-value">
                        <span class="priority-badge priority-${this.currentProject.priority}">${this.getPriorityLabel(this.currentProject.priority)}</span>
                    </div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">開始日</div>
                    <div class="meta-value">${this.currentProject.startDate || '未設定'}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">目標終了日</div>
                    <div class="meta-value">${this.currentProject.targetEndDate || '未設定'}</div>
                </div>
            </div>
        `;

        // 最近の更新を表示
        await this.renderRecentActivity();
    }

    // 最近の更新をレンダリング
    async renderRecentActivity() {
        const recentList = document.getElementById('recent-items-list');
        const prompts = await this.promptsManager.findByProject(this.currentProject.id);
        const contexts = await this.contextsManager.findByProject(this.currentProject.id);

        const allItems = [
            ...prompts.map(p => ({ ...p, type: 'prompt' })),
            ...contexts.map(c => ({ ...c, type: 'context' }))
        ];

        // 更新日時でソート
        allItems.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        // 最新10件
        const recent = allItems.slice(0, 10);

        if (recent.length === 0) {
            recentList.innerHTML = '<div style="text-align: center; padding: 2rem; color: #6b7280;">まだアイテムがありません</div>';
            return;
        }

        recentList.innerHTML = recent.map(item => `
            <div class="recent-item">
                <div class="recent-item-info">
                    <h4>${this.escapeHtml(item.title)}</h4>
                    <div class="recent-item-meta">
                        ${item.type === 'prompt' ? 'プロンプト' : 'コンテキスト'} • ${this.formatDate(item.updatedAt)}
                    </div>
                </div>
                <button class="btn btn-small" onclick="app.openPreviewModal('${item.id}', '${item.type}');">表示</button>
            </div>
        `).join('');
    }

    // ステータスラベル
    getStatusLabel(status) {
        const labels = {
            'planning': '計画中',
            'active': '進行中',
            'on-hold': '保留',
            'completed': '完了',
            'archived': 'アーカイブ'
        };
        return labels[status] || status;
    }

    // 優先度ラベル
    getPriorityLabel(priority) {
        const labels = {
            'high': '高',
            'medium': '中',
            'low': '低'
        };
        return labels[priority] || priority;
    }

    // Phase 3: 既存データを現在のプロジェクトに移行
    async migrateExistingDataToProject() {
        if (!this.currentProject) {
            console.warn('No current project for migration');
            return;
        }

        console.log('🔄 Starting migration to project:', this.currentProject.id);

        // プロンプトのマイグレーション
        const prompts = await this.promptsManager.getAll();
        console.log('📊 Total prompts in DB:', prompts.length);
        let migratedCount = 0;

        for (const prompt of prompts) {
            if (!prompt.projectId) {
                console.log('  ➡️ Migrating prompt:', prompt.id, prompt.title);
                await this.promptsManager.update(prompt.id, {
                    projectId: this.currentProject.id
                });
                migratedCount++;
            } else {
                console.log('  ✅ Prompt already has projectId:', prompt.id, prompt.projectId);
            }
        }

        // コンテキストのマイグレーション
        const contexts = await this.contextsManager.getAll();
        console.log('📊 Total contexts in DB:', contexts.length);
        for (const context of contexts) {
            if (!context.projectId) {
                console.log('  ➡️ Migrating context:', context.id, context.title);
                await this.contextsManager.update(context.id, {
                    projectId: this.currentProject.id
                });
                migratedCount++;
            } else {
                console.log('  ✅ Context already has projectId:', context.id, context.projectId);
            }
        }

        // フォルダのマイグレーション
        const folders = await this.foldersManager.getAll();
        console.log('📊 Total folders in DB:', folders.length);
        for (const folder of folders) {
            if (!folder.projectId) {
                console.log('  ➡️ Migrating folder:', folder.id, folder.name);
                await this.foldersManager.update(folder.id, {
                    projectId: this.currentProject.id
                });
                migratedCount++;
            } else {
                console.log('  ✅ Folder already has projectId:', folder.id, folder.projectId);
            }
        }

        console.log(`✅ Migration complete. Migrated ${migratedCount} items to project ${this.currentProject.id}`);
    }
}

// ========================================
// アプリケーション起動
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    window.app = new CognishelfApp();
    await window.app.init();
});
