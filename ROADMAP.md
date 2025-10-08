# Cognishelf Roadmap - ITプロジェクトマネージャー特化版

**最終更新:** 2025-10-08

## 🎯 ビジョン

CognishelfをITシステム開発プロジェクトのプロジェクトマネージャー向けのプロンプト・コンテキスト管理ツールとして進化させ、プロジェクト管理業務を劇的に効率化します。

---

## 📊 実装フェーズ概要

| Phase | 名称 | 期間 | 状態 | 主要成果物 |
|-------|------|------|------|-----------|
| 0 | Vite移行準備 | 1週間 | ✅ 完了 | Vite環境、モジュール分割 |
| 1 | PM特化基盤 | 3日間 | ✅ 完了 | プロジェクトデータモデル拡張 |
| 2 | テンプレートライブラリ | 1週間 | 🔜 計画中 | PM業務テンプレート集 |
| 3 | プロジェクト管理 | 1週間 | 🔜 計画中 | プロジェクト単位での整理 |
| 4 | AI連携強化 | 1週間 | 🔜 計画中 | Claude/ChatGPT連携機能 |
| 5 | 高度な機能 | 2週間 | 🔜 計画中 | ナレッジベース、バージョン管理 |

**総実装期間:** 約6週間

---

## 🚀 Phase 0: Vite移行準備 ✅ 完了

### 目的
- モダンな開発環境への移行
- コードベースの保守性向上
- 将来の機能拡張に備えた基盤構築

### 実装タスク

#### 1. Vite環境構築
```bash
npm create vite@latest . -- --template vanilla
npm install
```

#### 2. 依存関係移行
```bash
# CDNから npm パッケージへ
npm install idb marked
```

#### 3. モジュール分割
```
src/
├── models/
│   ├── PMPrompt.js
│   ├── PMContext.js
│   └── Project.js
├── app.js
└── main.js
```

#### 4. 既存機能の動作確認
- [x] Vite環境構築
- [x] 依存関係をnpmパッケージへ移行
- [x] モジュール分割実装(main.js/app.js)
- [x] 本番ビルド成功確認

### 成果物
- ✅ Vite開発環境
- ✅ ホットリロード対応
- ✅ 保守性の高いモジュール構造
- ✅ 既存機能の完全な動作

### 技術スタック
- Vite 5.x
- Vanilla JavaScript (ES6+)
- idb 7.x
- marked 11.x

---

## 📦 Phase 1: PM特化基盤 ✅ 完了

### 目的
- データモデルにPM業務特化フィールドを追加
- プロジェクト情報の保存機能実装

### データモデル拡張

#### プロンプトデータ構造
```javascript
{
  // 既存フィールド
  id: "prompt-123",
  title: "要件定義フェーズキックオフMTG議事録",
  content: "...",
  tags: ["要件定義", "キックオフ"],
  folder: "ProjectA",
  createdAt: "2025-01-08T00:00:00.000Z",
  updatedAt: "2025-01-08T00:00:00.000Z",

  // 新規: PM特化フィールド
  pmConfig: {
    // プロジェクト情報
    projectId: "project-001",
    projectName: "新基幹システム構築",
    phase: "要件定義", // 企画、要件定義、設計、開発、テスト、リリース

    // ステークホルダー
    stakeholders: [
      { name: "山田太郎", role: "PO", email: "yamada@example.com" },
      { name: "佐藤花子", role: "開発リーダー", email: "sato@example.com" }
    ],

    // 関連ドキュメント
    relatedDocs: [
      { title: "要件定義書v1.0", url: "https://..." },
      { title: "WBS", url: "https://..." }
    ],

    // 優先度・重要度
    priority: "高", // 高、中、低
    importance: 5,  // 1-5

    // ステータス
    status: "進行中", // 下書き、進行中、完了、保留
    dueDate: "2025-02-28T00:00:00.000Z",

    // 使用統計
    stats: {
      usageCount: 15,
      lastUsed: "2025-01-08T14:23:00.000Z",
      effectiveness: 4.5  // 有効性評価 1-5
    }
  }
}
```

