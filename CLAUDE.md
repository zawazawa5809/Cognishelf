# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

**Cognishelf** は、**ITシステム開発プロジェクトのプロジェクトマネージャー向けのプロンプト・コンテキスト管理ツール**です。AI(Claude/ChatGPT等)を活用したプロジェクト管理業務を効率化し、プロンプトとコンテキストを体系的に保存・整理・再利用できます。

フレームワーク不要の純粋なHTML/CSS/JavaScriptで構築されたSPA(Single Page Application)で、ブラウザの**IndexedDB**を使用してデータを永続化します(LocalStorageからの自動マイグレーション対応)。

**主要用途:**
- PM業務用プロンプトの保存・管理(会議議事録、ドキュメント作成、リスク管理等)
- プロジェクトコンテキストの整理(背景、技術仕様、制約条件等)
- テンプレートライブラリによるワンクリック適用
- プロジェクト単位での管理・切り替え
- AI連携によるナレッジの蓄積・再利用

## 基本操作

### 前提条件
- Node.js 18以上

### 開発環境セットアップ
```bash
# 依存パッケージのインストール
npm install

# 開発サーバー起動(推奨)
npm run dev
# → http://localhost:3000 が自動で開きます

# プロダクションビルド
npm run build

# ビルド版のプレビュー
npm run preview
```

**Vite開発環境:**
- HMR(Hot Module Replacement)対応 - ファイル保存で即座に反映
- ES Modules対応 - import/export構文使用
- ソースマップ生成 - デバッグが容易
- 高速ビルド - Rollupベースの最適化

**レガシー環境(非推奨):**
ビルドツール不使用の場合は`index.html`を直接ブラウザで開くことも可能ですが、開発時は`npm run dev`の使用を推奨します。

## コードベースアーキテクチャ

### ファイル構造
```
Cognishelf/
├── index.html           # メインHTML(モーダル・タブUI)
├── src/
│   ├── main.js         # Viteエントリーポイント
│   ├── app.js          # メインアプリケーションロジック
│   ├── managers/       # ビジネスロジック層
│   │   └── TemplateManager.js
│   └── models/         # データモデル層
│       ├── PMPrompt.js
│       ├── PMContext.js
│       ├── Template.js
│       └── Project.js
├── styles.css          # コーポレート風デザイン
├── public/             # 静的アセット
├── dist/               # ビルド出力(gitignore)
├── vite.config.js      # Vite設定
├── package.json        # 依存関係・スクリプト
└── ROADMAP.md         # 実装ロードマップ
```

**レガシーファイル:**
- ルート直下の`app.js`はレガシー版として残存(Vite移行前)
- 新規開発は`src/`配下で実施

### 外部依存関係
- **idb** v7 (Google製): Promise/async-awaitベースのIndexedDBラッパー
- **marked** v11: Markdownレンダリングエンジン
- **vite** v5: 高速ビルドツール&開発サーバー

### データ管理アーキテクチャ

#### ストレージ抽象化層 (app.js:5-169)

**StorageInterface (抽象クラス)**
- すべてのストレージマネージャーの共通インターフェース
- 非同期メソッド: `getAll()`, `add()`, `update()`, `delete()`, `findById()`
- `generateId()`: ユニークIDを `timestamp-randomString` 形式で生成

**StorageManager (LocalStorage実装)**
- レガシー実装・フォールバック用
- IndexedDB非対応ブラウザで自動的に使用される

**IndexedDBManager (IndexedDB実装)** ⭐️ メイン実装
- Google製`idb`ライブラリを使用したPromiseベースの実装
- データベース名: `cognishelf-db`
- Object Stores: `prompts`, `contexts`, `folders`
- インデックス:
  - prompts: `title`, `createdAt`, `tags`(multiEntry), `folder`
  - contexts: `title`, `createdAt`, `category`, `folder`
  - folders: `name`, `type`
- 高度な検索メソッド:
  - `findByTag(tag)`: タグによるインデックス検索
  - `findByDateRange(start, end)`: 日付範囲検索

**StorageAdapter (app.js:175-230)**
- ストレージマネージャーの自動選択・初期化を担当
- `createManager(storeName, legacyKey)`:
  1. IndexedDB対応チェック
  2. IndexedDBManager初期化
  3. LocalStorageからの自動マイグレーション
  4. エラー時はLocalStorageへフォールバック
- `migrateFromLocalStorage()`: 既存データを移行後にLocalStorageクリア

