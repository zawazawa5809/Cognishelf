/**
 * プロンプトミキサー - レイヤー型プロンプト構築エンジン
 * 複数のレイヤーを組み合わせて最終的なプロンプトを生成する
 */

import { getAllLayers } from './defaultLayers.js';

export class PromptMixer {
  constructor(basePrompt = '') {
    this.basePrompt = basePrompt;
    this.layers = [];
    this.customLayers = [];
  }

  /**
   * ベースプロンプトを設定
   */
  setBasePrompt(prompt) {
    this.basePrompt = prompt;
  }

  /**
   * レイヤーを追加
   */
  addLayer(layer) {
    // 既存レイヤーIDと重複しないようチェック
    if (!this.layers.find(l => l.id === layer.id)) {
      this.layers.push({ ...layer, enabled: true });
    }
  }

  /**
   * レイヤーを削除
   */
  removeLayer(layerId) {
    this.layers = this.layers.filter(l => l.id !== layerId);
  }

  /**
   * レイヤーの有効/無効を切り替え
   */
  toggleLayer(layerId, enabled) {
    const layer = this.layers.find(l => l.id === layerId);
    if (layer) {
      layer.enabled = enabled !== undefined ? enabled : !layer.enabled;
    }
  }

  /**
   * レイヤーをIDで取得
   */
  getLayer(layerId) {
    return this.layers.find(l => l.id === layerId);
  }

  /**
   * 全レイヤーを取得
   */
  getAllLayers() {
    return [...this.layers];
  }

  /**
   * 有効なレイヤーのみ取得
   */
  getEnabledLayers() {
    return this.layers.filter(l => l.enabled);
  }

  /**
   * カテゴリ別にレイヤーを取得
   */
  getLayersByCategory(category) {
    return this.layers.filter(l => l.category === category);
  }

  /**
   * カスタムレイヤーを作成
   */
  createCustomLayer(config) {
    const customLayer = {
      id: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: config.name || 'カスタムレイヤー',
      category: config.category || 'カスタム',
      positiveAdd: config.positiveAdd || '',
      negativeAdd: config.negativeAdd || '',
      weight: config.weight || 1.0,
      enabled: config.enabled !== undefined ? config.enabled : true,
      isCustom: true
    };
    this.customLayers.push(customLayer);
    this.addLayer(customLayer);
    return customLayer;
  }

  /**
   * 最終プロンプトをコンパイル
   */
  compile() {
    const enabledLayers = this.getEnabledLayers();

    // ポジティブプロンプトの組み立て
    const positiveParts = [
      this.basePrompt.trim(),
      ...enabledLayers
        .filter(l => l.positiveAdd)
        .map(l => l.positiveAdd.trim())
    ].filter(s => s.length > 0);

    const positive = positiveParts.join(', ');

    // ネガティブプロンプトの組み立て
    const negativeParts = enabledLayers
      .filter(l => l.negativeAdd)
      .map(l => l.negativeAdd.trim())
      .filter(s => s.length > 0);

    const negative = negativeParts.join(', ');

    // トークン数推定
    const tokenCount = this.estimateTokens(positive);
    const negativeTokenCount = this.estimateTokens(negative);

    return {
      positive,
      negative,
      tokenCount,
      negativeTokenCount,
      totalTokens: tokenCount + negativeTokenCount,
      layerCount: enabledLayers.length
    };
  }

  /**
   * トークン数を推定(簡易版)
   * カンマ区切り要素数 × 1.5倍
   */
  estimateTokens(text) {
    if (!text || text.trim().length === 0) return 0;
    const parts = text.split(',').filter(s => s.trim().length > 0);
    return Math.ceil(parts.length * 1.5);
  }

  /**
   * デフォルトレイヤーをロード
   */
  loadDefaultLayers() {
    const defaultLayers = getAllLayers();
    defaultLayers.forEach(layer => {
      if (layer.enabled) {
        this.addLayer(layer);
      }
    });
  }

  /**
   * 現在の状態をJSON形式でエクスポート
   */
  exportState() {
    return {
      basePrompt: this.basePrompt,
      layers: this.layers,
      customLayers: this.customLayers,
      compiled: this.compile()
    };
  }

  /**
   * JSON形式から状態をインポート
   */
  importState(state) {
    if (state.basePrompt !== undefined) {
      this.basePrompt = state.basePrompt;
    }
    if (state.layers) {
      this.layers = state.layers;
    }
    if (state.customLayers) {
      this.customLayers = state.customLayers;
    }
  }

  /**
   * 状態をリセット
   */
  reset() {
    this.basePrompt = '';
    this.layers = [];
    this.customLayers = [];
  }

  /**
   * プレビュー用の整形されたテキストを生成
   */
  getFormattedPreview() {
    const { positive, negative, tokenCount, negativeTokenCount } = this.compile();

    return {
      positive: this.formatPromptForDisplay(positive),
      negative: this.formatPromptForDisplay(negative),
      stats: {
        positiveTokens: tokenCount,
        negativeTokens: negativeTokenCount,
        totalTokens: tokenCount + negativeTokenCount,
        positiveLength: positive.length,
        negativeLength: negative.length
      }
    };
  }

  /**
   * プロンプトを表示用に整形(改行挿入)
   */
  formatPromptForDisplay(prompt) {
    if (!prompt) return '';
    return prompt.split(', ').join(',\n');
  }

  /**
   * レイヤーの並び順を変更
   */
  reorderLayer(layerId, newIndex) {
    const currentIndex = this.layers.findIndex(l => l.id === layerId);
    if (currentIndex === -1 || newIndex < 0 || newIndex >= this.layers.length) {
      return false;
    }

    const [layer] = this.layers.splice(currentIndex, 1);
    this.layers.splice(newIndex, 0, layer);
    return true;
  }

  /**
   * カテゴリ別のレイヤー統計を取得
   */
  getLayerStats() {
    const stats = {};
    this.layers.forEach(layer => {
      if (!stats[layer.category]) {
        stats[layer.category] = { total: 0, enabled: 0 };
      }
      stats[layer.category].total++;
      if (layer.enabled) {
        stats[layer.category].enabled++;
      }
    });
    return stats;
  }
}
