// ========================================
// データモデル
// ========================================

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
    constructor(dbName, storeName, version = 1) {
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
                const manager = new IndexedDBManager('cognishelf-db', storeName, 1);
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
        this.currentTab = 'prompts';
        this.editingItem = null;
        this.editingType = null;
        this.currentPromptSort = 'date-desc';
        this.currentContextSort = 'date-desc';
        this.currentPromptFolder = null; // null = 全表示
        this.currentContextFolder = null;
        this.previewItem = null;
        this.previewType = null;
    }

    async init() {
        try {
            // ストレージマネージャーの初期化
            this.promptsManager = await StorageAdapter.createManager('prompts', 'cognishelf-prompts');
            this.contextsManager = await StorageAdapter.createManager('contexts', 'cognishelf-contexts');
            this.foldersManager = await StorageAdapter.createManager('folders', 'cognishelf-folders');

            this.setupEventListeners();
            await this.initializeSampleData();
            await this.renderFolders('prompt');
            await this.renderFolders('context');
            await this.renderPrompts();
            await this.renderContexts();

            console.log('Cognishelf initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Cognishelf:', error);
            this.showToast('アプリケーションの初期化に失敗しました', 'error');
        }
    }

    async initializeSampleData() {
        // サンプルデータを追加(初回のみ)
        const prompts = await this.promptsManager.getAll();
        if (prompts.length === 0) {
            const promptSamples = [
                {
                    title: '週次ステータスレポート作成プロンプト',
                    content: '以下のプロジェクト状況をもとに経営層向けの週次ステータスレポートを作成してください。\n\n【入力情報】\n- 進捗率: [数値]\n- 主要成果物: [内容]\n- 課題/リスク: [箇条書き]\n- 次週計画: [箇条書き]\n\n【出力フォーマット】\n1. 今週のハイライト\n2. スケジュール状況\n3. リスクと対策\n4. サポート依頼事項',
                    tags: ['ステータス報告', '経営層', 'コミュニケーション']
                },
                {
                    title: '日次スタンドアップ要約プロンプト',
                    content: '以下の開発チームからの報告を要約し、PMの観点で必要なフォローアップを整理してください。\n\n【入力】\n- 昨日やったこと\n- 今日やること\n- 困っていること\n\n【出力】\n1. チーム全体の進捗サマリー\n2. ボトルネックと支援依頼\n3. リスク兆候と対応策',
                    tags: ['スクラム', 'チーム運営', 'コミュニケーション']
                },
                {
                    title: 'リスク登録票記述プロンプト',
                    content: '以下の情報を整理してプロジェクトリスク登録票のエントリを作成してください。\n\n【入力】\n- リスク概要\n- 発生確率(高/中/低)\n- 影響度(高/中/低)\n- 兆候\n- 対応策案\n\n【出力】\n- リスクID\n- タイトル\n- 詳細説明\n- 予防策\n- 影響軽減策\n- オーナー\n- レビュー期日',
                    tags: ['リスク管理', 'ガバナンス', '文書化']
                },
                {
                    title: '変更要求評価プロンプト',
                    content: '以下の変更要求情報をもとに、影響分析と意思決定に必要なサマリーを作成してください。\n\n【入力】\n- 変更概要\n- 目的\n- 影響範囲(スコープ/コスト/スケジュール/品質)\n- 関係者\n- 緊急度\n\n【出力】\n1. 変更内容要約\n2. 影響分析\n3. 推奨対応(承認/保留/却下)\n4. 次のアクション',
                    tags: ['変更管理', '意思決定', '分析']
                },
                {
                    title: 'ステークホルダー向け状況共有メール',
                    content: '以下のトピックを踏まえ、主要ステークホルダーに送る状況共有メールのドラフトを作成してください。\n\n【入力】\n- 最新進捗\n- ハイライト\n- 懸念事項\n- 次の予定\n\n【出力】\n- 件名案\n- 本文(挨拶/本文/締め)\n- 添付推奨資料',
                    tags: ['コミュニケーション', 'メール', 'ステークホルダー']
                },
                {
                    title: '重大課題エスカレーションメッセージ',
                    content: '以下の重大課題について、エスカレーションメッセージを作成してください。\n\n【入力】\n- 課題内容\n- ビジネス影響\n- 発生日\n- 対応状況\n- 必要な意思決定\n\n【出力】\n- 宛先候補\n- メッセージ本文\n- 期待するアクションと期限',
                    tags: ['課題管理', 'コミュニケーション', '意思決定']
                },
                {
                    title: 'スプリントレビュー招待文',
                    content: '次回スプリントレビューの招待文を作成してください。\n\n【入力】\n- スプリント番号\n- 日時/場所\n- 主な成果物\n- デモ担当者\n- 期待する参加者\n\n【出力】\n- 目的説明\n- アジェンダ\n- 準備依頼事項\n- 参加登録の案内',
                    tags: ['スクラム', '会議', '招待']
                },
                {
                    title: 'レトロスペクティブ質問セット生成',
                    content: '以下のスプリント振り返りテーマをもとに、チームの内省を促す質問セットを作成してください。\n\n【入力】\n- 成功した点\n- 課題\n- 改善したい領域\n\n【出力】\n- 事実の把握を促す質問\n- 洞察を深める質問\n- 改善アクションを引き出す質問',
                    tags: ['スクラム', 'ファシリテーション', '改善']
                },
                {
                    title: '要件確認ワークショップアジェンダ',
                    content: '要件確認ワークショップのアジェンダを作成してください。\n\n【入力】\n- 対象機能\n- 参加者一覧\n- 目的\n- 予定時間\n\n【出力】\n- オープニング\n- 各セッションの目的と時間配分\n- 決定事項の記録方法\n- 期待するアウトプット',
                    tags: ['要件定義', '会議設計', 'ファシリテーション']
                },
                {
                    title: 'UIレビュー依頼メッセージ',
                    content: 'UXチームにUIレビューを依頼するメッセージを作成してください。\n\n【入力】\n- 対象画面\n- レビュー観点\n- 期日\n- 提供資料\n\n【出力】\n- 挨拶\n- 背景と目的説明\n- レビュー依頼事項\n- 添付/リンク案内',
                    tags: ['UI', 'レビュー', 'コミュニケーション']
                },
                {
                    title: 'ベンダー進捗確認メール',
                    content: '外部ベンダーへの進捗確認メールを作成してください。\n\n【入力】\n- 契約範囲\n- 現在の成果物ステータス\n- 懸念事項\n- 期待する回答内容\n\n【出力】\n- 件名\n- 本文(背景/現状把握/アクション依頼)\n- 回答期限',
                    tags: ['ベンダー管理', 'コミュニケーション', '契約']
                },
                {
                    title: 'テスト計画レビュー依頼文',
                    content: 'QAリーダーに送るテスト計画レビュー依頼文を作成してください。\n\n【入力】\n- テスト対象\n- スケジュール\n- 特に見てほしい観点\n- 提出期限\n\n【出力】\n- 概要説明\n- レビュー観点の明示\n- レビュー期限\n- フィードバック方法',
                    tags: ['テスト', '品質管理', 'コミュニケーション']
                },
                {
                    title: '欠陥報告整理プロンプト',
                    content: '以下の欠陥情報をまとめ、意思決定に必要な観点で整理してください。\n\n【入力】\n- 欠陥ID\n- 発生環境\n- 再現手順\n- 影響範囲\n- 暫定対応\n\n【出力】\n- 重大度評価\n- 影響評価\n- 推奨対応優先度\n- 連絡すべきステークホルダー',
                    tags: ['欠陥管理', '品質', '優先度']
                },
                {
                    title: '本番リリース承認依頼テンプレート',
                    content: '本番リリース承認を上申する際のテンプレートを生成してください。\n\n【入力】\n- リリース対象\n- 変更点\n- テスト結果概要\n- ロールバック手順\n- 関係者\n\n【出力】\n- 件名\n- 要約\n- リスクと対策\n- 承認依頼事項',
                    tags: ['リリース管理', '承認', 'ガバナンス']
                },
                {
                    title: 'デプロイ準備チェックアナウンス',
                    content: '本番デプロイ前の準備状況をチームに周知するアナウンス文を作成してください。\n\n【入力】\n- デプロイ日時\n- 影響範囲\n- 必要な事前確認\n- サポート体制\n\n【出力】\n- 背景説明\n- チェックリスト\n- 連絡先\n- 直前のタイムライン',
                    tags: ['リリース管理', '運用', 'コミュニケーション']
                },
                {
                    title: 'サービス影響アセスメントプロンプト',
                    content: '以下の変更案に対するサービス影響アセスメントを作成してください。\n\n【入力】\n- 対象システム\n- ユーザーセグメント\n- 機能変更内容\n- 想定リリース時期\n\n【出力】\n- 影響範囲まとめ\n- 顧客影響評価\n- 運用影響\n- 推奨コミュニケーション',
                    tags: ['影響分析', '顧客対応', '変更管理']
                },
                {
                    title: 'コスト変動分析レポート作成',
                    content: '以下の原価情報をもとにコスト変動分析レポートを作成してください。\n\n【入力】\n- 予算値\n- 実績値\n- 差異理由\n- 是正策案\n\n【出力】\n- サマリー\n- 差異分析(表形式)\n- 是正アクション\n- 次回レビュー予定',
                    tags: ['コスト管理', '報告', '分析']
                },
                {
                    title: 'キャパシティ計画サマリー生成',
                    content: '以下のリソース情報をまとめ、来月のキャパシティ計画サマリーを作成してください。\n\n【入力】\n- メンバー一覧と稼働率\n- 休暇予定\n- 新規タスク量\n- 制約事項\n\n【出力】\n- リソース状況概況\n- 逼迫領域\n- 調整案\n- 依頼事項',
                    tags: ['リソース管理', '計画', '分析']
                },
                {
                    title: 'リソース割当調整依頼文',
                    content: 'マネージャーに送るリソース割当調整依頼文を作成してください。\n\n【入力】\n- 必要スキル\n- 期間\n- 背景\n- 緊急度\n\n【出力】\n- 依頼概要\n- 期待する成果\n- 期間と稼働率\n- 次のステップ',
                    tags: ['リソース管理', 'コミュニケーション', '調整']
                },
                {
                    title: '契約更新交渉準備プロンプト',
                    content: '以下の契約情報をもとに、更新交渉のための準備メモを作成してください。\n\n【入力】\n- 現行契約条件\n- ベンダーパフォーマンス評価\n- 改善点\n- 想定交渉論点\n\n【出力】\n- 交渉目標\n- BATNA(代替案)\n- 想定反論と対応\n- 次回アクション',
                    tags: ['契約管理', '交渉', '戦略']
                },
                {
                    title: 'SLA逸脱報告テンプレート',
                    content: 'SLA逸脱を報告するテンプレートを作成してください。\n\n【入力】\n- 逸脱内容\n- 影響範囲\n- 原因\n- 是正策\n- 再発防止策\n\n【出力】\n- サマリー\n- 詳細報告\n- 顧客対応状況\n- 対応計画',
                    tags: ['SLA', '品質', 'レポート']
                },
                {
                    title: 'KPI定例報告コメント生成',
                    content: '以下のKPIデータをもとに、定例会議で説明するためのコメントを生成してください。\n\n【入力】\n- KPI指標名と値\n- 前回比の変化\n- 変動理由\n- 施策状況\n\n【出力】\n- 指標サマリー\n- ポジティブポイント\n- 課題とアクション\n- 依頼事項',
                    tags: ['KPI', '報告', '分析']
                },
                {
                    title: 'セキュリティインシデント初動ガイド',
                    content: '以下のインシデント概要をもとに初動対応ガイドを作成してください。\n\n【入力】\n- 事象概要\n- 発生日時\n- 影響範囲\n- 現在の封じ込め状況\n\n【出力】\n- 重大度評価\n- 連絡すべきステークホルダー\n- 最優先タスク\n- コミュニケーションメッセージ案',
                    tags: ['セキュリティ', 'インシデント', '初動対応']
                },
                {
                    title: 'バックログ優先順位付け支援プロンプト',
                    content: '以下のプロダクトバックログ情報を基に、優先順位付けの提案を作成してください。\n\n【入力】\n- アイテム一覧(価値/コスト/リスク)\n- 期限や制約\n- 利害関係者の要望\n\n【出力】\n- 優先順位リスト\n- 判断理由\n- トレードオフの提示',
                    tags: ['プロダクト管理', '優先度', 'ロードマップ']
                },
                {
                    title: 'ナレッジ共有要約プロンプト',
                    content: '以下の学習内容をまとめ、チーム向けナレッジ共有資料の要約を作成してください。\n\n【入力】\n- 学習トピック\n- 得られた知見\n- 適用アイデア\n\n【出力】\n- 背景\n- 主なポイント\n- 推奨アクション\n- 参考リンク',
                    tags: ['ナレッジ管理', '教育', '共有']
                },
                {
                    title: '教育研修案内メッセージ',
                    content: 'チームメンバー向け教育研修案内を作成してください。\n\n【入力】\n- 研修テーマ\n- 目的\n- 実施日時\n- 事前準備\n\n【出力】\n- 案内文\n- 期待効果\n- 参加登録方法\n- 問い合わせ先',
                    tags: ['教育', 'コミュニケーション', '人材育成']
                },
                {
                    title: '新メンバーオンボーディングタスク説明',
                    content: '新規参画メンバーに共有するオンボーディングタスク説明文を作成してください。\n\n【入力】\n- プロジェクト概要\n- 初週に完了してほしいタスク\n- 主要連絡先\n- 利用ツール\n\n【出力】\n- ウェルカムメッセージ\n- タスク一覧と期限\n- サポートリソース\n- チェックイン予定',
                    tags: ['オンボーディング', '人材管理', 'コミュニケーション']
                },
                {
                    title: 'データ移行リスク説明文生成',
                    content: 'データ移行計画に関するリスクを非技術系ステークホルダーに説明する文章を作成してください。\n\n【入力】\n- 移行対象データ\n- 依存関係\n- 想定リスク\n- 緩和策\n\n【出力】\n- 平易な説明\n- 影響の例示\n- 対応計画\n- サポートのお願い',
                    tags: ['データ移行', 'リスク管理', 'コミュニケーション']
                },
                {
                    title: 'システム切替コミュニケーション計画案',
                    content: '本番切替に向けたコミュニケーション計画案を作成してください。\n\n【入力】\n- 切替日程\n- 対象ユーザー\n- 影響内容\n- 連絡チャネル\n\n【出力】\n- メッセージのタイムライン\n- 各チャネルでの伝達内容\n- FAQ候補\n- フォローアップ手順',
                    tags: ['リリース管理', 'コミュニケーション', '計画']
                },
                {
                    title: 'クライアントデモ脚本生成',
                    content: 'クライアント向けシステムデモの脚本を作成してください。\n\n【入力】\n- デモの目的\n- 重点機能\n- 参加者の関心事項\n- デモ時間\n\n【出力】\n- オープニングトーク\n- デモの流れと時間配分\n- 質疑応答のトピック\n- クロージングメッセージ',
                    tags: ['プレゼンテーション', 'クライアント対応', 'デモ']
                },
                {
                    title: 'UATシナリオレビューコメント',
                    content: '以下のUATシナリオ情報をもとに、レビューコメントをまとめてください。\n\n【入力】\n- シナリオ目的\n- 手順概要\n- 成功基準\n- 既知の制約\n\n【出力】\n- カバレッジ評価\n- 追加が必要な観点\n- ステークホルダー連携事項\n- 次のアクション',
                    tags: ['UAT', '品質', 'レビュー']
                },
                {
                    title: '保守引継ぎチェックリスト生成',
                    content: '開発から保守への引継ぎに必要なチェックリストを作成してください。\n\n【入力】\n- システム概要\n- 運用体制\n- 必要ドキュメント\n- サポート時間帯\n\n【出力】\n- 引継ぎ前確認項目\n- ドキュメント整備状況\n- トレーニング計画\n- 残課題',
                    tags: ['移行', '運用', 'チェックリスト']
                },
                {
                    title: 'サービスデスク連絡テンプレート',
                    content: 'サービスデスクに障害情報を共有する際のテンプレートを生成してください。\n\n【入力】\n- 障害概要\n- 影響範囲\n- 暫定対応\n- 必要な支援\n\n【出力】\n- 件名\n- 連絡内容\n- エスカレーション基準\n- 連絡先',
                    tags: ['サポート', 'インシデント', 'コミュニケーション']
                },
                {
                    title: 'KPIダッシュボード解釈補助プロンプト',
                    content: '以下のダッシュボードデータをもとに、ステークホルダー向けの解釈コメントを生成してください。\n\n【入力】\n- 指標名称と値\n- 傾向グラフ説明\n- 閾値/目標\n\n【出力】\n- 状況要約\n- 影響の説明\n- 対応策\n- 次回確認ポイント',
                    tags: ['KPI', 'データ分析', 'コミュニケーション']
                },
                {
                    title: 'イシュークローズ報告メッセージ',
                    content: '以下の課題が完了した際に共有するクローズ報告メッセージを作成してください。\n\n【入力】\n- 課題概要\n- 対応内容\n- 得られた成果\n- 学び\n\n【出力】\n- 件名\n- 本文(結果/影響/今後のフォロー)\n- 添付資料案',
                    tags: ['課題管理', '報告', 'ナレッジ']
                },
                {
                    title: 'スケジュールリカバリープラン生成',
                    content: '以下の遅延状況をもとにスケジュールリカバリープランを作成してください。\n\n【入力】\n- 遅延の原因\n- 影響マイルストーン\n- 利用可能なリソース\n- 制約\n\n【出力】\n- リカバリー戦略\n- アクションプラン\n- リスクとモニタリング指標\n- コミュニケーション案',
                    tags: ['スケジュール管理', '計画', 'リスク']
                },
                {
                    title: 'ベロシティ分析コメント生成',
                    content: '以下のベロシティ履歴をもとに、チームへのフィードバックコメントを作成してください。\n\n【入力】\n- 過去数スプリントのベロシティ値\n- チームの変更点\n- 特記事項\n\n【出力】\n- トレンド分析\n- 改善提案\n- 次スプリントへの期待値',
                    tags: ['スクラム', 'パフォーマンス', '分析']
                },
                {
                    title: 'プロジェクト完了報告書要約',
                    content: 'プロジェクト完了報告書の要点をまとめたサマリーを作成してください。\n\n【入力】\n- 成果物一覧\n- KPI達成状況\n- 主要な成功要因\n- 学びと改善点\n\n【出力】\n- エグゼクティブサマリー\n- 成果ハイライト\n- 教訓\n- 今後への提言',
                    tags: ['終結', '報告', 'ナレッジ']
                },
                {
                    title: '意思決定ログ記録用プロンプト',
                    content: '以下の会議内容をもとに意思決定ログエントリを作成してください。\n\n【入力】\n- 議題\n- 決定事項\n- 賛成/反対理由\n- 次のアクション\n\n【出力】\n- 記録日時\n- 決定概要\n- 根拠\n- フォローアップ',
                    tags: ['ガバナンス', '会議', '記録']
                },
                {
                    title: 'ステークホルダーマッピング説明文',
                    content: 'ステークホルダーマップを説明する文章を作成してください。\n\n【入力】\n- 主要ステークホルダー\n- 関心度\n- 影響力\n- 現在の関係性\n\n【出力】\n- セグメント分け説明\n- コミュニケーション方針\n- リスクと機会\n- アクションプラン',
                    tags: ['ステークホルダー管理', '分析', 'コミュニケーション']
                },
                {
                    title: 'コミュニケーションプラン更新プロンプト',
                    content: '以下の変更要因を踏まえてコミュニケーションプランの更新案を作成してください。\n\n【入力】\n- 新たなステークホルダー\n- プロジェクト段階\n- 利用チャネル\n- 制約事項\n\n【出力】\n- 更新理由\n- チャネル別対応\n- メッセージ頻度\n- 成功指標',
                    tags: ['コミュニケーション', '計画', 'ステークホルダー管理']
                },
                {
                    title: '品質レビュー会議サマリー作成',
                    content: '品質レビュー会議のサマリーを作成してください。\n\n【入力】\n- 参加者\n- 議題\n- 指摘事項\n- 合意事項\n\n【出力】\n- 会議の背景\n- 主な議論ポイント\n- 決定事項\n- フォローアップタスク',
                    tags: ['品質管理', '会議', 'レポート']
                },
                {
                    title: 'テクニカルデット説明補助プロンプト',
                    content: 'テクニカルデットを非技術系役員に説明する文面を作成してください。\n\n【入力】\n- デット内容\n- ビジネス影響\n- 対応コスト\n- 実施タイミング\n\n【出力】\n- 平易な説明\n- リスク強調ポイント\n- 解消メリット\n- 要望事項',
                    tags: ['テクニカルデット', 'コミュニケーション', '説明']
                },
                {
                    title: 'プロジェクトビジョン再共有メッセージ',
                    content: 'チームにプロジェクトビジョンを再共有するメッセージを作成してください。\n\n【入力】\n- プロジェクトゴール\n- 期待される価値\n- 最新状況\n- 呼びかけたい行動\n\n【出力】\n- インスピレーショントーン\n- ビジョンの再確認\n- 具体的行動喚起\n- 感謝の言葉',
                    tags: ['ビジョン', 'チームビルディング', 'コミュニケーション']
                },
                {
                    title: 'シニアマネジメントQ&A準備メモ',
                    content: '経営会議で予想される質問と回答案を準備してください。\n\n【入力】\n- 発表テーマ\n- 懸念事項\n- サポートデータ\n\n【出力】\n- 想定質問\n- 回答骨子\n- 補足資料\n- 対応担当者',
                    tags: ['経営報告', '準備', 'コミュニケーション']
                },
                {
                    title: '監査対応資料作成プロンプト',
                    content: '以下の監査要求事項に基づき、提出資料のアウトラインを作成してください。\n\n【入力】\n- 要求事項\n- 対象期間\n- 必要証跡\n- 締切\n\n【出力】\n- 資料構成案\n- 収集すべき証跡\n- リスクと対応計画\n- スケジュール',
                    tags: ['監査', 'ガバナンス', '文書化']
                },
                {
                    title: 'パートナー連携計画案内文',
                    content: '外部パートナーと連携するための計画案内文を作成してください。\n\n【入力】\n- 連携目的\n- スコープ\n- 役割分担\n- スケジュール\n\n【出力】\n- 概要説明\n- 期待事項\n- コラボレーション方法\n- 次のマイルストーン',
                    tags: ['パートナーシップ', 'コミュニケーション', '計画']
                },
                {
                    title: 'PoC成果報告書作成プロンプト',
                    content: 'PoCの成果をまとめる報告書のドラフトを生成してください。\n\n【入力】\n- 実施背景\n- 検証項目\n- 成果と課題\n- 推奨判断\n\n【出力】\n- エグゼクティブサマリー\n- 詳細結果\n- 評価指標\n- 次のステップ',
                    tags: ['PoC', '評価', '報告']
                },
                {
                    title: 'インシデントポストモーテム作成支援',
                    content: '以下の障害情報をもとにポストモーテムレポートを作成してください。\n\n【入力】\n- 発生事象\n- タイムライン\n- 影響\n- 原因分析\n- 改善策\n\n【出力】\n- 概要\n- 詳細タイムライン\n- 根本原因\n- 是正/予防策',
                    tags: ['インシデント', '改善', 'レポート']
                },
                {
                    title: '予算承認プレゼン構成案',
                    content: '来期予算承認のためのプレゼン構成案を作成してください。\n\n【入力】\n- 投資目的\n- 期待効果\n- コスト内訳\n- リスクと対策\n\n【出力】\n- スライド構成\n- 強調すべきポイント\n- 想定質問と回答\n- 決裁者への訴求メッセージ',
                    tags: ['予算管理', 'プレゼン', '経営報告']
                }
            ];

            for (const sample of promptSamples) {
                await this.promptsManager.add(sample);
            }
        }

        const contexts = await this.contextsManager.getAll();
        if (contexts.length === 0) {
            const contextSamples = [
                {
                    title: '週次ステータスレポート骨子',
                    content: '週次ステータスレポートの章立て例です。\n\n1. 今週の成果サマリー\n2. スケジュール状況(計画比/遅延要因)\n3. リスク・課題のハイライト\n4. 次週の重点項目\n5. サポート依頼事項',
                    category: 'テンプレート'
                },
                {
                    title: 'RACIチャート概要',
                    content: '主要成果物に対するRACIアサインの例。\n\n- 要件定義書: R=ビジネスアナリスト, A=PM, C=開発リード, I=品質保証\n- 設計書: R=アーキテクト, A=PM, C=開発リード, I=運用\n- テスト計画: R=QAリード, A=PM, C=開発リード, I=プロダクトオーナー',
                    category: '体制'
                },
                {
                    title: 'リスク評価尺度',
                    content: 'リスク評価の基準例。\n\n【発生確率】\n- 高: 60%以上の確率で発生\n- 中: 20%〜60%で発生\n- 低: 20%未満で発生\n\n【影響度】\n- 高: スケジュール3週間以上遅延/コスト10%以上増\n- 中: スケジュール1〜3週間遅延/コスト5〜10%増\n- 低: 軽微な遅延または吸収可能',
                    category: 'ガバナンス'
                },
                {
                    title: 'コミュニケーションチャネル一覧',
                    content: 'プロジェクトで利用するコミュニケーションチャネル例。\n\n- 日次: Slack #project-standup\n- 週次: ステータスメール/ダッシュボード更新\n- 月次: マネジメントレビュー会議\n- 随時: 課題管理ツールコメント/エスカレーション',
                    category: 'コミュニケーション'
                },
                {
                    title: 'プロジェクトフェーズ定義',
                    content: '典型的なITシステム開発プロジェクトのフェーズ定義。\n\n1. 企画/要件定義\n2. 基本設計\n3. 詳細設計\n4. 開発/単体テスト\n5. 結合/総合テスト\n6. UAT/移行準備\n7. 本番リリース/安定化',
                    category: '計画'
                },
                {
                    title: '変更管理プロセス概要',
                    content: '変更要求受付からクローズまでのプロセス。\n\n1. 変更要求登録\n2. 初期評価(影響/緊急度)\n3. CABレビュー\n4. 承認/却下決定\n5. 実施計画策定\n6. 実装と検証\n7. 結果レビューと文書化',
                    category: 'ガバナンス'
                },
                {
                    title: 'スプリントカレンダーテンプレート',
                    content: '2週間スプリントの標準イベント配置。\n\n- Day1: スプリントプランニング\n- Day2-9: デイリースクラム/開発作業\n- Day8: バックロググルーミング\n- Day10午前: スプリントレビュー\n- Day10午後: レトロスペクティブ',
                    category: 'スクラム'
                },
                {
                    title: '重要マイルストーン一覧',
                    content: '主要マイルストーン例と概要。\n\n- 要件凍結: 主要要件の合意完了\n- アーキテクチャ確定: 設計審査完了\n- テスト開始承認: テスト計画承認済み\n- UAT開始: ビジネス側受入テスト開始\n- 本番リリース: システム切替',
                    category: '計画'
                },
                {
                    title: 'リリース判定基準',
                    content: '本番リリース承認に必要な判定基準例。\n\n- 重大欠陥ゼロ\n- 回帰テスト完了報告\n- バックアウト手順検証済み\n- 運用チーム訓練完了\n- 関係者承認取得済み',
                    category: 'リリース管理'
                },
                {
                    title: '品質指標定義メモ',
                    content: '品質関連の主要指標の定義。\n\n- 欠陥密度: 欠陥数/機能ポイント\n- テスト進捗: 実施ケース/総ケース\n- リオープン率: 再オープン欠陥/総クローズ欠陥\n- 自動化率: 自動化テストケース/全テストケース',
                    category: '品質'
                },
                {
                    title: 'ステークホルダー分析メモ',
                    content: '主要ステークホルダーの概要整理。\n\n- 経営層: 高影響/高関心, 成果指標重視\n- ビジネス部門: 中影響/高関心, ユーザー体験重視\n- IT運用: 高影響/中関心, 安定稼働重視\n- ベンダー: 中影響/中関心, 契約遵守重視',
                    category: 'ステークホルダー'
                },
                {
                    title: 'ベンダー契約要点サマリー',
                    content: '主要ベンダー契約の要点。\n\n- 契約期間: 2024/04/01〜2025/03/31\n- 成果物受入条件: UAT完了報告書提出\n- SLA: 稼働率99.5%, 応答4時間以内\n- 変更手続き: 書面による合意, 影響分析必須',
                    category: '契約'
                },
                {
                    title: '予算サマリー',
                    content: 'プロジェクト予算の配分例。\n\n- 人件費: 55%\n- 外部委託: 25%\n- インフラ/ツール: 10%\n- 教育/トレーニング: 5%\n- リスクバッファ: 5%',
                    category: 'コスト'
                },
                {
                    title: 'キャパシティ計画前提条件',
                    content: 'キャパシティ計画立案時の前提。\n\n- 標準稼働: 1人あたり週32時間(会議除く)\n- 想定欠員: 月平均5%\n- 並行プロジェクト参加率: 15%\n- ピーク対応: 追加要員リードタイム4週間',
                    category: 'リソース'
                },
                {
                    title: 'SLA主要項目一覧',
                    content: 'システム運用SLAで管理する主要項目。\n\n- 稼働率: 月間99.7%以上\n- インシデント初期応答: 30分以内\n- 重大障害復旧時間: 4時間以内\n- 変更リードタイム: 5営業日',
                    category: '運用'
                },
                {
                    title: 'UAT受入条件',
                    content: 'ユーザー受入テスト完了とみなす条件。\n\n- 主要シナリオ実行率100%\n- 重大欠陥ゼロ\n- 重点業務担当者からの書面承認\n- 既知課題の影響評価共有済み',
                    category: '品質'
                },
                {
                    title: 'データ移行方針サマリー',
                    content: 'データ移行に関する基本方針。\n\n- 手法: 段階的移行(パイロット→本番)\n- バリデーション: ソース/ターゲット差分検証自動化\n- ロールバック: 前日バックアップ復元手順確立\n- コミュニケーション: ユーザー通知72時間前まで',
                    category: '移行'
                },
                {
                    title: 'セキュリティ基準概要',
                    content: 'システムで遵守すべき主要セキュリティ基準。\n\n- 認証: MFA必須\n- 権限管理: 最小権限原則\n- ログ管理: 90日保管/改ざん防止\n- 脆弱性対応: 高リスクは10営業日以内に修正',
                    category: 'セキュリティ'
                },
                {
                    title: '障害対応手順要約',
                    content: '重大障害発生時の標準手順。\n\n1. 初期連絡とトリアージ\n2. インシデントコマンド体制立上げ\n3. 暫定対応/復旧作業\n4. ステークホルダー通知\n5. ポストモーテム実施と改善策策定',
                    category: '運用'
                },
                {
                    title: 'ナレッジ共有ルール',
                    content: 'プロジェクト内のナレッジ共有ルール。\n\n- 重要な学びは24時間以内にConfluenceへ記録\n- 週次でナレッジ共有会を実施\n- 関連タグ付与と検索性確保\n- アーカイブは四半期毎に見直し',
                    category: 'ナレッジ'
                }
            ];

            for (const sample of contextSamples) {
                await this.contextsManager.add(sample);
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

    async renderPrompts(items = null) {
        let prompts = items || await this.promptsManager.getAll();

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

        const promptData = { title, content, tags };

        // フォルダ処理
        if (folderName) {
            const folder = await this.getOrCreateFolder(folderName, 'prompt');
            promptData.folder = folder.id;
        }

        if (this.editingItem) {
            await this.promptsManager.update(this.editingItem, promptData);
            this.showToast('プロンプトを更新しました', 'success');
        } else {
            await this.promptsManager.add(promptData);
            this.showToast('プロンプトを追加しました', 'success');
        }

        await this.renderFolders('prompt');
        await this.renderPrompts();
        this.closeAllModals();
    }

    async searchPrompts(query) {
        const prompts = await this.promptsManager.getAll();
        const filtered = prompts.filter(prompt => {
            const searchStr = `${prompt.title} ${prompt.content} ${prompt.tags?.join(' ')}`.toLowerCase();
            return searchStr.includes(query.toLowerCase());
        });
        this.renderPrompts(filtered);
    }

    // ========================================
    // コンテキスト管理
    // ========================================

    async renderContexts(items = null) {
        let contexts = items || await this.contextsManager.getAll();

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
        const folderName = document.getElementById('context-folder').value.trim();

        if (!title || !content) {
            this.showToast('タイトルと内容は必須です', 'error');
            return;
        }

        const contextData = { title, content, category };

        // フォルダ処理
        if (folderName) {
            const folder = await this.getOrCreateFolder(folderName, 'context');
            contextData.folder = folder.id;
        }

        if (this.editingItem) {
            await this.contextsManager.update(this.editingItem, contextData);
            this.showToast('コンテキストを更新しました', 'success');
        } else {
            await this.contextsManager.add(contextData);
            this.showToast('コンテキストを追加しました', 'success');
        }

        await this.renderFolders('context');
        await this.renderContexts();
        this.closeAllModals();
    }

    async searchContexts(query) {
        const contexts = await this.contextsManager.getAll();
        const filtered = contexts.filter(context => {
            const searchStr = `${context.title} ${context.content} ${context.category || ''}`.toLowerCase();
            return searchStr.includes(query.toLowerCase());
        });
        this.renderContexts(filtered);
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
                await this.renderPrompts();
            } else {
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

        if (type === 'prompt' && item.tags && item.tags.length > 0) {
            metaInfo.push(`タグ: ${item.tags.join(', ')}`);
        }

        if (type === 'context' && item.category) {
            metaInfo.push(`カテゴリ: ${item.category}`);
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
}

// ========================================
// アプリケーション起動
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    window.app = new CognishelfApp();
    await window.app.init();
});
