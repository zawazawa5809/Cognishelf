/**
 * PromptMixerUI - プロンプトミキサーのUIコンポーネント
 */

import { PromptMixer } from './PromptMixer.js';
import { DEFAULT_LAYERS } from './defaultLayers.js';

export class PromptMixerUI {
  constructor() {
    this.mixer = new PromptMixer();
    this.currentCategory = 'スタイル';
    this.isVisible = false;

    // DOM要素
    this.container = null;
    this.layersContainer = null;
    this.tabs = [];
    this.previewPositive = null;
    this.previewNegative = null;
    this.tokenBadge = null;

    this.init();
  }

  init() {
    // デフォルトレイヤーをロード
    this.loadDefaultLayers();

    // イベントリスナー設定は遅延(DOM読み込み後)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupEventListeners());
    } else {
      this.setupEventListeners();
    }
  }

  loadDefaultLayers() {
    // 全カテゴリのレイヤーを追加(無効状態で)
    Object.values(DEFAULT_LAYERS).flat().forEach(layer => {
      this.mixer.addLayer({ ...layer, enabled: layer.enabled || false });
    });
  }

  setupEventListeners() {
    // トグルボタン
    const toggleBtn = document.getElementById('toggle-mixer-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggle());
    }

    // タブボタン
    this.tabs = document.querySelectorAll('.mixer-tab');
    this.tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const category = e.target.dataset.category;
        this.switchCategory(category);
      });
    });

    // 適用ボタン
    const applyBtn = document.getElementById('apply-mixer-btn');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => this.applyToPrompt());
    }

    // DOM要素参照を保存
    this.container = document.getElementById('prompt-mixer-container');
    this.layersContainer = document.getElementById('mixer-layers-container');
    this.previewPositive = document.getElementById('preview-positive');
    this.previewNegative = document.getElementById('preview-negative');
    this.tokenBadge = document.getElementById('preview-token-count');
  }

  toggle() {
    this.isVisible = !this.isVisible;
    if (this.container) {
      this.container.style.display = this.isVisible ? 'block' : 'none';
    }

    if (this.isVisible) {
      this.render();
      this.updatePreview();
    }
  }

  switchCategory(category) {
    this.currentCategory = category;

    // タブのアクティブ状態更新
    this.tabs.forEach(tab => {
      if (tab.dataset.category === category) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    this.render();
  }

  render() {
    if (!this.layersContainer) return;

    const layers = this.mixer.getLayersByCategory(this.currentCategory);

    if (layers.length === 0) {
      this.layersContainer.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--primary-400);">
          このカテゴリにはレイヤーがありません
        </div>
      `;
      return;
    }

    this.layersContainer.innerHTML = layers.map(layer => `
      <div class="mixer-layer" data-layer-id="${layer.id}">
        <input
          type="checkbox"
          class="mixer-layer-checkbox"
          id="layer-${layer.id}"
          ${layer.enabled ? 'checked' : ''}
          data-layer-id="${layer.id}"
        >
        <div class="mixer-layer-info">
          <div class="mixer-layer-name">${this.escapeHtml(layer.name)}</div>
          ${layer.positiveAdd ? `
            <div class="mixer-layer-prompt positive">+ ${this.escapeHtml(layer.positiveAdd)}</div>
          ` : ''}
          ${layer.negativeAdd ? `
            <div class="mixer-layer-prompt negative">- ${this.escapeHtml(layer.negativeAdd)}</div>
          ` : ''}
        </div>
      </div>
    `).join('');

    // チェックボックスのイベントリスナー
    this.layersContainer.querySelectorAll('.mixer-layer-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const layerId = e.target.dataset.layerId;
        this.mixer.toggleLayer(layerId, e.target.checked);
        this.updatePreview();
      });
    });
  }

  updatePreview() {
    const preview = this.mixer.getFormattedPreview();

    // プレビューテキスト更新
    if (this.previewPositive) {
      this.previewPositive.textContent = preview.positive || '';
    }

    if (this.previewNegative) {
      this.previewNegative.textContent = preview.negative || '';
    }

    // トークンバッジ更新
    if (this.tokenBadge) {
      const totalTokens = preview.stats.totalTokens;
      this.tokenBadge.textContent = `トークン: ${totalTokens}`;

      // 75トークン超過で警告
      if (totalTokens > 75) {
        this.tokenBadge.classList.add('warning');
      } else {
        this.tokenBadge.classList.remove('warning');
      }
    }
  }

  applyToPrompt() {
    const { positive, negative } = this.mixer.compile();

    // プロンプト内容フィールドに適用
    const promptContentField = document.getElementById('prompt-content');
    if (promptContentField) {
      promptContentField.value = positive;
    }

    // トースト通知
    if (window.app && window.app.showToast) {
      window.app.showToast('ミキサー結果を適用しました', 'success');
    }

    // ミキサーを閉じる(オプション)
    // this.toggle();
  }

  setBasePrompt(prompt) {
    this.mixer.setBasePrompt(prompt);
    this.updatePreview();
  }

  getCompiledPrompt() {
    return this.mixer.compile();
  }

  reset() {
    this.mixer.reset();
    this.loadDefaultLayers();
    this.render();
    this.updatePreview();
  }

  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}