#### コンテキストデータ構造
```javascript
{
  // 既存フィールド
  id: "context-456",
  title: "プロジェクト背景・目的",
  content: "...",
  category: "プロジェクト概要",
  tags: ["背景", "目的"],
  folder: "ProjectA",
  createdAt: "2025-01-08T00:00:00.000Z",
  updatedAt: "2025-01-08T00:00:00.000Z",

  // 新規: PM特化フィールド
  pmConfig: {
    projectId: "project-001",
    projectName: "新基幹システム構築",
    contextType: "背景情報", // 背景情報、技術仕様、制約条件、リスク
    visibility: "チーム全体", // 個人、チーム全体、ステークホルダー

    // バージョン管理
    version: "1.2",
    previousVersionId: "context-123",

    // 関連プロンプト
    relatedPrompts: ["prompt-123", "prompt-124"]
  }
}
```

#### プロジェクトデータ構造
```javascript
{
  id: "project-001",
  name: "新基幹システム構築",
  description: "既存の基幹システムをクラウドネイティブに刷新",

  // プロジェクト期間
  startDate: "2025-01-01T00:00:00.000Z",
  endDate: "2025-12-31T00:00:00.000Z",

  // 現在のフェーズ
  currentPhase: "要件定義",

  // チームメンバー
  team: [
    { name: "山田太郎", role: "PM", email: "yamada@example.com" },
    { name: "佐藤花子", role: "開発リーダー", email: "sato@example.com" }
  ],

  // プロジェクト設定
  settings: {
    defaultPriority: "中",
    phases: ["企画", "要件定義", "設計", "開発", "テスト", "リリース"]
  },

  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-08T00:00:00.000Z"
}
```

### IndexedDB拡張

```javascript
// バージョン2へアップグレード
const db = await idb.openDB('cognishelf-db', 2, {
  upgrade(db, oldVersion, newVersion, transaction) {
    // 既存のストア(バージョン1)
    // prompts, contexts, folders

    // 新規ストア(バージョン2)
    if (!db.objectStoreNames.contains('projects')) {
      const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
      projectStore.createIndex('name', 'name', { unique: false });
      projectStore.createIndex('currentPhase', 'currentPhase', { unique: false });
      projectStore.createIndex('startDate', 'startDate', { unique: false });
    }

    // マイグレーション: 既存プロンプト・コンテキストにpmConfigフィールド追加
    if (oldVersion < 2) {
      // プロンプトマイグレーション
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
              stats: { usageCount: 0, lastUsed: null, effectiveness: 0 }
            };
            promptStore.put(prompt);
          }
        });
      });

      // コンテキストマイグレーション
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
      });
    }
  }
});
```

### UI更新

#### プロンプト編集モーダル拡張
```html
<!-- 既存フィールド -->
<input type="text" id="prompt-title">
<textarea id="prompt-content"></textarea>

<!-- 新規: PM設定セクション -->
<div class="pm-config-section">
  <h3>📊 プロジェクト管理設定</h3>

  <div class="form-row">
    <div class="form-group">
      <label>プロジェクト名</label>
      <input type="text" id="pm-project-name">
    </div>
    <div class="form-group">
      <label>フェーズ</label>
      <select id="pm-phase">
        <option>未分類</option>
        <option>企画</option>
        <option>要件定義</option>
        <option>設計</option>
        <option>開発</option>
        <option>テスト</option>
        <option>リリース</option>
      </select>
    </div>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label>優先度</label>
      <select id="pm-priority">
        <option>高</option>
        <option selected>中</option>
        <option>低</option>
      </select>
    </div>
    <div class="form-group">
      <label>ステータス</label>
      <select id="pm-status">
        <option>下書き</option>
        <option selected>進行中</option>
        <option>完了</option>
        <option>保留</option>
      </select>
    </div>
  </div>

  <div class="form-group">
    <label>期限</label>
    <input type="date" id="pm-due-date">
  </div>

  <div class="form-group">
    <label>ステークホルダー (カンマ区切り)</label>
    <input type="text" id="pm-stakeholders" placeholder="山田太郎(PO), 佐藤花子(開発リーダー)">
  </div>
</div>
```

### 実装チェックリスト
- [x] データモデル定義(`src/models/PMPrompt.js`, `PMContext.js`, `Project.js`)
- [x] IndexedDBスキーマ更新(バージョン2)
- [x] マイグレーションロジック実装
- [x] UI拡張(PM設定フォーム)
- [x] プロジェクト管理画面
- [x] 保存・読み込み処理更新
- [x] 既存データの後方互換性確認

