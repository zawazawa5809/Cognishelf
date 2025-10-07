// ========================================
// データモデル
// ========================================

class StorageManager {
    constructor(key) {
        this.key = key;
    }

    getAll() {
        const data = localStorage.getItem(this.key);
        return data ? JSON.parse(data) : [];
    }

    save(items) {
        localStorage.setItem(this.key, JSON.stringify(items));
    }

    add(item) {
        const items = this.getAll();
        item.id = this.generateId();
        item.createdAt = new Date().toISOString();
        item.updatedAt = new Date().toISOString();
        items.push(item);
        this.save(items);
        return item;
    }

    update(id, updatedData) {
        const items = this.getAll();
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

    delete(id) {
        const items = this.getAll();
        const filtered = items.filter(item => item.id !== id);
        this.save(filtered);
        return filtered.length < items.length;
    }

    findById(id) {
        const items = this.getAll();
        return items.find(item => item.id === id);
    }

    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

// ========================================
// アプリケーション状態
// ========================================

class CognishelfApp {
    constructor() {
        this.promptsManager = new StorageManager('cognishelf-prompts');
        this.contextsManager = new StorageManager('cognishelf-contexts');
        this.foldersManager = new StorageManager('cognishelf-folders');
        this.currentTab = 'prompts';
        this.editingItem = null;
        this.editingType = null;
        this.currentPromptSort = 'date-desc';
        this.currentContextSort = 'date-desc';
        this.currentPromptFolder = null; // null = 全表示
        this.currentContextFolder = null;
        this.previewItem = null;
        this.previewType = null;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeSampleData();
        this.renderFolders('prompt');
        this.renderFolders('context');
        this.renderPrompts();
        this.renderContexts();
    }

    initializeSampleData() {
        // サンプルデータを追加(初回のみ)
        if (this.promptsManager.getAll().length === 0) {
            this.promptsManager.add({
                title: '要約プロンプト',
                content: '以下のテキストを3つの要点にまとめてください:\n\n[テキストをここに貼り付け]',
                tags: ['要約', '分析']
            });
            this.promptsManager.add({
                title: 'コード説明',
                content: '以下のコードを詳しく解説してください。各行の役割と全体の動作を説明してください:\n\n```\n[コードをここに貼り付け]\n```',
                tags: ['プログラミング', '解説']
            });
        }

        if (this.contextsManager.getAll().length === 0) {
            this.contextsManager.add({
                title: 'プロジェクト概要',
                content: 'このプロジェクトは、プロンプトエンジニアリングとコンテキストエンジニアリングを組み合わせたツールです。\n\n主な機能:\n- プロンプトの保存と管理\n- コンテキストの蓄積\n- ワンクリックコピー',
                category: 'プロジェクト'
            });
        }

        this.renderPrompts();
        this.renderContexts();
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

    renderPrompts(items = null) {
        let prompts = items || this.promptsManager.getAll();

        // フォルダフィルタ適用
        if (this.currentPromptFolder === 'uncategorized') {
            prompts = prompts.filter(p => !p.folder);
        } else if (this.currentPromptFolder) {
            prompts = this.filterByFolder(prompts, this.currentPromptFolder);
        }

        prompts = this.sortItems(prompts, this.currentPromptSort);

        const grid = document.getElementById('prompts-grid');

        if (prompts.length === 0) {
            grid.innerHTML = this.renderEmptyState('', 'プロンプトがありません', '新規プロンプトを追加してください');
            return;
        }

        grid.innerHTML = prompts.map(prompt => this.createPromptCard(prompt)).join('');

        // イベントリスナーを追加
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

    openPromptModal(promptId = null) {
        const modal = document.getElementById('prompt-modal');
        const title = document.getElementById('prompt-modal-title');
        const form = document.getElementById('prompt-form');

        if (promptId) {
            const prompt = this.promptsManager.findById(promptId);
            if (prompt) {
                title.textContent = 'プロンプトを編集';
                document.getElementById('prompt-title').value = prompt.title;
                document.getElementById('prompt-content').value = prompt.content;
                document.getElementById('prompt-tags').value = prompt.tags ? prompt.tags.join(', ') : '';

                // フォルダ名取得
                if (prompt.folder) {
                    const folder = this.foldersManager.findById(prompt.folder);
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

    savePrompt() {
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
            const folder = this.getOrCreateFolder(folderName, 'prompt');
            promptData.folder = folder.id;
        }

        if (this.editingItem) {
            this.promptsManager.update(this.editingItem, promptData);
            this.showToast('プロンプトを更新しました', 'success');
        } else {
            this.promptsManager.add(promptData);
            this.showToast('プロンプトを追加しました', 'success');
        }

        this.renderFolders('prompt');
        this.renderPrompts();
        this.closeAllModals();
    }

    searchPrompts(query) {
        const prompts = this.promptsManager.getAll();
        const filtered = prompts.filter(prompt => {
            const searchStr = `${prompt.title} ${prompt.content} ${prompt.tags?.join(' ')}`.toLowerCase();
            return searchStr.includes(query.toLowerCase());
        });
        this.renderPrompts(filtered);
    }

    // ========================================
    // コンテキスト管理
    // ========================================

    renderContexts(items = null) {
        let contexts = items || this.contextsManager.getAll();

        // フォルダフィルタ適用
        if (this.currentContextFolder === 'uncategorized') {
            contexts = contexts.filter(c => !c.folder);
        } else if (this.currentContextFolder) {
            contexts = this.filterByFolder(contexts, this.currentContextFolder);
        }

        contexts = this.sortItems(contexts, this.currentContextSort);

        const grid = document.getElementById('contexts-grid');

        if (contexts.length === 0) {
            grid.innerHTML = this.renderEmptyState('', 'コンテキストがありません', '新規コンテキストを追加してください');
            return;
        }

        grid.innerHTML = contexts.map(context => this.createContextCard(context)).join('');

        // イベントリスナーを追加
        this.attachCardEventListeners('context');
    }

    createContextCard(context) {
        const category = context.category ?
            `<span class="tag">${this.escapeHtml(context.category)}</span>` :
            '';

        return `
            <div class="card" data-id="${context.id}" data-type="context">
                <div class="card-header">
                    <h3 class="card-title">${this.escapeHtml(context.title)}</h3>
                    <div class="card-meta">${this.formatDate(context.createdAt)}</div>
                </div>
                <div class="card-content markdown-content">${this.renderMarkdown(context.content)}</div>
                ${category ? `<div class="card-tags">${category}</div>` : ''}
                <div class="card-actions">
                    <button class="btn btn-small btn-success copy-btn" data-id="${context.id}" data-type="context">
                        コピー
                    </button>
                </div>
            </div>
        `;
    }

    openContextModal(contextId = null) {
        const modal = document.getElementById('context-modal');
        const title = document.getElementById('context-modal-title');
        const form = document.getElementById('context-form');

        if (contextId) {
            const context = this.contextsManager.findById(contextId);
            if (context) {
                title.textContent = 'コンテキストを編集';
                document.getElementById('context-title').value = context.title;
                document.getElementById('context-content').value = context.content;
                document.getElementById('context-category').value = context.category || '';

                // フォルダ名取得
                if (context.folder) {
                    const folder = this.foldersManager.findById(context.folder);
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

    saveContext() {
        const title = document.getElementById('context-title').value.trim();
        const content = document.getElementById('context-content').value.trim();
        const category = document.getElementById('context-category').value.trim();
        const folderName = document.getElementById('context-folder').value.trim();

        if (!title || !content) {
            this.showToast('タイトルと内容は必須です', 'error');
            return;
        }

        const contextData = { title, content, category };

        // フォルダ処理
        if (folderName) {
            const folder = this.getOrCreateFolder(folderName, 'context');
            contextData.folder = folder.id;
        }

        if (this.editingItem) {
            this.contextsManager.update(this.editingItem, contextData);
            this.showToast('コンテキストを更新しました', 'success');
        } else {
            this.contextsManager.add(contextData);
            this.showToast('コンテキストを追加しました', 'success');
        }

        this.renderFolders('context');
        this.renderContexts();
        this.closeAllModals();
    }

    searchContexts(query) {
        const contexts = this.contextsManager.getAll();
        const filtered = contexts.filter(context => {
            const searchStr = `${context.title} ${context.content} ${context.category || ''}`.toLowerCase();
            return searchStr.includes(query.toLowerCase());
        });
        this.renderContexts(filtered);
    }

    // ========================================
    // 共通機能
    // ========================================

    getFolders(type) {
        const allFolders = this.foldersManager.getAll();
        return allFolders.filter(f => f.type === type);
    }

    getOrCreateFolder(name, type) {
        const folders = this.getFolders(type);
        let folder = folders.find(f => f.name === name);

        if (!folder) {
            folder = this.foldersManager.add({ name, type });
        }

        return folder;
    }

    filterByFolder(items, folderId) {
        if (!folderId) return items;
        return items.filter(item => item.folder === folderId);
    }

    renderFolders(type) {
        const folders = this.getFolders(type);
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

    copyToClipboard(id, type) {
        const manager = type === 'prompt' ? this.promptsManager : this.contextsManager;
        const item = manager.findById(id);

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

    deleteItem(id, type) {
        if (!confirm('本当に削除しますか?')) {
            return;
        }

        const manager = type === 'prompt' ? this.promptsManager : this.contextsManager;
        const success = manager.delete(id);

        if (success) {
            this.showToast('削除しました', 'success');
            if (type === 'prompt') {
                this.renderPrompts();
            } else {
                this.renderContexts();
            }
        } else {
            this.showToast('削除に失敗しました', 'error');
        }
    }

    openPreviewModal(id, type) {
        const manager = type === 'prompt' ? this.promptsManager : this.contextsManager;
        const item = manager.findById(id);

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

        if (type === 'prompt' && item.tags && item.tags.length > 0) {
            metaInfo.push(`タグ: ${item.tags.join(', ')}`);
        }

        if (type === 'context' && item.category) {
            metaInfo.push(`カテゴリ: ${item.category}`);
        }

        if (item.folder) {
            const folder = this.foldersManager.findById(item.folder);
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
}

// ========================================
// アプリケーション起動
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    window.app = new CognishelfApp();
});
