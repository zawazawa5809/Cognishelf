# Cognishelf Roadmap - Stable Diffusion特化版

**最終更新:** 2025-01-08

## 🎯 ビジョン

CognishelfをStable Diffusion用のプロンプト管理・最適化ツールとして進化させ、画像生成ワークフローを劇的に改善します。

---

## 📊 実装フェーズ概要

| Phase | 名称 | 期間 | 状態 | 主要成果物 |
|-------|------|------|------|-----------|
| 0 | Vite移行準備 | 1週間 | ✅ 完了 | Vite環境、モジュール分割 |
| 1 | SD特化基盤 | 3日間 | ⏭️ スキップ | (Phase 2に統合) |
| 2 | プロンプトミキサー | 1週間 | ✅ 完了 | レイヤー型プロンプト構築UI |
| 3 | スタイルプリセット | 3日間 | 🔜 計画中 | プリセットライブラリ、ワンクリック適用 |
| 4 | バリエーション生成 | 1週間 | 🔜 計画中 | 変数置換エンジン、一括生成 |
| 5 | 高度な機能 | 2週間 | 🔜 計画中 | プロンプト分析、A/Bテスト |

**総実装期間:** 約5週間

---

## 🚀 Phase 0: Vite移行準備

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
├── modules/
│   ├── storage/
│   │   ├── StorageInterface.js
│   │   ├── IndexedDBManager.js
│   │   ├── StorageManager.js
│   │   └── StorageAdapter.js
│   ├── ui/
│   │   ├── PromptRenderer.js
│   │   ├── ContextRenderer.js
│   │   ├── ModalManager.js
│   │   └── ToastNotification.js
│   └── utils/
│       ├── dateFormatter.js
│       ├── htmlEscape.js
│       └── markdownRenderer.js
├── app.js
└── main.js
```

#### 4. 既存機能の動作確認

- [x] Vite環境構築
- [x] 依存関係をnpmパッケージへ移行
- [x] モジュール分割実装(main.js/app.js)
- [x] 本番ビルド成功確認
- [ ] ブラウザでの手動動作確認(TESTING.md参照)

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

## 📦 Phase 1: Stable Diffusion特化基盤

### 目的
- データモデルにSD特化フィールドを追加
- パラメータ保存機能の実装

### データモデル拡張

#### プロンプトデータ構造
```javascript
{
  // 既存フィールド
  id: "prompt-123",
  title: "アニメ風猫",
  content: "cat sitting, anime style, 8k",
  tags: ["動物", "アニメ"],
  folder: "folder-id",
  createdAt: "2025-01-08T00:00:00.000Z",
  updatedAt: "2025-01-08T00:00:00.000Z",

  // 新規: Stable Diffusion特化フィールド
  sdConfig: {
    // ポジティブプロンプト(最終版)
    positivePrompt: "cat sitting, anime style, cel shading, 8k, masterpiece",

    // ネガティブプロンプト
    negativePrompt: "blurry, low quality, watermark, realistic, photo",

    // 生成パラメータ
    parameters: {
      steps: 28,
      cfgScale: 7.5,
      sampler: "DPM++ 2M Karras",
      width: 512,
      height: 768,
      seed: -1,  // -1 = ランダム
      clipSkip: 1,
      denoisingStrength: 0.7  // img2img用
    },

    // スタイルプリセット参照
    stylePresets: ["anime", "high-quality"],

    // バリエーション定義
    variations: [
      {
        name: "夕暮れ版",
        positiveAdd: ", sunset, golden hour",
        negativeAdd: "",
        parametersOverride: { cfgScale: 8.0 }
      }
    ],

    // 使用統計
    stats: {
      generationCount: 15,
      lastUsed: "2025-01-08T14:23:00.000Z",
      rating: 4.5
    }
  }
}
```

#### スタイルプリセット構造
```javascript
{
  id: "preset-anime-ghibli",
  name: "アニメ風(Ghibli)",
  category: "スタイル",
  tags: ["アニメ", "ジブリ"],

  positivePrompt: "studio ghibli style, anime, cel shading, hand-painted",
  negativePrompt: "realistic, photo, 3d render, cgi",

  recommendedParams: {
    steps: 28,
    cfgScale: 7.0,
    sampler: "DPM++ 2M Karras"
  },

  preview: "data:image/jpeg;base64,...",  // サムネイル

  createdAt: "2025-01-08T00:00:00.000Z"
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
    if (!db.objectStoreNames.contains('stylePresets')) {
      const presetStore = db.createObjectStore('stylePresets', { keyPath: 'id' });
      presetStore.createIndex('name', 'name', { unique: false });
      presetStore.createIndex('category', 'category', { unique: false });
      presetStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
    }

    // マイグレーション: 既存プロンプトにsdConfigフィールド追加
    if (oldVersion < 2) {
      const promptStore = transaction.objectStore('prompts');
      promptStore.getAll().then(prompts => {
        prompts.forEach(prompt => {
          if (!prompt.sdConfig) {
            prompt.sdConfig = {
              positivePrompt: prompt.content,
              negativePrompt: "",
              parameters: {
                steps: 28,
                cfgScale: 7.5,
                sampler: "DPM++ 2M Karras",
                width: 512,
                height: 512,
                seed: -1
              },
              stylePresets: [],
              variations: [],
              stats: {
                generationCount: 0,
                lastUsed: null,
                rating: 0
              }
            };
            promptStore.put(prompt);
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

<!-- 新規: SD設定セクション -->
<div class="sd-config-section">
  <h3>Stable Diffusion設定</h3>

  <div class="form-group">
    <label>ポジティブプロンプト (最終版)</label>
    <textarea id="sd-positive" rows="4"></textarea>
  </div>

  <div class="form-group">
    <label>ネガティブプロンプト</label>
    <textarea id="sd-negative" rows="2"></textarea>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label>Steps</label>
      <input type="number" id="sd-steps" value="28">
    </div>
    <div class="form-group">
      <label>CFG Scale</label>
      <input type="number" id="sd-cfg" value="7.5" step="0.5">
    </div>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label>Sampler</label>
      <select id="sd-sampler">
        <option>Euler a</option>
        <option selected>DPM++ 2M Karras</option>
        <option>DPM++ SDE Karras</option>
        <option>UniPC</option>
      </select>
    </div>
    <div class="form-group">
      <label>Width x Height</label>
      <select id="sd-size">
        <option value="512x512">512x512</option>
        <option value="512x768">512x768 (Portrait)</option>
        <option value="768x512">768x512 (Landscape)</option>
        <option value="1024x1024">1024x1024</option>
      </select>
    </div>
  </div>
</div>
```

### 実装チェックリスト
- [ ] データモデル定義(`src/models/SDPrompt.js`)
- [ ] IndexedDBスキーマ更新(バージョン2)
- [ ] マイグレーションロジック実装
- [ ] UI拡張(SDパラメータフォーム)
- [ ] 保存・読み込み処理更新
- [ ] 既存データの後方互換性確認

### 成果物
- ✅ SD特化データモデル
- ✅ パラメータ保存機能
- ✅ 既存データの自動マイグレーション

---

## 🎨 Phase 2: プロンプトミキサー

### 目的
プロンプトをレイヤー構造で組み立て、チェックボックスで簡単に組み合わせられるUI

### 機能仕様

#### コンポーネント構造
```
プロンプトミキサー
├── ベースプロンプト (必須)
├── スタイルレイヤー (複数選択可)
│   ├ アニメ風
│   ├ 写実的
│   └ 油絵風
├── 品質ブースター (複数選択可)
│   ├ 8K高画質
│   ├ 高精細
│   └ プロ品質
├── シーン要素 (複数選択可)
│   ├ ライティング
│   ├ 構図
│   └ 時間帯
└── 除外要素 (ネガティブ)
    ├ 標準NG
    └ 品質低下要因
```

#### データ構造
```javascript
// プロンプトレイヤー定義
{
  id: "layer-anime-style",
  category: "スタイル",
  name: "アニメ風",
  positiveAdd: "anime style, cel shading, vibrant colors",
  negativeAdd: "realistic, photo",
  weight: 1.0,  // 将来的な重み付け用
  enabled: true
}
```

#### UI実装
```javascript
class PromptMixer {
  constructor(basePrompt = "") {
    this.basePrompt = basePrompt;
    this.layers = [];
    this.negativeLayers = [];
  }

  addLayer(layer) {
    this.layers.push(layer);
  }

  removeLayer(layerId) {
    this.layers = this.layers.filter(l => l.id !== layerId);
  }

  compile() {
    const positive = [
      this.basePrompt,
      ...this.layers
        .filter(l => l.enabled)
        .map(l => l.positiveAdd)
    ].filter(s => s.trim()).join(', ');

    const negative = this.negativeLayers
      .filter(l => l.enabled)
      .map(l => l.negativeAdd)
      .filter(s => s.trim())
      .join(', ');

    return {
      positive,
      negative,
      tokenCount: this.estimateTokens(positive)
    };
  }

  estimateTokens(text) {
    // 簡易的なトークン推定(カンマ区切り + 1.5倍)
    return Math.ceil(text.split(',').length * 1.5);
  }
}
```

#### プリセットレイヤー
```javascript
// デフォルトレイヤーセット
const DEFAULT_LAYERS = {
  styles: [
    { id: 'anime', name: 'アニメ風', positiveAdd: 'anime style, cel shading', negativeAdd: 'realistic, photo' },
    { id: 'realistic', name: '写実的', positiveAdd: 'photorealistic, photograph', negativeAdd: 'anime, cartoon' },
    { id: 'oil', name: '油絵風', positiveAdd: 'oil painting, canvas texture', negativeAdd: 'digital art' }
  ],
  quality: [
    { id: '8k', name: '8K高画質', positiveAdd: '8k, ultra detailed, masterpiece', negativeAdd: '' },
    { id: 'sharp', name: '高精細', positiveAdd: 'highly detailed, sharp focus', negativeAdd: 'blurry, soft' },
    { id: 'pro', name: 'プロ品質', positiveAdd: 'professional, award-winning', negativeAdd: 'amateur' }
  ],
  lighting: [
    { id: 'dramatic', name: 'ドラマチック', positiveAdd: 'dramatic lighting, cinematic', negativeAdd: 'flat lighting' },
    { id: 'soft', name: 'ソフト', positiveAdd: 'soft lighting, diffused', negativeAdd: 'harsh shadows' },
    { id: 'golden', name: 'ゴールデンアワー', positiveAdd: 'golden hour, warm lighting', negativeAdd: '' }
  ],
  negative: [
    { id: 'standard-ng', name: '標準NG', negativeAdd: 'blurry, low quality, watermark, text, signature', positiveAdd: '' },
    { id: 'anatomy-fix', name: '人体崩壊防止', negativeAdd: 'bad anatomy, extra limbs, missing limbs, bad hands', positiveAdd: '' }
  ]
};
```

### 実装チェックリスト
- [ ] PromptMixerクラス実装
- [ ] レイヤーUI実装(チェックボックス)
- [ ] リアルタイムプレビュー(最終プロンプト表示)
- [ ] トークンカウンター
- [ ] デフォルトレイヤーセット登録
- [ ] カスタムレイヤー作成機能
- [ ] レイヤーのインポート/エクスポート

### 成果物
- ✅ 直感的なプロンプト組み立てUI
- ✅ リアルタイムプレビュー
- ✅ トークン数監視

---

## 🎭 Phase 3: スタイルプリセット

### 目的
高品質なプロンプトをワンクリックで適用できるライブラリ

### プリセットカテゴリ

#### 1. スタイル別
- アニメ風(Ghibli)
- アニメ風(Makoto Shinkai)
- フォトリアル
- サイバーパンク
- ファンタジー
- 油絵風
- 水彩風
- ペン画

#### 2. アーティスト別
- Greg Rutkowski風
- Artgerm風
- Ross Tran風
- Studio Ghibli風

#### 3. 用途別
- キャラクターデザイン
- 背景/風景
- コンセプトアート
- ポートレート
- アイコン/アバター

### データ構造
```javascript
{
  id: "preset-ghibli",
  name: "アニメ風(Ghibli)",
  category: "スタイル",
  tags: ["アニメ", "ジブリ", "手描き"],

  description: "スタジオジブリ風のアニメーション調",

  positivePrompt: "studio ghibli style, anime, hand-drawn, traditional animation, cel shading, watercolor background, warm colors, nostalgic atmosphere",
  negativePrompt: "realistic, photo, 3d render, cgi, digital painting",

  recommendedParams: {
    steps: 28,
    cfgScale: 7.0,
    sampler: "DPM++ 2M Karras",
    width: 768,
    height: 512
  },

  preview: "/assets/presets/ghibli-preview.jpg",

  usage: {
    applyCount: 124,
    rating: 4.8
  },

  createdAt: "2025-01-08T00:00:00.000Z",
  author: "system"  // system | user
}
```

### UI実装

#### プリセットライブラリ画面
```html
<div class="preset-library">
  <div class="preset-filters">
    <button class="filter-btn active" data-category="all">すべて</button>
    <button class="filter-btn" data-category="スタイル">スタイル</button>
    <button class="filter-btn" data-category="アーティスト">アーティスト</button>
    <button class="filter-btn" data-category="用途">用途</button>
  </div>

  <div class="preset-grid">
    <!-- プリセットカード -->
    <div class="preset-card" data-preset-id="preset-ghibli">
      <div class="preset-preview">
        <img src="preview.jpg" alt="Ghibli Style">
      </div>
      <div class="preset-info">
        <h3>アニメ風(Ghibli)</h3>
        <p>スタジオジブリ風のアニメーション調</p>
        <div class="preset-tags">
          <span class="tag">アニメ</span>
          <span class="tag">ジブリ</span>
        </div>
        <div class="preset-stats">
          ⭐ 4.8 | 🎨 124回使用
        </div>
      </div>
      <div class="preset-actions">
        <button class="btn btn-primary apply-preset">適用</button>
        <button class="btn btn-secondary preview-preset">プレビュー</button>
      </div>
    </div>
  </div>
</div>
```

#### プリセット適用ロジック
```javascript
class StylePresetManager {
  async applyPreset(presetId, targetPromptId) {
    const preset = await this.presetsManager.findById(presetId);
    const prompt = await this.promptsManager.findById(targetPromptId);

    // プロンプトにプリセットを適用
    const updatedPrompt = {
      ...prompt,
      sdConfig: {
        ...prompt.sdConfig,
        positivePrompt: this.mergePrompts(
          prompt.sdConfig.positivePrompt,
          preset.positivePrompt
        ),
        negativePrompt: this.mergePrompts(
          prompt.sdConfig.negativePrompt,
          preset.negativePrompt
        ),
        parameters: {
          ...prompt.sdConfig.parameters,
          ...preset.recommendedParams
        },
        stylePresets: [
          ...prompt.sdConfig.stylePresets,
          presetId
        ]
      }
    };

    await this.promptsManager.update(targetPromptId, updatedPrompt);

    // 使用統計更新
    await this.updatePresetStats(presetId);
  }

  mergePrompts(base, addition) {
    // 重複を排除してマージ
    const baseTokens = base.split(',').map(s => s.trim());
    const addTokens = addition.split(',').map(s => s.trim());
    const merged = [...new Set([...baseTokens, ...addTokens])];
    return merged.filter(s => s).join(', ');
  }
}
```

### 初期プリセットデータ

`data/style-presets.json`:
```json
[
  {
    "name": "アニメ風(Ghibli)",
    "category": "スタイル",
    "tags": ["アニメ", "ジブリ"],
    "positivePrompt": "studio ghibli style, anime, hand-drawn, traditional animation, cel shading, watercolor background, warm colors, nostalgic atmosphere",
    "negativePrompt": "realistic, photo, 3d render, cgi, digital painting",
    "recommendedParams": {
      "steps": 28,
      "cfgScale": 7.0,
      "sampler": "DPM++ 2M Karras"
    }
  },
  {
    "name": "フォトリアル",
    "category": "スタイル",
    "tags": ["写実", "リアル"],
    "positivePrompt": "photograph, photorealistic, 8k uhd, dslr, professional photography, studio lighting, sharp focus, physically-based rendering",
    "negativePrompt": "painting, drawing, art, anime, cartoon, sketch, low quality",
    "recommendedParams": {
      "steps": 30,
      "cfgScale": 8.0,
      "sampler": "DPM++ SDE Karras"
    }
  }
]
```

### 実装チェックリスト
- [ ] StylePresetManagerクラス実装
- [ ] IndexedDBにstylePresetsストア追加
- [ ] プリセットライブラリUI
- [ ] フィルタリング機能
- [ ] プリセット適用ロジック
- [ ] 使用統計記録
- [ ] 初期プリセットデータ登録
- [ ] カスタムプリセット作成機能
- [ ] プリセットのインポート/エクスポート

### 成果物
- ✅ ワンクリックプリセット適用
- ✅ 10種類以上の高品質プリセット
- ✅ コミュニティ共有機能の基盤

---

## 🔄 Phase 4: バリエーションジェネレーター

### 目的
テンプレート変数を使って複数バリエーションを一括生成

### 機能仕様

#### 変数置換システム
```javascript
// テンプレート
"{{subject}} {{action}}, {{time}}, {{style}}, 8k"

// 変数定義
{
  subject: ["cat", "dog", "bird"],
  action: ["sitting", "running", "flying"],
  time: ["sunrise", "sunset", "night"],
  style: ["anime", "realistic"]
}

// 生成: 3 × 3 × 3 × 2 = 54 パターン
```

#### UI設計
```html
<div class="variation-generator">
  <div class="template-editor">
    <label>テンプレート</label>
    <textarea id="variation-template">
      {{subject}} {{action}}, {{time}}, {{style}}, 8k, masterpiece
    </textarea>
  </div>

  <div class="variables-editor">
    <h3>変数定義</h3>

    <div class="variable-item">
      <label>{{subject}}</label>
      <input type="text" placeholder="カンマ区切り: cat, dog, bird">
      <div class="variable-values">
        <span class="tag">cat</span>
        <span class="tag">dog</span>
        <span class="tag">bird</span>
      </div>
    </div>

    <div class="variable-item">
      <label>{{action}}</label>
      <input type="text" placeholder="カンマ区切り: sitting, running">
      <div class="variable-values">
        <span class="tag">sitting</span>
        <span class="tag">running</span>
      </div>
    </div>

    <button class="btn btn-secondary">+ 変数追加</button>
  </div>

  <div class="generation-preview">
    <h3>生成プレビュー (最大100件表示)</h3>
    <p>総パターン数: <strong>54</strong></p>

    <div class="preview-list">
      <div class="preview-item">
        <span class="variation-number">#1</span>
        cat sitting, sunrise, anime, 8k, masterpiece
      </div>
      <div class="preview-item">
        <span class="variation-number">#2</span>
        cat sitting, sunset, anime, 8k, masterpiece
      </div>
      <!-- ... -->
    </div>
  </div>

  <div class="generation-actions">
    <button class="btn btn-primary" id="generate-all">
      すべて生成 (54件)
    </button>
    <button class="btn btn-secondary" id="generate-selected">
      選択したもののみ生成
    </button>
  </div>
</div>
```

#### 実装ロジック
```javascript
class VariationGenerator {
  constructor(template, variables) {
    this.template = template;
    this.variables = variables;  // { subject: ["cat", "dog"], ... }
  }

  generateAll() {
    const variations = [];
    const keys = Object.keys(this.variables);
    const combinations = this.cartesianProduct(
      keys.map(k => this.variables[k])
    );

    combinations.forEach((combo, index) => {
      let prompt = this.template;
      keys.forEach((key, i) => {
        prompt = prompt.replace(
          new RegExp(`{{${key}}}`, 'g'),
          combo[i]
        );
      });

      variations.push({
        id: `var-${index}`,
        prompt,
        variables: Object.fromEntries(
          keys.map((k, i) => [k, combo[i]])
        )
      });
    });

    return variations;
  }

  cartesianProduct(arrays) {
    return arrays.reduce(
      (acc, curr) => acc.flatMap(x => curr.map(y => [...x, y])),
      [[]]
    );
  }

  async saveAsPrompts(variations, baseConfig) {
    const saved = [];
    for (const variation of variations) {
      const prompt = {
        title: this.generateTitle(variation),
        content: variation.prompt,
        tags: ["バリエーション"],
        sdConfig: {
          ...baseConfig,
          positivePrompt: variation.prompt
        }
      };

      const savedPrompt = await this.promptsManager.add(prompt);
      saved.push(savedPrompt);
    }
    return saved;
  }

  generateTitle(variation) {
    // 変数値から自動タイトル生成
    const values = Object.values(variation.variables);
    return values.join(' - ');
  }
}
```

#### 高度な変数機能

##### 1. 条件付き変数
```javascript
{
  style: ["anime", "realistic"],
  quality: {
    "anime": "8k, cel shading, vibrant",
    "realistic": "8k, photorealistic, sharp"
  }
}
```

##### 2. ランダムサンプリング
```javascript
// 全組み合わせから10件だけランダム抽出
generator.generateRandom(10);
```

##### 3. ウェイト付き変数
```javascript
{
  time: [
    { value: "sunset", weight: 3 },  // 3倍の確率
    { value: "sunrise", weight: 1 },
    { value: "night", weight: 1 }
  ]
}
```

### 実装チェックリスト
- [ ] VariationGeneratorクラス実装
- [ ] テンプレートエディタUI
- [ ] 変数定義UI(動的追加/削除)
- [ ] リアルタイムプレビュー
- [ ] デカルト積計算
- [ ] 一括プロンプト生成
- [ ] 条件付き変数対応
- [ ] ランダムサンプリング
- [ ] バリエーション保存

### 成果物
- ✅ テンプレートから一括バリエーション生成
- ✅ 最大数千パターンの自動生成
- ✅ A/Bテスト用データセット作成

---

## 🔬 Phase 5: 高度な機能

### 5.1 プロンプト分析&最適化

#### 分析項目
1. **曖昧な単語検出**
   - "beautiful", "nice" → 具体的な表現を提案

2. **スタイル指定チェック**
   - スタイル未指定 → 推奨スタイルを提案

3. **品質キーワード充足度**
   - "8k", "masterpiece" 等の有無

4. **トークン使用率**
   - 75トークン制限に対する使用率

5. **ネガティブプロンプト推奨**
   - スタイルに応じたNG要素提案

#### 実装例
```javascript
class PromptAnalyzer {
  analyze(prompt) {
    const warnings = [];
    const suggestions = [];

    // 1. 曖昧な単語
    const vagueWords = ['beautiful', 'nice', 'good', 'amazing', 'great'];
    vagueWords.forEach(word => {
      if (new RegExp(`\\b${word}\\b`, 'i').test(prompt)) {
        warnings.push({
          type: 'vague-word',
          word,
          message: `"${word}" は抽象的。具体的な表現を推奨`,
          suggestion: this.getSuggestionForVagueWord(word)
        });
      }
    });

    // 2. スタイル指定
    const styleKeywords = ['anime', 'realistic', 'oil painting', 'watercolor'];
    if (!styleKeywords.some(s => prompt.toLowerCase().includes(s))) {
      suggestions.push({
        type: 'missing-style',
        message: 'スタイル指定がありません',
        options: ['anime style', 'photorealistic', 'oil painting']
      });
    }

    // 3. 品質キーワード
    const qualityKeywords = ['8k', 'masterpiece', 'highly detailed', 'sharp focus'];
    const foundQuality = qualityKeywords.filter(q =>
      prompt.toLowerCase().includes(q)
    );
    if (foundQuality.length < 2) {
      suggestions.push({
        type: 'quality-boost',
        message: '品質キーワードの追加を推奨',
        keywords: qualityKeywords.filter(q => !foundQuality.includes(q))
      });
    }

    // 4. トークン数
    const tokens = this.estimateTokens(prompt);
    const tokenUsage = (tokens / 75) * 100;

    return {
      warnings,
      suggestions,
      stats: {
        tokens,
        tokenUsage: Math.round(tokenUsage),
        characterCount: prompt.length
      }
    };
  }

  getSuggestionForVagueWord(word) {
    const replacements = {
      'beautiful': ['highly detailed', 'intricate design', 'elegant composition'],
      'nice': ['well-composed', 'harmonious colors', 'balanced'],
      'good': ['high quality', 'professional grade', 'well-executed']
    };
    return replacements[word] || [];
  }

  estimateTokens(text) {
    // CLIP tokenizer の簡易推定
    return Math.ceil(text.split(/[\s,]+/).length * 1.2);
  }
}
```

### 5.2 A/B比較ギャラリー

#### 機能概要
- 同じシード値で異なるプロンプトを比較
- 生成画像の評価・レーティング
- プロンプトの差分ハイライト

#### データ構造
```javascript
{
  id: "comparison-123",
  name: "猫のスタイル比較",

  variants: [
    {
      id: "variant-a",
      name: "アニメ風",
      promptId: "prompt-anime-cat",
      seed: 12345,
      generatedImage: "data:image/jpeg;base64,...",
      rating: 4.5,
      votes: { good: 12, bad: 2 }
    },
    {
      id: "variant-b",
      name: "リアル",
      promptId: "prompt-realistic-cat",
      seed: 12345,  // 同じシード
      generatedImage: "data:image/jpeg;base64,...",
      rating: 4.0,
      votes: { good: 8, bad: 4 }
    }
  ],

  createdAt: "2025-01-08T00:00:00.000Z"
}
```

#### UI実装
```html
<div class="ab-comparison">
  <div class="comparison-header">
    <h2>猫のスタイル比較</h2>
    <p>Seed: 12345</p>
  </div>

  <div class="comparison-grid">
    <div class="variant-card">
      <h3>Variant A: アニメ風</h3>
      <img src="generated-a.jpg" alt="Anime Cat">

      <div class="prompt-diff">
        <span class="diff-remove">- photorealistic</span>
        <span class="diff-add">+ anime style, cel shading</span>
      </div>

      <div class="rating">
        ⭐⭐⭐⭐⭐ 4.5/5.0
      </div>

      <div class="vote-buttons">
        <button class="btn-vote good">👍 Good (12)</button>
        <button class="btn-vote bad">👎 Bad (2)</button>
      </div>
    </div>

    <div class="variant-card">
      <h3>Variant B: リアル</h3>
      <img src="generated-b.jpg" alt="Realistic Cat">

      <div class="prompt-diff">
        <span class="diff-add">+ photorealistic, photograph</span>
        <span class="diff-remove">- anime style</span>
      </div>

      <div class="rating">
        ⭐⭐⭐⭐☆ 4.0/5.0
      </div>

      <div class="vote-buttons">
        <button class="btn-vote good">👍 Good (8)</button>
        <button class="btn-vote bad">👎 Bad (4)</button>
      </div>
    </div>
  </div>
</div>
```

### 実装チェックリスト

#### プロンプト分析
- [ ] PromptAnalyzerクラス実装
- [ ] 曖昧単語検出ロジック
- [ ] スタイル・品質チェック
- [ ] トークン推定アルゴリズム
- [ ] 改善提案生成
- [ ] 分析結果UI表示

#### A/B比較
- [ ] ComparisonManagerクラス実装
- [ ] 比較セット作成UI
- [ ] 差分ハイライト表示
- [ ] レーティングシステム
- [ ] 画像管理(Base64 or File API)
- [ ] IndexedDBに比較データ保存

### 成果物
- ✅ 自動プロンプト最適化提案
- ✅ 学習支援機能
- ✅ A/Bテスト実験環境

---

## 📚 補足資料

### 参考リンク
- [Stable Diffusion Prompt Guide](https://stable-diffusion-art.com/prompt-guide/)
- [AUTOMATIC1111 WebUI Documentation](https://github.com/AUTOMATIC1111/stable-diffusion-webui)
- [Civitai Prompts Database](https://civitai.com/)

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
| プロンプト作成時間 | 5分/件 | 1分/件 |
| バリエーション生成 | 手動1件 | 自動50件 |
| プリセット適用率 | 0% | 70% |
| ユーザー満足度 | - | 4.5/5.0 |

---

**次のアクション:** Phase 0 (Vite移行)の着手

**更新履歴:**
- 2025-01-08: 初版作成