### 成果物
- ✅ PM特化データモデル
- ✅ プロジェクト情報保存機能
- ✅ 既存データの自動マイグレーション

**詳細:** [PHASE1_COMPLETION.md](PHASE1_COMPLETION.md)

---

## 📚 Phase 2: テンプレートライブラリ 🔜 計画中

### 目的
PM業務でよく使うプロンプト・コンテキストのテンプレート集を提供

### テンプレートカテゴリ

#### 1. 会議・コミュニケーション
- キックオフMTG議事録
- 週次定例MTG
- ステークホルダー報告
- 課題エスカレーション
- リスク報告

#### 2. ドキュメント作成
- 要件定義書レビュー依頼
- 設計書作成ガイド
- テスト計画書
- リリース計画
- 振り返り(KPT)

#### 3. プロジェクト管理
- WBS作成支援
- スケジュール調整
- リソース配分
- 予算管理
- 品質管理

#### 4. リスク管理
- リスク洗い出し
- リスク対応計画
- 課題管理
- 変更管理

### データ構造
```javascript
{
  id: "template-kickoff",
  name: "キックオフMTG議事録",
  category: "会議・コミュニケーション",
  tags: ["会議", "キックオフ", "議事録"],

  description: "プロジェクトキックオフミーティングの議事録作成用テンプレート",

  promptTemplate: `
# {{projectName}} キックオフMTG議事録

## 開催情報
- 日時: {{date}}
- 参加者: {{attendees}}
- 場所: {{location}}

## アジェンダ
1. プロジェクト背景・目的
2. スコープ・成果物
3. スケジュール・マイルストーン
4. 体制・役割分担
5. コミュニケーションルール
6. Q&A

## 議事内容
{{content}}

## 決定事項
-

## Next Action
- [ ]

## 課題・リスク
-
`,

  contextTemplate: `
# プロジェクト背景・目的

## 背景
{{background}}

## 目的
{{objective}}

## 成功指標(KPI)
{{kpi}}
`,

  variables: [
    { name: "projectName", label: "プロジェクト名", type: "text" },
    { name: "date", label: "開催日時", type: "datetime" },
    { name: "attendees", label: "参加者", type: "text" },
    { name: "location", label: "場所", type: "text" },
    { name: "content", label: "議事内容", type: "textarea" }
  ],

  usageCount: 0,
  rating: 0,

  createdAt: "2025-01-08T00:00:00.000Z",
  author: "system"
}
```

### UI実装

#### テンプレートライブラリ画面
```html
<div class="template-library">
  <div class="template-filters">
    <button class="filter-btn active" data-category="all">すべて</button>
    <button class="filter-btn" data-category="会議・コミュニケーション">会議</button>
    <button class="filter-btn" data-category="ドキュメント作成">ドキュメント</button>
    <button class="filter-btn" data-category="プロジェクト管理">PM</button>
    <button class="filter-btn" data-category="リスク管理">リスク</button>
  </div>

  <div class="template-grid">
    <!-- テンプレートカード -->
    <div class="template-card">
      <div class="template-info">
        <h3>キックオフMTG議事録</h3>
        <p>プロジェクトキックオフミーティングの議事録作成用</p>
        <div class="template-tags">
          <span class="tag">会議</span>
          <span class="tag">キックオフ</span>
        </div>
      </div>
      <div class="template-actions">
        <button class="btn btn-primary apply-template">適用</button>
        <button class="btn btn-secondary preview-template">プレビュー</button>
      </div>
    </div>
  </div>
</div>
```

### 実装チェックリスト
- [ ] TemplateManagerクラス実装
- [ ] IndexedDBにtemplatesストア追加
- [ ] テンプレートライブラリUI
- [ ] フィルタリング機能
- [ ] テンプレート適用ロジック(変数置換)
- [ ] 初期テンプレートデータ登録(10種類以上)
- [ ] カスタムテンプレート作成機能
- [ ] テンプレートのインポート/エクスポート

### 成果物
- ✅ ワンクリックテンプレート適用
- ✅ 10種類以上の実用的なPM業務テンプレート
- ✅ カスタムテンプレート作成機能

---

## 🗂️ Phase 3: プロジェクト管理機能 🔜 計画中

