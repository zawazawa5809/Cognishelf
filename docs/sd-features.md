# Stable Diffusion特化機能 詳細設計書

**作成日:** 2025-01-08
**バージョン:** 1.0

## 目次

1. [概要](#概要)
2. [プロンプトミキサー](#プロンプトミキサー)
3. [スタイルプリセット](#スタイルプリセット)
4. [バリエーションジェネレーター](#バリエーションジェネレーター)
5. [プロンプト分析](#プロンプト分析)
6. [データモデル](#データモデル)

---

## 概要

### 設計思想

**Stable Diffusion特有のワークフローに最適化:**
- プロンプトは「組み合わせ」が重要
- パラメータとプロンプトをセットで管理
- 高品質なプロンプトを簡単に再利用
- バリエーションの一括生成

### 既存機能との関係

```
┌─────────────────────────────────────┐
│ 既存機能 (汎用プロンプト管理)        │
│ - プロンプト保存・編集               │
│ - フォルダ管理                       │
│ - タグ・検索                         │
│ - JSONエクスポート                   │
└──────────────┬──────────────────────┘
               │
               │ 拡張
               ▼
┌─────────────────────────────────────┐
│ SD特化機能                           │
│ - プロンプトミキサー                 │
│ - スタイルプリセット                 │
│ - バリエーション生成                 │
│ - パラメータ保存                     │
│ - プロンプト分析                     │
└─────────────────────────────────────┘
```

---

## プロンプトミキサー

### 目的
プロンプトをレイヤー構造で組み立て、チェックボックスで簡単に組み合わせる

### UI構成

```
┌────────────────────────────────────────────────┐
│ プロンプトミキサー                             │
├────────────────────────────────────────────────┤
│                                                │
│ [ベースプロンプト] (必須)                      │
│ ┌────────────────────────────────────────┐   │
│ │ cat sitting on a chair                 │   │
│ └────────────────────────────────────────┘   │
│                                                │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│                                                │
│ [スタイルレイヤー]                             │
│ ☑ アニメ風                                     │
│   "anime style, cel shading, vibrant colors"  │
│ ☐ 写実的                                       │
│   "photorealistic, photograph, 8k uhd"        │
│ ☐ 油絵風                                       │
│   "oil painting, canvas texture"              │
│                                                │
│ [品質ブースター]                               │
│ ☑ 8K高画質                                     │
│   "8k, ultra detailed, masterpiece"           │
│ ☑ 高精細                                       │
│   "highly detailed, sharp focus"              │
│                                                │
│ [シーン要素]                                   │
│ ☑ ドラマチック照明                             │
│   "dramatic lighting, cinematic"              │
│ ☐ ゴールデンアワー                             │
│   "golden hour, warm lighting"                │
│                                                │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━     │
│                                                │
│ 📤 最終プロンプト (45 tokens / 75):            │
│ ┌────────────────────────────────────────┐   │
│ │ cat sitting on a chair, anime style,   │   │
│ │ cel shading, vibrant colors, 8k, ultra │   │
│ │ detailed, masterpiece, highly detailed,│   │
│ │ sharp focus, dramatic lighting,        │   │
│ │ cinematic                              │   │
│ └────────────────────────────────────────┘   │
│                                                │
│ 🚫 ネガティブプロンプト:                       │
│ ┌────────────────────────────────────────┐   │
│ │ realistic, photo, blurry, low quality  │   │
│ └────────────────────────────────────────┘   │
│                                                │
│ [💾 保存] [📋 コピー] [🎲 ランダム]             │
└────────────────────────────────────────────────┘
```

### データ構造

#### レイヤー定義
```javascript
{
  id: "layer-anime-style",
  category: "スタイル",  // スタイル | 品質 | シーン | ネガティブ
  name: "アニメ風",
  description: "セルシェーディングのアニメーション調",

  // ポジティブプロンプトへの追加
  positiveAdd: "anime style, cel shading, vibrant colors",

  // ネガティブプロンプトへの追加
  negativeAdd: "realistic, photo",

  // 将来の拡張用
  weight: 1.0,
  priority: 10,

  enabled: true,
  isDefault: false,
  createdAt: "2025-01-08T00:00:00.000Z"
}
```

#### プロンプト保存形式
```javascript
{
  id: "prompt-123",
  title: "アニメ風猫",

  // ミキサー設定
  mixer: {
    base: "cat sitting on a chair",
    enabledLayers: [
      "layer-anime-style",
      "layer-8k",
      "layer-detailed",
      "layer-dramatic-light"
    ]
  },

  // 最終プロンプト(自動生成)
  sdConfig: {
    positivePrompt: "cat sitting on a chair, anime style, cel shading...",
    negativePrompt: "realistic, photo, blurry, low quality"
  }
}
```

### 実装クラス

#### PromptMixer.js
```javascript
export class PromptMixer {
  constructor(basePrompt = "") {
    this.basePrompt = basePrompt;
    this.layers = [];
    this.negativeLayers = [];
  }

  addLayer(layer) {
    if (layer.category === 'ネガティブ') {
      this.negativeLayers.push(layer);
    } else {
      this.layers.push(layer);
    }
  }

  removeLayer(layerId) {
    this.layers = this.layers.filter(l => l.id !== layerId);
    this.negativeLayers = this.negativeLayers.filter(l => l.id !== layerId);
  }

  toggleLayer(layerId) {
    const layer = this.findLayer(layerId);
    if (layer) {
      layer.enabled = !layer.enabled;
    }
  }

  compile() {
    const positiveParts = [
      this.basePrompt.trim(),
      ...this.layers
        .filter(l => l.enabled)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
        .map(l => l.positiveAdd)
    ].filter(s => s);

    const negativeParts = this.negativeLayers
      .filter(l => l.enabled)
      .map(l => l.negativeAdd)
      .filter(s => s);

    const positive = this.removeDuplicates(positiveParts).join(', ');
    const negative = this.removeDuplicates(negativeParts).join(', ');

    return {
      positive,
      negative,
      tokenCount: this.estimateTokens(positive),
      layerCount: this.layers.filter(l => l.enabled).length
    };
  }

  removeDuplicates(parts) {
    // カンマ区切りでトークン化して重複削除
    const tokens = parts
      .flatMap(p => p.split(',').map(t => t.trim()))
      .filter(t => t);
    return [...new Set(tokens)];
  }

  estimateTokens(text) {
    // CLIP tokenizer の簡易推定
    // カンマ区切り要素数 × 1.2倍
    const tokens = text.split(',').length;
    return Math.ceil(tokens * 1.2);
  }

  getUsageStats() {
    return {
      baseLength: this.basePrompt.length,
      layersEnabled: this.layers.filter(l => l.enabled).length,
      layersTotal: this.layers.length,
      negativeLayersEnabled: this.negativeLayers.filter(l => l.enabled).length
    };
  }

  // シリアライズ
  toJSON() {
    return {
      base: this.basePrompt,
      layers: this.layers.map(l => ({
        id: l.id,
        enabled: l.enabled
      })),
      negativeLayers: this.negativeLayers.map(l => ({
        id: l.id,
        enabled: l.enabled
      }))
    };
  }

  // デシリアライズ
  static fromJSON(data, layerRegistry) {
    const mixer = new PromptMixer(data.base);

    data.layers.forEach(layerRef => {
      const layer = layerRegistry.findById(layerRef.id);
      if (layer) {
        layer.enabled = layerRef.enabled;
        mixer.addLayer(layer);
      }
    });

    data.negativeLayers.forEach(layerRef => {
      const layer = layerRegistry.findById(layerRef.id);
      if (layer) {
        layer.enabled = layerRef.enabled;
        mixer.negativeLayers.push(layer);
      }
    });

    return mixer;
  }

  findLayer(layerId) {
    return this.layers.find(l => l.id === layerId) ||
           this.negativeLayers.find(l => l.id === layerId);
  }
}
```

### デフォルトレイヤーセット

#### data/default-layers.json
```json
{
  "styles": [
    {
      "name": "アニメ風",
      "category": "スタイル",
      "positiveAdd": "anime style, cel shading, vibrant colors",
      "negativeAdd": "realistic, photo",
      "priority": 10
    },
    {
      "name": "写実的",
      "category": "スタイル",
      "positiveAdd": "photorealistic, photograph, 8k uhd, dslr",
      "negativeAdd": "anime, cartoon, painting",
      "priority": 10
    },
    {
      "name": "油絵風",
      "category": "スタイル",
      "positiveAdd": "oil painting, canvas texture, brush strokes",
      "negativeAdd": "digital art, smooth",
      "priority": 10
    }
  ],
  "quality": [
    {
      "name": "8K高画質",
      "category": "品質",
      "positiveAdd": "8k, ultra detailed, masterpiece",
      "negativeAdd": "low quality, blurry",
      "priority": 8
    },
    {
      "name": "高精細",
      "category": "品質",
      "positiveAdd": "highly detailed, sharp focus, crisp",
      "negativeAdd": "soft focus, blurry",
      "priority": 8
    },
    {
      "name": "プロ品質",
      "category": "品質",
      "positiveAdd": "professional, award-winning, best quality",
      "negativeAdd": "amateur, low quality",
      "priority": 7
    }
  ],
  "lighting": [
    {
      "name": "ドラマチック",
      "category": "シーン",
      "positiveAdd": "dramatic lighting, cinematic, high contrast",
      "negativeAdd": "flat lighting",
      "priority": 5
    },
    {
      "name": "ソフトライト",
      "category": "シーン",
      "positiveAdd": "soft lighting, diffused, gentle",
      "negativeAdd": "harsh shadows",
      "priority": 5
    },
    {
      "name": "ゴールデンアワー",
      "category": "シーン",
      "positiveAdd": "golden hour, warm lighting, sunset",
      "negativeAdd": "",
      "priority": 5
    }
  ],
  "negative": [
    {
      "name": "標準NG",
      "category": "ネガティブ",
      "positiveAdd": "",
      "negativeAdd": "blurry, low quality, watermark, text, signature, username",
      "priority": 0
    },
    {
      "name": "人体崩壊防止",
      "category": "ネガティブ",
      "positiveAdd": "",
      "negativeAdd": "bad anatomy, extra limbs, missing limbs, bad hands, malformed hands",
      "priority": 0
    }
  ]
}
```

---

## スタイルプリセット

### 目的
高品質なプロンプトをワンクリックで適用

### データ構造

```javascript
{
  id: "preset-ghibli",
  name: "アニメ風(Ghibli)",
  category: "スタイル",  // スタイル | アーティスト | 用途
  tags: ["アニメ", "ジブリ", "手描き"],

  description: "スタジオジブリ風のアニメーション調。温かみのある色彩と手描き感。",

  // プリセットプロンプト
  positivePrompt: "studio ghibli style, anime, hand-drawn, traditional animation, cel shading, watercolor background, warm colors, nostalgic atmosphere",
  negativePrompt: "realistic, photo, 3d render, cgi, digital painting",

  // 推奨パラメータ
  recommendedParams: {
    steps: 28,
    cfgScale: 7.0,
    sampler: "DPM++ 2M Karras",
    width: 768,
    height: 512,
    clipSkip: 2
  },

  // サンプル画像(Base64 or URL)
  preview: "data:image/jpeg;base64,/9j/4AAQSkZJRg...",

  // 使用統計
  usage: {
    applyCount: 124,
    rating: 4.8,
    lastUsed: "2025-01-08T14:23:00.000Z"
  },

  createdAt: "2025-01-08T00:00:00.000Z",
  updatedAt: "2025-01-08T00:00:00.000Z",
  author: "system"  // system | user
}
```

### プリセットカテゴリ

#### 1. スタイル別
- アニメ風(Ghibli)
- アニメ風(Makoto Shinkai)
- フォトリアル
- サイバーパンク
- ファンタジー
- 油絵風
- 水彩風
- ペン画・線画

#### 2. アーティスト別
- Greg Rutkowski風
- Artgerm風
- Ross Tran風
- WLOP風
- Ilya Kuvshinov風

#### 3. 用途別
- キャラクターデザイン
- 背景・風景
- コンセプトアート
- ポートレート
- アイコン・アバター
- アニメーション用

### 実装クラス

#### StylePresetManager.js
```javascript
export class StylePresetManager {
  constructor(presetsManager, promptsManager) {
    this.presetsManager = presetsManager;
    this.promptsManager = promptsManager;
  }

  async applyToPrompt(presetId, targetPromptId) {
    const preset = await this.presetsManager.findById(presetId);
    const prompt = await this.promptsManager.findById(targetPromptId);

    if (!preset || !prompt) {
      throw new Error('Preset or Prompt not found');
    }

    // プロンプトマージ
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
          ...(prompt.sdConfig.stylePresets || []),
          presetId
        ]
      }
    };

    await this.promptsManager.update(targetPromptId, updatedPrompt);

    // 使用統計更新
    await this.updateUsageStats(presetId);

    return updatedPrompt;
  }

  mergePrompts(base, addition) {
    // トークンを重複排除してマージ
    const baseTokens = this.tokenize(base);
    const addTokens = this.tokenize(addition);

    const merged = [...new Set([...baseTokens, ...addTokens])];
    return merged.filter(s => s).join(', ');
  }

  tokenize(prompt) {
    return prompt
      .split(',')
      .map(s => s.trim())
      .filter(s => s);
  }

  async updateUsageStats(presetId) {
    const preset = await this.presetsManager.findById(presetId);

    preset.usage.applyCount += 1;
    preset.usage.lastUsed = new Date().toISOString();

    await this.presetsManager.update(presetId, preset);
  }

  async createCustomPreset(data) {
    const preset = {
      name: data.name,
      category: data.category || 'カスタム',
      tags: data.tags || [],
      description: data.description || '',
      positivePrompt: data.positivePrompt,
      negativePrompt: data.negativePrompt || '',
      recommendedParams: data.recommendedParams || {},
      preview: data.preview || '',
      usage: {
        applyCount: 0,
        rating: 0,
        lastUsed: null
      },
      author: 'user'
    };

    return await this.presetsManager.add(preset);
  }

  async ratePreset(presetId, rating) {
    const preset = await this.presetsManager.findById(presetId);

    // 簡易的な平均評価計算
    const totalRatings = preset.usage.applyCount;
    const currentRating = preset.usage.rating || 0;

    const newRating = (currentRating * totalRatings + rating) / (totalRatings + 1);

    preset.usage.rating = newRating;

    await this.presetsManager.update(presetId, preset);

    return newRating;
  }
}
```

---

## バリエーションジェネレーター

### 目的
テンプレート変数で複数バリエーションを一括生成

### 変数記法

```
{{variable_name}}
```

### 使用例

#### 基本的な例
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

// 生成結果: 3 × 3 × 3 × 2 = 54 パターン
[
  "cat sitting, sunrise, anime, 8k",
  "cat sitting, sunset, anime, 8k",
  "cat sitting, night, anime, 8k",
  // ... (全54パターン)
]
```

#### 高度な例(条件付き変数)
```javascript
{
  style: ["anime", "realistic"],
  quality: {
    "anime": "8k, cel shading, vibrant",
    "realistic": "8k, photorealistic, sharp"
  }
}

// style="anime" の場合 → quality="8k, cel shading, vibrant"
// style="realistic" の場合 → quality="8k, photorealistic, sharp"
```

### データ構造

```javascript
{
  id: "variation-template-123",
  name: "動物バリエーション",

  template: "{{subject}} {{action}}, {{time}}, {{style}}, 8k, masterpiece",

  variables: {
    subject: {
      type: "list",
      values: ["cat", "dog", "bird", "rabbit"]
    },
    action: {
      type: "list",
      values: ["sitting", "running", "flying", "sleeping"]
    },
    time: {
      type: "list",
      values: ["sunrise", "sunset", "night", "midday"]
    },
    style: {
      type: "list",
      values: ["anime", "realistic", "oil painting"]
    }
  },

  generationSettings: {
    mode: "all",  // all | random | weighted
    maxVariations: 100,
    randomSeed: null
  },

  baseConfig: {
    negativePrompt: "blurry, low quality",
    parameters: {
      steps: 28,
      cfgScale: 7.5,
      sampler: "DPM++ 2M Karras"
    }
  },

  createdAt: "2025-01-08T00:00:00.000Z"
}
```

### 実装クラス

#### VariationGenerator.js
```javascript
export class VariationGenerator {
  constructor(template, variables) {
    this.template = template;
    this.variables = variables;
  }

  generateAll() {
    const variableKeys = Object.keys(this.variables);
    const variableValues = variableKeys.map(key => {
      const varDef = this.variables[key];

      if (varDef.type === 'list') {
        return varDef.values;
      } else if (varDef.type === 'conditional') {
        // 条件付き変数の処理
        return Object.keys(varDef.mapping);
      }
    });

    const combinations = this.cartesianProduct(variableValues);

    return combinations.map((combo, index) => {
      return this.resolveTemplate(combo, variableKeys, index);
    });
  }

  cartesianProduct(arrays) {
    return arrays.reduce(
      (acc, curr) => acc.flatMap(x => curr.map(y => [...x, y])),
      [[]]
    );
  }

  resolveTemplate(values, keys, index) {
    let prompt = this.template;
    const variableMap = {};

    keys.forEach((key, i) => {
      const value = values[i];
      variableMap[key] = value;

      // 単純置換
      prompt = prompt.replace(
        new RegExp(`{{${key}}}`, 'g'),
        value
      );
    });

    // 条件付き変数の解決
    keys.forEach(key => {
      const varDef = this.variables[key];
      if (varDef.type === 'conditional') {
        const dependsOn = varDef.dependsOn;
        const conditionValue = variableMap[dependsOn];
        const resolvedValue = varDef.mapping[conditionValue];

        if (resolvedValue) {
          prompt = prompt.replace(
            new RegExp(`{{${key}}}`, 'g'),
            resolvedValue
          );
        }
      }
    });

    return {
      id: `variation-${index}`,
      prompt,
      variables: variableMap
    };
  }

  generateRandom(count) {
    const all = this.generateAll();

    if (all.length <= count) {
      return all;
    }

    // ランダムサンプリング
    const shuffled = all.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  async saveAsPrompts(variations, baseConfig, promptsManager) {
    const saved = [];

    for (const variation of variations) {
      const prompt = {
        title: this.generateTitle(variation),
        content: variation.prompt,
        tags: ["バリエーション"],
        sdConfig: {
          positivePrompt: variation.prompt,
          negativePrompt: baseConfig.negativePrompt || '',
          parameters: baseConfig.parameters || {},
          stylePresets: [],
          variations: [],
          stats: {
            generationCount: 0,
            lastUsed: null,
            rating: 0
          }
        }
      };

      const savedPrompt = await promptsManager.add(prompt);
      saved.push(savedPrompt);
    }

    return saved;
  }

  generateTitle(variation) {
    const values = Object.values(variation.variables);
    return values.join(' - ');
  }

  estimateTotalVariations() {
    const counts = Object.keys(this.variables).map(key => {
      const varDef = this.variables[key];
      if (varDef.type === 'list') {
        return varDef.values.length;
      } else if (varDef.type === 'conditional') {
        return Object.keys(varDef.mapping).length;
      }
      return 1;
    });

    return counts.reduce((a, b) => a * b, 1);
  }
}
```

---

## プロンプト分析

### 目的
プロンプトの品質を自動分析し、改善提案を提示

### 分析項目

#### 1. 曖昧な単語検出
```javascript
const VAGUE_WORDS = [
  'beautiful', 'nice', 'good', 'amazing', 'great',
  'cool', 'awesome', 'perfect', 'wonderful'
];
```

#### 2. スタイル指定チェック
```javascript
const STYLE_KEYWORDS = [
  'anime', 'realistic', 'photorealistic', 'photograph',
  'oil painting', 'watercolor', 'digital art', 'sketch'
];
```

#### 3. 品質キーワード充足度
```javascript
const QUALITY_KEYWORDS = [
  '8k', '4k', 'uhd', 'masterpiece', 'best quality',
  'highly detailed', 'ultra detailed', 'sharp focus',
  'professional', 'award-winning'
];
```

#### 4. トークン使用率
- CLIP tokenizer: 最大75トークン
- 推奨: 60トークン以下(余裕を持たせる)

#### 5. ネガティブプロンプト推奨
```javascript
const RECOMMENDED_NEGATIVES = {
  'anime': ['realistic', 'photo', '3d render'],
  'realistic': ['anime', 'cartoon', 'painting'],
  'oil painting': ['digital art', 'smooth', 'clean']
};
```

### データ構造(分析結果)

```javascript
{
  prompt: "cat sitting, beautiful, nice quality",

  analysis: {
    warnings: [
      {
        type: 'vague-word',
        word: 'beautiful',
        position: 13,
        message: '"beautiful" は抽象的。具体的な表現を推奨',
        suggestions: ['highly detailed', 'intricate design', 'elegant composition']
      },
      {
        type: 'vague-word',
        word: 'nice',
        position: 25,
        message: '"nice" は抽象的。具体的な表現を推奨',
        suggestions: ['well-composed', 'harmonious colors']
      }
    ],

    suggestions: [
      {
        type: 'missing-style',
        message: 'スタイル指定がありません',
        options: ['anime style', 'photorealistic', 'oil painting', 'watercolor']
      },
      {
        type: 'quality-boost',
        message: '品質キーワードの追加を推奨',
        keywords: ['8k', 'masterpiece', 'sharp focus', 'professional']
      },
      {
        type: 'negative-recommendation',
        message: 'ネガティブプロンプトの追加を推奨',
        keywords: ['blurry', 'low quality', 'watermark', 'text']
      }
    ],

    stats: {
      tokens: 12,
      tokenUsage: 16,  // 12/75 = 16%
      characterCount: 35,
      wordCount: 5,
      qualityKeywords: 0,
      styleSpecified: false
    },

    score: 3.5,  // 10点満点
    grade: 'C'   // S, A, B, C, D
  },

  optimized: "cat sitting, highly detailed, intricate fur texture, photorealistic, 8k, masterpiece, sharp focus",

  improvements: [
    { from: 'beautiful', to: 'highly detailed' },
    { from: 'nice quality', to: 'photorealistic, 8k, masterpiece, sharp focus' },
    { added: 'intricate fur texture' }
  ]
}
```

### 実装クラス

#### PromptAnalyzer.js
```javascript
export class PromptAnalyzer {
  constructor() {
    this.vagueWords = new Set([
      'beautiful', 'nice', 'good', 'amazing', 'great',
      'cool', 'awesome', 'perfect', 'wonderful'
    ]);

    this.styleKeywords = new Set([
      'anime', 'realistic', 'photorealistic', 'photograph',
      'oil painting', 'watercolor', 'digital art', 'sketch',
      'concept art', 'illustration'
    ]);

    this.qualityKeywords = new Set([
      '8k', '4k', 'uhd', 'hd', 'masterpiece', 'best quality',
      'highly detailed', 'ultra detailed', 'sharp focus',
      'professional', 'award-winning', 'trending'
    ]);
  }

  analyze(prompt) {
    const warnings = this.detectWarnings(prompt);
    const suggestions = this.generateSuggestions(prompt);
    const stats = this.calculateStats(prompt);
    const score = this.calculateScore(warnings, suggestions, stats);

    return {
      prompt,
      analysis: {
        warnings,
        suggestions,
        stats,
        score,
        grade: this.scoreToGrade(score)
      },
      optimized: this.generateOptimizedPrompt(prompt, warnings, suggestions),
      improvements: this.generateImprovements(prompt, warnings, suggestions)
    };
  }

  detectWarnings(prompt) {
    const warnings = [];
    const lowerPrompt = prompt.toLowerCase();

    // 曖昧な単語検出
    this.vagueWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const match = regex.exec(prompt);

      if (match) {
        warnings.push({
          type: 'vague-word',
          word,
          position: match.index,
          message: `"${word}" は抽象的。具体的な表現を推奨`,
          suggestions: this.getReplacementSuggestions(word)
        });
      }
    });

    return warnings;
  }

  generateSuggestions(prompt) {
    const suggestions = [];
    const lowerPrompt = prompt.toLowerCase();

    // スタイル未指定
    const hasStyle = Array.from(this.styleKeywords).some(
      style => lowerPrompt.includes(style)
    );

    if (!hasStyle) {
      suggestions.push({
        type: 'missing-style',
        message: 'スタイル指定がありません',
        options: ['anime style', 'photorealistic', 'oil painting', 'watercolor']
      });
    }

    // 品質キーワード不足
    const foundQuality = Array.from(this.qualityKeywords).filter(
      kw => lowerPrompt.includes(kw)
    );

    if (foundQuality.length < 2) {
      const remainingKeywords = Array.from(this.qualityKeywords).filter(
        kw => !foundQuality.includes(kw)
      );

      suggestions.push({
        type: 'quality-boost',
        message: '品質キーワードの追加を推奨',
        keywords: remainingKeywords.slice(0, 5)
      });
    }

    // ネガティブプロンプト推奨
    suggestions.push({
      type: 'negative-recommendation',
      message: 'ネガティブプロンプトの追加を推奨',
      keywords: ['blurry', 'low quality', 'watermark', 'text', 'signature']
    });

    return suggestions;
  }

  calculateStats(prompt) {
    const tokens = this.estimateTokens(prompt);
    const words = prompt.split(/\s+/).length;
    const chars = prompt.length;

    const qualityCount = Array.from(this.qualityKeywords).filter(
      kw => prompt.toLowerCase().includes(kw)
    ).length;

    const styleSpecified = Array.from(this.styleKeywords).some(
      style => prompt.toLowerCase().includes(style)
    );

    return {
      tokens,
      tokenUsage: Math.round((tokens / 75) * 100),
      characterCount: chars,
      wordCount: words,
      qualityKeywords: qualityCount,
      styleSpecified
    };
  }

  estimateTokens(text) {
    // CLIP tokenizer の簡易推定
    // カンマ区切り要素数 × 1.2倍
    const tokens = text.split(',').length;
    return Math.ceil(tokens * 1.2);
  }

  calculateScore(warnings, suggestions, stats) {
    let score = 10;

    // 警告によるペナルティ
    score -= warnings.length * 0.5;

    // 提案によるペナルティ
    score -= suggestions.length * 0.3;

    // トークン使用率ボーナス
    if (stats.tokenUsage > 80) {
      score -= 1;  // 使いすぎ
    } else if (stats.tokenUsage < 30) {
      score -= 0.5;  // 少なすぎ
    }

    return Math.max(0, Math.min(10, score));
  }

  scoreToGrade(score) {
    if (score >= 9) return 'S';
    if (score >= 7) return 'A';
    if (score >= 5) return 'B';
    if (score >= 3) return 'C';
    return 'D';
  }

  generateOptimizedPrompt(prompt, warnings, suggestions) {
    let optimized = prompt;

    // 曖昧な単語を置換
    warnings.forEach(warning => {
      if (warning.type === 'vague-word' && warning.suggestions.length > 0) {
        optimized = optimized.replace(
          new RegExp(`\\b${warning.word}\\b`, 'gi'),
          warning.suggestions[0]
        );
      }
    });

    // 品質キーワードを追加
    const qualitySuggestion = suggestions.find(s => s.type === 'quality-boost');
    if (qualitySuggestion && qualitySuggestion.keywords.length > 0) {
      optimized += ', ' + qualitySuggestion.keywords.slice(0, 3).join(', ');
    }

    return optimized;
  }

  generateImprovements(prompt, warnings, suggestions) {
    const improvements = [];

    warnings.forEach(warning => {
      if (warning.type === 'vague-word' && warning.suggestions.length > 0) {
        improvements.push({
          from: warning.word,
          to: warning.suggestions[0]
        });
      }
    });

    suggestions.forEach(suggestion => {
      if (suggestion.type === 'quality-boost') {
        improvements.push({
          added: suggestion.keywords.slice(0, 3).join(', ')
        });
      }
    });

    return improvements;
  }

  getReplacementSuggestions(vagueWord) {
    const replacements = {
      'beautiful': ['highly detailed', 'intricate design', 'elegant composition'],
      'nice': ['well-composed', 'harmonious colors', 'balanced'],
      'good': ['high quality', 'professional grade', 'well-executed'],
      'amazing': ['stunning', 'breathtaking', 'extraordinary detail'],
      'great': ['exceptional', 'outstanding quality', 'masterful']
    };

    return replacements[vagueWord.toLowerCase()] || ['detailed', 'high quality'];
  }
}
```

---

## データモデル

### IndexedDB Schema v2

```javascript
const DB_NAME = 'cognishelf-db';
const DB_VERSION = 2;

const schema = {
  prompts: {
    keyPath: 'id',
    indexes: [
      { name: 'title', keyPath: 'title', unique: false },
      { name: 'createdAt', keyPath: 'createdAt', unique: false },
      { name: 'tags', keyPath: 'tags', unique: false, multiEntry: true },
      { name: 'folder', keyPath: 'folder', unique: false }
    ]
  },

  contexts: {
    keyPath: 'id',
    indexes: [
      { name: 'title', keyPath: 'title', unique: false },
      { name: 'createdAt', keyPath: 'createdAt', unique: false },
      { name: 'category', keyPath: 'category', unique: false },
      { name: 'folder', keyPath: 'folder', unique: false }
    ]
  },

  folders: {
    keyPath: 'id',
    indexes: [
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'type', keyPath: 'type', unique: false }
    ]
  },

  // 新規追加 (v2)
  stylePresets: {
    keyPath: 'id',
    indexes: [
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'category', keyPath: 'category', unique: false },
      { name: 'tags', keyPath: 'tags', unique: false, multiEntry: true },
      { name: 'rating', keyPath: 'usage.rating', unique: false }
    ]
  },

  promptLayers: {
    keyPath: 'id',
    indexes: [
      { name: 'category', keyPath: 'category', unique: false },
      { name: 'name', keyPath: 'name', unique: false }
    ]
  },

  variationTemplates: {
    keyPath: 'id',
    indexes: [
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'createdAt', keyPath: 'createdAt', unique: false }
    ]
  }
};
```

### マイグレーションロジック

```javascript
async function upgradeDatabase(db, oldVersion, newVersion, transaction) {
  if (oldVersion < 2) {
    // プロンプトにsdConfigフィールド追加
    const promptStore = transaction.objectStore('prompts');
    const allPrompts = await promptStore.getAll();

    for (const prompt of allPrompts) {
      if (!prompt.sdConfig) {
        prompt.sdConfig = {
          positivePrompt: prompt.content,
          negativePrompt: '',
          parameters: {
            steps: 28,
            cfgScale: 7.5,
            sampler: 'DPM++ 2M Karras',
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

        await promptStore.put(prompt);
      }
    }

    // 新規ストア追加
    if (!db.objectStoreNames.contains('stylePresets')) {
      const presetStore = db.createObjectStore('stylePresets', { keyPath: 'id' });
      presetStore.createIndex('name', 'name', { unique: false });
      presetStore.createIndex('category', 'category', { unique: false });
      presetStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
      presetStore.createIndex('rating', 'usage.rating', { unique: false });
    }

    if (!db.objectStoreNames.contains('promptLayers')) {
      const layerStore = db.createObjectStore('promptLayers', { keyPath: 'id' });
      layerStore.createIndex('category', 'category', { unique: false });
      layerStore.createIndex('name', 'name', { unique: false });
    }

    if (!db.objectStoreNames.contains('variationTemplates')) {
      const templateStore = db.createObjectStore('variationTemplates', { keyPath: 'id' });
      templateStore.createIndex('name', 'name', { unique: false });
      templateStore.createIndex('createdAt', 'createdAt', { unique: false });
    }
  }
}
```

---

## まとめ

### 実装優先度

| Phase | 機能 | 優先度 | 工数 | ビジネス価値 |
|-------|------|--------|------|-------------|
| 0 | Vite移行 | 🔥 P0 | 1週間 | 開発効率化 |
| 1 | SD基盤 | 🔥 P0 | 3日 | データ管理基盤 |
| 2 | プロンプトミキサー | ⭐ P1 | 1週間 | UX向上(最大) |
| 3 | スタイルプリセット | ⭐ P1 | 3日 | 即戦力 |
| 4 | バリエーション生成 | 💡 P2 | 1週間 | 効率化 |
| 5 | プロンプト分析 | 💡 P2 | 1週間 | 学習支援 |

### 次のステップ

1. **ROADMAPドキュメント確認**
2. **Phase 0着手準備**
3. **Vite環境構築**
4. **モジュール分割実装**

---

**最終更新:** 2025-01-08
**レビュー:** 未実施
