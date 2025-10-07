# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

**Cognishelf** は、プロンプトエンジニアリングとコンテキストエンジニアリングを統合したWebアプリケーションです。フレームワーク不要の純粋なHTML/CSS/JavaScriptで構築されたSPA(Single Page Application)で、ブラウザのLocalStorageを使用してデータを永続化します。

## 基本操作

### 開発・実行
```bash
# セットアップ不要 - index.htmlをブラウザで直接開く
# Windows: start index.html
# または任意のブラウザで開く
```

このプロジェクトはビルドプロセスやサーバー起動が不要です。HTMLファイルをブラウザで開くだけで動作します。

### ローカルサーバーでの実行(オプション)
```bash
# Python 3を使用する場合
python -m http.server 8000

# Node.jsのhttp-serverを使用する場合
npx http-server -p 8000
```

## コードベースアーキテクチャ

### ファイル構造
- **[index.html](index.html)**: アプリケーションのメインHTML - モーダルダイアログとタブUIを含む
- **[app.js](app.js)**: アプリケーションロジック全体 - クラスベース設計
- **[styles.css](styles.css)**: プロフェッショナルなコーポレート風デザイン

### データ管理 - StorageManager (app.js:5-59)

汎用的なLocalStorage CRUDマネージャークラス。プロンプトとコンテキストの両方で使用されます。

**主要メソッド:**
- `getAll()`: 全データ取得
- `add(item)`: 自動ID生成・タイムスタンプ付きで追加
- `update(id, data)`: 指定IDのデータ更新
- `delete(id)`: 指定IDのデータ削除
- `findById(id)`: ID検索
- `generateId()`: ユニークIDを `timestamp-randomString` 形式で生成

**データ構造:**
```javascript
{
  id: "1234567890-abc123def",      // 自動生成
  title: "タイトル",
  content: "コンテンツ本文",
  tags: ["tag1", "tag2"],           // プロンプトのみ
  category: "カテゴリ",             // コンテキストのみ
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-02T00:00:00.000Z"
}
```

### アプリケーション状態 - CognishelfApp (app.js:65-523)

メインアプリケーションクラス。SPA全体の状態とUIを管理します。

**状態管理:**
- `promptsManager`: プロンプト用StorageManager
- `contextsManager`: コンテキスト用StorageManager
- `currentTab`: 'prompts' または 'contexts'
- `editingItem`: 編集中のアイテムID (null = 新規作成モード)
- `editingType`: 'prompt' または 'context'

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

#### 共通機能 (app.js:394-522)
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
- クラスベース設計を維持
- イベントリスナーは初期化時に `setupEventListeners()` で一括登録
- DOM操作は必ずXSS対策を実施 (`escapeHtml()` 使用)
- LocalStorage操作は `StorageManager` を経由

### CSS
- CSS変数 (`--primary-*`, `--accent-*`) でカラーパレット管理
- プロフェッショナルなコーポレート風デザインを維持
- BEMライクなクラス命名 (`.card-header`, `.card-actions`)

### セキュリティ
- **XSS対策必須**: ユーザー入力を表示する際は必ず `escapeHtml()` を使用
- LocalStorageのデータはクライアント側のみ - 外部送信なし

## データ永続化

**LocalStorageキー:**
- `cognishelf-prompts`: プロンプトデータ配列
- `cognishelf-contexts`: コンテキストデータ配列

**初期サンプルデータ:**
初回起動時のみ `initializeSampleData()` でサンプルデータを自動追加します。既存データがある場合はスキップされます。

## 今後の拡張予定 (README参照)

- データのインポート/エクスポート (JSON)
- お気に入り機能
- ソート機能 (日付・タイトル)
- フォルダ/グループ機能
- Markdown対応
- ダークモードテーマ
- キーボードショートカット拡張