**データ構造:**
```javascript
// プロンプト
{
  id: "1234567890-abc123def",      // 自動生成
  title: "タイトル",
  content: "コンテンツ本文",
  tags: ["tag1", "tag2"],
  folder: "フォルダ名",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-02T00:00:00.000Z"
}

// コンテキスト
{
  id: "1234567890-abc123def",
  title: "タイトル",
  content: "コンテンツ本文",
  category: "カテゴリ",
  tags: ["tag1", "tag2"],
  folder: "フォルダ名",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-02T00:00:00.000Z"
}

// フォルダ
{
  id: "1234567890-abc123def",
  name: "フォルダ名",
  type: "prompt" | "context",
  createdAt: "2025-01-01T00:00:00.000Z"
}
```

### アプリケーション状態 - CognishelfApp (app.js:236-948)

メインアプリケーションクラス。SPA全体の状態とUIを管理します。

**状態管理:**
- `promptsManager`: プロンプト用ストレージマネージャー(IndexedDB/LocalStorage)
- `contextsManager`: コンテキスト用ストレージマネージャー
- `foldersManager`: フォルダ用ストレージマネージャー
- `currentTab`: 'prompts' または 'contexts'
- `editingItem`: 編集中のアイテムID (null = 新規作成モード)
- `editingType`: 'prompt' または 'context'

**重要な設計変更:**
- すべてのデータ操作メソッドが**非同期(async/await)**に変更されています
- `init()` は非同期初期化メソッドで、DOMContentLoaded時に`await app.init()`で呼び出されます
- ストレージマネージャーは`StorageAdapter.createManager()`で初期化され、自動的にIndexedDBまたはLocalStorageが選択されます

**主要機能ブロック:**

#### タブ切り替え (app.js:171-183)
- タブボタンとコンテンツセクションの表示切り替え
- `switchTab(tabName)` でactiveクラスを付け替え

#### プロンプト管理 (app.js:185-288)
- `renderPrompts()`: プロンプト一覧のレンダリング
- `createPromptCard()`: カードHTML生成 (XSS対策済み)
- `openPromptModal()`: モーダル表示 (新規/編集モード)
- `savePrompt()`: フォーム送信処理
- `searchPrompts()`: リアルタイム検索 (タイトル・内容・タグ対象)

#### コンテキスト管理 (app.js:290-392)
- プロンプトと同様の構造で実装
- カテゴリ機能がタグ機能と異なる点に注意

#### フォルダ管理
- `foldersManager`: フォルダ用ストレージマネージャー
- `renderFolders()`: サイドバーにフォルダツリーを表示
- `filterByFolder()`: フォルダクリックでアイテムをフィルタリング
- フォルダはアイテム作成時に自動作成される

#### Markdown対応
- `marked.js`を使用してMarkdown→HTML変換
- プレビューモーダルで自動レンダリング
- カードの説明文も簡易的にMarkdownレンダリング

#### プレビュー機能
- `openPreviewModal()`: 全画面プレビューモーダル
- タイトル、メタ情報、Markdownレンダリングされたコンテンツを表示
- プレビューから直接コピー・編集・削除が可能

#### JSON インポート/エクスポート
- `exportToJSON()`: 全データをJSON形式でダウンロード
- `importFromJSON()`: JSONファイルからデータをインポート
- 既存データとのマージ処理(ID重複チェック)

#### ソート&グループ化
- ソート: 日付(新/古)、タイトル(A→Z/Z→A)
- グループ化: フォルダ別、タグ別、カテゴリ別
- `sortItems()`, `groupItems()` で動的にUI再構築

#### 共通機能
- `attachCardEventListeners()`: コピー・編集・削除ボタンのイベント設定
- `copyToClipboard()`: Clipboard API使用
- `deleteItem()`: 確認ダイアログ付き削除
- `showToast()`: 通知表示 (3秒後に自動消去)
- `formatDate()`: 相対日付表示 ("今日", "3日前", "2025年1月1日")
- `escapeHtml()`: XSS対策のHTMLエスケープ

### UI/UX設計

**モーダルシステム:**
- モーダル外クリックで閉じる
- Escキーで閉じる
- キャンセルボタン/×ボタンで閉じる
- フォーム送信で自動クローズ

**検索機能:**
- リアルタイムフィルタリング
- 大文字小文字を区別しない
- 複数フィールド横断検索 (タイトル・内容・タグ/カテゴリ)

**レスポンシブ対応:**
- CSS GridとFlexboxで柔軟なレイアウト
- モバイル・タブレット・デスクトップ対応

## コーディング規約