### 目的
複数プロジェクトを効率的に管理・切り替え

### 機能仕様

#### プロジェクトダッシュボード
- プロジェクト一覧表示
- プロジェクト別のプロンプト・コンテキスト数
- フェーズ進捗状況
- 期限が近いタスク一覧

#### プロジェクト切り替え
- サイドバーでのプロジェクト選択
- 選択中のプロジェクトのアイテムのみ表示
- プロジェクト横断検索

#### プロジェクトアーカイブ
- 完了したプロジェクトをアーカイブ
- アーカイブからの復元
- アーカイブデータのエクスポート

### 実装チェックリスト
- [ ] ProjectManagerクラス実装
- [ ] プロジェクトダッシュボードUI
- [ ] プロジェクト選択サイドバー
- [ ] プロジェクトフィルタリング
- [ ] アーカイブ機能
- [ ] プロジェクト統計情報表示

### 成果物
- ✅ 複数プロジェクトの同時管理
- ✅ プロジェクト切り替え機能
- ✅ ダッシュボードでの進捗可視化

---

## 🤖 Phase 4: AI連携強化 🔜 計画中

### 目的
Claude/ChatGPTとのスムーズな連携

### 機能仕様

#### ワンクリックコピー強化
- プロンプト+関連コンテキストを一括コピー
- Markdown形式での出力
- AI向けフォーマット最適化

#### プロンプトテンプレート変数展開
- 変数の自動置換
- プロジェクト情報の自動挿入
- 日付・時刻の自動挿入

#### AI応答の保存
- AI応答をコンテキストとして保存
- プロンプトとの関連付け
- バージョン履歴管理

### 実装チェックリスト
- [ ] AI連携マネージャークラス実装
- [ ] 一括コピー機能
- [ ] Markdown出力最適化
- [ ] 変数展開エンジン
- [ ] AI応答保存機能
- [ ] プロンプト-応答関連付け

### 成果物
- ✅ AI連携のワークフロー最適化
- ✅ プロンプト-応答の体系的管理
- ✅ ナレッジの蓄積・再利用

---

## 🔬 Phase 5: 高度な機能 🔜 計画中

### 5.1 ナレッジベース機能

#### 機能概要
- プロンプト・コンテキストの関連性マップ
- よく使う組み合わせの自動提案
- タグベースのナレッジグラフ

### 5.2 バージョン管理

#### 機能概要
- プロンプト・コンテキストの履歴管理
- 差分表示
- 特定バージョンへの復元

### 5.3 チーム共有機能

#### 機能概要
- JSONエクスポート/インポート拡張
- プロジェクト単位での共有
- テンプレートの共有

### 実装チェックリスト
- [ ] ナレッジグラフ実装
- [ ] バージョン管理システム
- [ ] 差分表示UI
- [ ] 共有機能強化
- [ ] チーム用エクスポート形式

### 成果物
- ✅ ナレッジの可視化・活用
- ✅ 変更履歴の追跡
- ✅ チームでのナレッジ共有

---

## 📚 補足資料

### 参考リンク
- [プロジェクトマネジメント知識体系ガイド(PMBOK)](https://www.pmi.org/pmbok-guide-standards)
- [アジャイル開発手法](https://agilemanifesto.org/)

### 技術スタック
- **フロントエンド:** Vite + Vanilla JS
- **データベース:** IndexedDB (idb 7.x)
- **UI:** CSS Grid/Flexbox + CSS Variables
- **Markdown:** marked.js 11.x

### 開発環境
```bash
# 開発サーバー起動
npm run dev

# プロダクションビルド
npm run build

# プレビュー
npm run preview
```

---

## 🎯 成功指標(KPI)

| 指標 | 現在 | 目標 |
|------|------|------|
| プロンプト作成時間 | 10分/件 | 2分/件 |
| テンプレート利用率 | 0% | 80% |
| プロジェクト管理効率 | - | 業務時間30%削減 |
| ナレッジ再利用率 | - | 60% |

---

**次のアクション:** Phase 2 (テンプレートライブラリ)の着手

**更新履歴:**
- 2025-10-08: Phase 1完了、ITプロジェクトマネージャー向けに全面改訂
- 2025-01-08: ITプロジェクトマネージャー向けに初版作成
