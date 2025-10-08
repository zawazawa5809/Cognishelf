/**
 * デフォルトプロンプトレイヤー定義
 * Stable Diffusion向けの事前定義されたレイヤーセット
 */

export const DEFAULT_LAYERS = {
  styles: [
    {
      id: 'anime',
      name: 'アニメ風',
      category: 'スタイル',
      positiveAdd: 'anime style, cel shading, vibrant colors',
      negativeAdd: 'realistic, photo',
      weight: 1.0,
      enabled: false
    },
    {
      id: 'realistic',
      name: '写実的',
      category: 'スタイル',
      positiveAdd: 'photorealistic, photograph, highly realistic',
      negativeAdd: 'anime, cartoon, illustration',
      weight: 1.0,
      enabled: false
    },
    {
      id: 'oil-painting',
      name: '油絵風',
      category: 'スタイル',
      positiveAdd: 'oil painting, canvas texture, traditional art',
      negativeAdd: 'digital art, photograph',
      weight: 1.0,
      enabled: false
    },
    {
      id: 'watercolor',
      name: '水彩風',
      category: 'スタイル',
      positiveAdd: 'watercolor painting, soft colors, paper texture',
      negativeAdd: 'digital, sharp edges',
      weight: 1.0,
      enabled: false
    }
  ],

  quality: [
    {
      id: '8k-quality',
      name: '8K高画質',
      category: '品質',
      positiveAdd: '8k uhd, ultra detailed, high resolution, masterpiece',
      negativeAdd: 'low quality, low resolution',
      weight: 1.0,
      enabled: false
    },
    {
      id: 'sharp-detail',
      name: '高精細',
      category: '品質',
      positiveAdd: 'highly detailed, sharp focus, crisp',
      negativeAdd: 'blurry, soft, out of focus',
      weight: 1.0,
      enabled: false
    },
    {
      id: 'professional',
      name: 'プロ品質',
      category: '品質',
      positiveAdd: 'professional, award-winning, best quality',
      negativeAdd: 'amateur, poor quality',
      weight: 1.0,
      enabled: false
    }
  ],

  lighting: [
    {
      id: 'dramatic-light',
      name: 'ドラマチック',
      category: 'ライティング',
      positiveAdd: 'dramatic lighting, cinematic lighting, high contrast',
      negativeAdd: 'flat lighting, even lighting',
      weight: 1.0,
      enabled: false
    },
    {
      id: 'soft-light',
      name: 'ソフト',
      category: 'ライティング',
      positiveAdd: 'soft lighting, diffused lighting, gentle',
      negativeAdd: 'harsh shadows, strong contrast',
      weight: 1.0,
      enabled: false
    },
    {
      id: 'golden-hour',
      name: 'ゴールデンアワー',
      category: 'ライティング',
      positiveAdd: 'golden hour, warm lighting, sunset glow',
      negativeAdd: 'cold lighting, harsh noon light',
      weight: 1.0,
      enabled: false
    },
    {
      id: 'studio-light',
      name: 'スタジオ照明',
      category: 'ライティング',
      positiveAdd: 'studio lighting, professional lighting setup',
      negativeAdd: 'natural lighting',
      weight: 1.0,
      enabled: false
    }
  ],

  composition: [
    {
      id: 'portrait',
      name: 'ポートレート',
      category: '構図',
      positiveAdd: 'portrait, close-up, centered composition',
      negativeAdd: 'full body, wide shot',
      weight: 1.0,
      enabled: false
    },
    {
      id: 'landscape',
      name: '風景',
      category: '構図',
      positiveAdd: 'landscape, wide shot, panoramic view',
      negativeAdd: 'close-up, portrait',
      weight: 1.0,
      enabled: false
    },
    {
      id: 'rule-of-thirds',
      name: '三分割法',
      category: '構図',
      positiveAdd: 'rule of thirds, balanced composition',
      negativeAdd: 'centered, symmetrical',
      weight: 1.0,
      enabled: false
    }
  ],

  negative: [
    {
      id: 'standard-ng',
      name: '標準NG',
      category: 'ネガティブ',
      positiveAdd: '',
      negativeAdd: 'blurry, low quality, watermark, text, signature, username, logo',
      weight: 1.0,
      enabled: true // デフォルトで有効
    },
    {
      id: 'anatomy-fix',
      name: '人体崩壊防止',
      category: 'ネガティブ',
      positiveAdd: '',
      negativeAdd: 'bad anatomy, extra limbs, missing limbs, bad hands, mutated hands, fused fingers',
      weight: 1.0,
      enabled: false
    },
    {
      id: 'face-quality',
      name: '顔品質向上',
      category: 'ネガティブ',
      positiveAdd: '',
      negativeAdd: 'ugly face, deformed face, bad eyes, cross-eyed, asymmetric eyes',
      weight: 1.0,
      enabled: false
    }
  ]
};

/**
 * カテゴリ別にレイヤーを取得
 */
export function getLayersByCategory(category) {
  const allLayers = Object.values(DEFAULT_LAYERS).flat();
  return allLayers.filter(layer => layer.category === category);
}

/**
 * 全レイヤーをフラット配列で取得
 */
export function getAllLayers() {
  return Object.values(DEFAULT_LAYERS).flat();
}

/**
 * IDでレイヤーを検索
 */
export function getLayerById(id) {
  const allLayers = getAllLayers();
  return allLayers.find(layer => layer.id === id);
}