### JavaScript
- **ES Modules**: `import`/`export`構文を使用(Vite環境)
- **クラスベース設計**: オブジェクト指向アーキテクチャ
- **非同期処理**: すべてのデータ操作は`async/await`で実装
- **イベント管理**: 初期化時に`setupEventListeners()`で一括登録
- **XSS対策**: DOM操作時は必ず`escapeHtml()`を使用
- **ストレージ抽象化**: `StorageInterface`実装クラス経由でアクセス
- **モジュール分割**:
  - `src/models/`: データモデル定義
  - `src/managers/`: ビジネスロジック
  - `src/modules/`: 再利用可能なユーティリティ(予定)

### CSS
- CSS変数 (`--primary-*`, `--accent-*`) でカラーパレット管理
- プロフェッショナルなコーポレート風デザインを維持
- BEMライクなクラス命名 (`.card-header`, `.card-actions`)

### セキュリティ
- **XSS対策必須**: ユーザー入力を表示する際は必ず `escapeHtml()` を使用
- IndexedDB/LocalStorageのデータはクライアント側のみ - 外部送信なし

## データ永続化

### IndexedDB (メインストレージ)

**データベース構成:**
- データベース名: `cognishelf-db` (バージョン: 1)
- Object Stores: `prompts`, `contexts`, `folders`
- 容量制限: 数百MB～数GB (ブラウザ依存)

**マイグレーション:**
- 初回起動時、LocalStorageに既存データがあれば自動的にIndexedDBへ移行
- 移行完了後、LocalStorageのデータはクリアされます
- マイグレーション中のエラーはコンソールに記録され、LocalStorageデータは保持されます

**フォールバック:**
- IndexedDB非対応ブラウザでは自動的にLocalStorageを使用
- IndexedDB初期化失敗時もLocalStorageへフォールバック

### LocalStorage (レガシー・フォールバック用)

**LocalStorageキー:**
- `cognishelf-prompts`: プロンプトデータ配列 (最大5-10MB)
- `cognishelf-contexts`: コンテキストデータ配列
- `cognishelf-folders`: フォルダデータ配列

**初期サンプルデータ:**
初回起動時のみ `initializeSampleData()` でサンプルデータを自動追加します。既存データがある場合はスキップされます。

## 開発・デバッグ

### デバッグ方法
```bash
# 開発サーバー起動(ソースマップ有効)
npm run dev

# ブラウザDevTools:
# - Console: エラーログ確認
# - Application > IndexedDB: データベース確認
# - Network: API/リソース読み込み確認
# - Sources: ブレークポイント設定・デバッグ
```

### テスト
動作確認チェックリストは[TESTING.md](TESTING.md)を参照してください。

### トラブルシューティング
- **HMRが動作しない**: ポート3000が使用中の可能性 → `vite.config.js`でポート変更
- **ビルドエラー**: `node_modules`削除後に`npm install`再実行
- **IndexedDB初期化失敗**: LocalStorageへ自動フォールバック(コンソール確認)

## ブラウザ要件

- **IndexedDB対応ブラウザ** (推奨)
  - Chrome 24+
  - Firefox 16+
  - Safari 10+
  - Edge 12+
  - すべてのモダンモバイルブラウザ
- IndexedDB非対応の場合は自動的にLocalStorageにフォールバック

## 完了済み機能

- ✅ IndexedDB対応 (LocalStorageからの自動マイグレーション)
- ✅ フォルダ管理 (サイドバーでのフィルタリング)
- ✅ Markdown対応 (プレビュー&カード表示)
- ✅ ソート機能 (日付・タイトル)
- ✅ グループ化機能 (フォルダ・タグ・カテゴリ別)
- ✅ JSONインポート/エクスポート
- ✅ プレビューモーダル

## 実装計画

詳細は **[ROADMAP.md](ROADMAP.md)** を参照してください。

### 今後の拡張(ITプロジェクトマネージャー特化)

**Phase 0: Vite移行準備** (1週間) ✅ 完了
- モダン開発環境構築
- モジュール分割

**Phase 1: PM特化基盤** (3日間)
- データモデル拡張(pmConfigフィールド追加)
- プロジェクト情報・ステークホルダー・優先度管理

**Phase 2: テンプレートライブラリ** (1週間)
- PM業務テンプレート集(会議、ドキュメント、リスク管理等)
- 変数置換エンジン

**Phase 3: プロジェクト管理** (1週間)
- 複数プロジェクトの管理・切り替え
- ダッシュボード・進捗可視化

**Phase 4: AI連携強化** (1週間)
- Claude/ChatGPT連携最適化
- プロンプト+コンテキスト一括コピー
- AI応答の保存・関連付け

**Phase 5: 高度な機能** (2週間)
- ナレッジベース・関連性マップ
- バージョン管理・差分表示
- チーム共有機能

### 将来の検討事項
- お気に入り機能
- ダークモードテーマ
- キーボードショートカット拡張
- チームでのテンプレート共有
