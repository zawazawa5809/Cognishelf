/**
 * TemplateManager - テンプレート管理クラス
 * Phase 2: テンプレートライブラリ
 */

import {
  createTemplate,
  incrementTemplateUsage,
  updateTemplateRating,
  extractVariables,
  validateTemplate,
  templateFromJSON
} from '../models/Template.js';
import { formatDate, formatTime, formatDateTime } from '../utils/dateUtils.js';
import { InvertedIndex } from '../utils/InvertedIndex.js';

/**
 * テンプレート管理クラス
 */
export class TemplateManager {
  constructor(storageManager) {
    this.storage = storageManager;
    this.isInitialized = false;

    // Full-Text Search用転置インデックス
    this.searchIndex = new InvertedIndex();
    this.indexReady = false;
  }

  /**
   * 初期化 - デフォルトテンプレートを読み込み
   */
  async init() {
    if (this.isInitialized) return;

    try {
      // 既存のテンプレート数をチェック
      const existingTemplates = await this.storage.getAll();

      // システムテンプレートが未登録の場合のみ読み込み
      const systemTemplates = existingTemplates.filter(t => t.author === 'system');
      if (systemTemplates.length === 0) {
        await this.loadDefaultTemplates();
      }

      // Full-Text Search インデックス構築
      await this.buildSearchIndex();

      this.isInitialized = true;
    } catch (error) {
      console.error('TemplateManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * Full-Text Search インデックスを構築
   */
  async buildSearchIndex() {
    try {
      const templates = await this.storage.getAll();

      console.log(`Building search index for ${templates.length} templates...`);
      const startTime = performance.now();

      this.searchIndex.clear();
      this.searchIndex.bulkAdd(templates, [
        'name',
        'description',
        'category',
        'tags',
        'promptTemplate',
        'contextTemplate'
      ]);

      const endTime = performance.now();
      const duration = endTime - startTime;

      this.indexReady = true;

      const stats = this.searchIndex.getStats();
      console.log(`✅ Search index built in ${duration.toFixed(2)}ms`);
      console.log(`   - Documents: ${stats.totalDocuments}`);
      console.log(`   - Tokens: ${stats.totalTokens}`);
      console.log(`   - Avg tokens/doc: ${stats.averageTokensPerDocument.toFixed(1)}`);
      console.log(`   - Index size: ${(stats.indexSizeBytes / 1024).toFixed(2)} KB`);

    } catch (error) {
      console.error('Failed to build search index:', error);
      this.indexReady = false;
      // インデックス構築失敗は致命的ではない (フォールバック検索を使用)
    }
  }

  /**
   * インデックスを再構築
   */
  async rebuildSearchIndex() {
    await this.buildSearchIndex();
  }

  /**
   * デフォルトテンプレートをJSONファイルから読み込み
   * @throws {Error} ネットワークエラーまたはJSON解析エラー時
   */
  async loadDefaultTemplates() {
    try {
      const response = await fetch('/data/pm-templates.json');
      if (!response.ok) {
        const errorMsg = `テンプレート読み込み失敗: ${response.status} ${response.statusText}`;
        console.error(errorMsg);
        this.showUserNotification('warning', 'デフォルトテンプレートの読み込みに失敗しました。手動でインポートしてください。');
        throw new Error(errorMsg);
      }

      const templatesData = await response.json();

      if (!Array.isArray(templatesData) || templatesData.length === 0) {
        console.warn('Template data is empty or invalid');
        this.showUserNotification('info', 'テンプレートデータが空です。');
        return;
      }

      let successCount = 0;
      let failureCount = 0;

      for (const templateData of templatesData) {
        try {
          const template = createTemplate(templateData);
          await this.storage.add(template);
          successCount++;
        } catch (addError) {
          console.error(`Failed to add template: ${templateData.name}`, addError);
          failureCount++;
        }
      }

      console.log(`Loaded ${successCount}/${templatesData.length} default templates`);

      if (successCount > 0) {
        this.showUserNotification('success', `${successCount}件のテンプレートを読み込みました。`);
      }

      if (failureCount > 0) {
        this.showUserNotification('warning', `${failureCount}件のテンプレート読み込みに失敗しました。`);
      }
    } catch (error) {
      console.error('Failed to load default templates:', error);
      // デフォルトテンプレート読み込み失敗は致命的ではないので続行
      // ただしユーザーには通知済み
    }
  }

  /**
   * ユーザー通知を表示 (グローバルapp経由)
   * @param {string} type - 通知タイプ ('success' | 'error' | 'warning' | 'info')
   * @param {string} message - 通知メッセージ
   */
  showUserNotification(type, message) {
    if (typeof window !== 'undefined' && window.app && typeof window.app.showToast === 'function') {
      window.app.showToast(message);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }

  /**
   * すべてのテンプレートを取得
   * @returns {Promise<Array>} テンプレート配列
   */
  async getAllTemplates() {
    return await this.storage.getAll();
  }

  /**
   * カテゴリでフィルタリング (インデックス最適化版)
   * @param {string} category - カテゴリ名
   * @returns {Promise<Array>} フィルタリングされたテンプレート配列
   */
  async getTemplatesByCategory(category) {
    if (!category || category === 'all') {
      return await this.storage.getAll();
    }

    // IndexedDBManagerの最適化メソッドを使用
    if (typeof this.storage.findByCategory === 'function') {
      return await this.storage.findByCategory(category);
    }

    // フォールバック: 従来のフィルタリング
    const templates = await this.storage.getAll();
    return templates.filter(t => t.category === category);
  }

  /**
   * タグで検索 (インデックス最適化版)
   * @param {string} tag - タグ名
   * @returns {Promise<Array>} タグを含むテンプレート配列
   */
  async getTemplatesByTag(tag) {
    if (!tag) {
      return await this.storage.getAll();
    }

    // IndexedDBManagerの最適化メソッドを使用
    if (typeof this.storage.findByTag === 'function') {
      return await this.storage.findByTag(tag);
    }

    // フォールバック: 従来のフィルタリング
    const templates = await this.storage.getAll();
    return templates.filter(t => t.tags && t.tags.includes(tag));
  }

  /**
   * テンプレートを適用 - 変数置換を実行
   * @param {string} templateId - テンプレートID
   * @param {Object} variableValues - 変数名と値のマップ { variableName: value }
   * @returns {Promise<Object>} 適用結果 { prompt, context }
   */
  async applyTemplate(templateId, variableValues = {}) {
    const template = await this.storage.findById(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // 自動変数を追加
    const enrichedValues = this.addAutoVariables(variableValues);

    // テンプレートに変数を適用
    const prompt = this.replaceVariables(template.promptTemplate, enrichedValues);
    const context = template.contextTemplate
      ? this.replaceVariables(template.contextTemplate, enrichedValues)
      : "";

    // 使用統計を更新
    const updatedTemplate = incrementTemplateUsage(template);
    await this.storage.update(templateId, updatedTemplate);

    return {
      prompt,
      context,
      templateName: template.name,
      category: template.category,
      tags: template.tags
    };
  }

  /**
   * 変数置換エンジン
   * @param {string} text - テンプレートテキスト
   * @param {Object} values - 変数値マップ
   * @returns {string} 置換後のテキスト
   */
  replaceVariables(text, values) {
    let result = text;

    // {{variableName}} 形式の変数を置換
    Object.entries(values).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, value || '');
    });

    // 未置換の変数をプレースホルダーとして残す
    // （ユーザーが後で手動入力できるように）
    result = result.replace(/\{\{(\w+)\}\}/g, '[[$1]]');

    return result;
  }

  /**
   * 自動変数を追加
   * @param {Object} values - ユーザー入力の変数値
   * @returns {Object} 自動変数を含む変数値マップ
   */
  addAutoVariables(values) {
    const now = new Date();

    return {
      ...values,
      // 自動変数: 日付・時刻
      date: values.date || formatDate(now),
      time: values.time || formatTime(now),
      datetime: values.datetime || formatDateTime(now),
      // 自動変数: 年月日
      year: values.year || now.getFullYear().toString(),
      month: values.month || (now.getMonth() + 1).toString().padStart(2, '0'),
      day: values.day || now.getDate().toString().padStart(2, '0')
    };
  }


  /**
   * カスタムテンプレートを作成
   * @param {Object} templateData - テンプレートデータ
   * @returns {Promise<Object>} 作成されたテンプレート
   */
  async createCustomTemplate(templateData) {
    const template = createTemplate({
      ...templateData,
      author: 'custom',
      isCustom: true
    });

    // バリデーション
    const validation = validateTemplate(template);
    if (!validation.valid) {
      throw new Error(`Template validation failed: ${validation.errors.join(', ')}`);
    }

    const result = await this.storage.add(template);

    // Full-Text Search インデックスに追加
    if (this.indexReady) {
      this.searchIndex.addDocument(result.id, result, [
        'name', 'description', 'category', 'tags',
        'promptTemplate', 'contextTemplate'
      ]);
    }

    return result;
  }

  /**
   * テンプレートを更新
   * @param {string} templateId - テンプレートID
   * @param {Object} updates - 更新内容
   * @returns {Promise<Object>} 更新されたテンプレート
   */
  async updateTemplate(templateId, updates) {
    const template = await this.storage.findById(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // システムテンプレートは編集不可
    if (template.author === 'system' && !template.isCustom) {
      throw new Error('System templates cannot be modified');
    }

    const updatedTemplate = {
      ...template,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // バリデーション
    const validation = validateTemplate(updatedTemplate);
    if (!validation.valid) {
      throw new Error(`Template validation failed: ${validation.errors.join(', ')}`);
    }

    const result = await this.storage.update(templateId, updatedTemplate);

    // Full-Text Search インデックスを更新
    if (this.indexReady) {
      this.searchIndex.updateDocument(templateId, result, [
        'name', 'description', 'category', 'tags',
        'promptTemplate', 'contextTemplate'
      ]);
    }

    return result;
  }

  /**
   * テンプレートを削除
   * @param {string} templateId - テンプレートID
   * @returns {Promise<boolean>} 削除成功
   */
  async deleteTemplate(templateId) {
    const template = await this.storage.findById(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // システムテンプレートは削除不可
    if (template.author === 'system' && !template.isCustom) {
      throw new Error('System templates cannot be deleted');
    }

    const result = await this.storage.delete(templateId);

    // Full-Text Search インデックスから削除
    if (this.indexReady) {
      this.searchIndex.removeDocument(templateId);
    }

    return result;
  }

  /**
   * テンプレートをレーティング
   * @param {string} templateId - テンプレートID
   * @param {number} rating - 評価 (1-5)
   * @returns {Promise<Object>} 更新されたテンプレート
   */
  async rateTemplate(templateId, rating) {
    const template = await this.storage.findById(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const updatedTemplate = updateTemplateRating(template, rating);
    return await this.storage.update(templateId, updatedTemplate);
  }

  /**
   * 人気テンプレートを取得 (インデックス最適化版)
   * @param {number} limit - 取得数
   * @returns {Promise<Array>} 人気テンプレート配列
   */
  async getPopularTemplates(limit = 5) {
    // IndexedDBManagerの最適化メソッドを使用
    if (typeof this.storage.findByUsageCount === 'function') {
      return await this.storage.findByUsageCount(limit, 'desc');
    }

    // フォールバック: 従来のソート
    const templates = await this.storage.getAll();
    return templates
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .slice(0, limit);
  }

  /**
   * 最近使用したテンプレートを取得
   * @param {number} limit - 取得数
   * @returns {Promise<Array>} 最近使用したテンプレート配列
   */
  async getRecentTemplates(limit = 5) {
    const templates = await this.storage.getAll();
    return templates
      .filter(t => t.usageCount && t.usageCount > 0)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, limit);
  }

  /**
   * テンプレートを検索 (Full-Text Search対応)
   * @param {string} query - 検索クエリ
   * @param {Object} options - 検索オプション
   * @returns {Promise<Array>} マッチしたテンプレート配列
   */
  async searchTemplates(query, options = {}) {
    const {
      mode = 'auto', // 'auto' | 'fulltext' | 'simple'
      limit = 100,
      minScore = 0.1,
      includeScore = false
    } = options;

    if (!query || query.trim() === '') {
      return await this.getAllTemplates();
    }

    // 1. Full-Text Search (転置インデックス) - 最優先
    if ((mode === 'auto' || mode === 'fulltext') && this.indexReady) {
      console.log(`[Full-Text Search] Query: "${query}"`);
      const results = this.searchIndex.search(query, {
        limit,
        minScore,
        includeScore
      });

      if (includeScore) {
        return results;
      }

      return results.map(r => r.document);
    }

    // 2. IndexedDBManagerの最適化メソッド
    if (mode === 'auto' && typeof this.storage.searchText === 'function') {
      console.log(`[IndexedDB Search] Query: "${query}"`);
      return await this.storage.searchText(query, [
        'name',
        'description',
        'tags',
        'category',
        'promptTemplate',
        'contextTemplate'
      ]);
    }

    // 3. フォールバック: 従来のフィルタリング
    console.log(`[Simple Search] Query: "${query}"`);
    const templates = await this.storage.getAll();
    const lowerQuery = query.toLowerCase();

    return templates.filter(t => {
      const nameMatch = t.name.toLowerCase().includes(lowerQuery);
      const descMatch = t.description && t.description.toLowerCase().includes(lowerQuery);
      const tagsMatch = t.tags && t.tags.some(tag => tag.toLowerCase().includes(lowerQuery));
      const categoryMatch = t.category && t.category.toLowerCase().includes(lowerQuery);

      return nameMatch || descMatch || tagsMatch || categoryMatch;
    });
  }

  /**
   * OR検索 (いずれかのキーワードを含む)
   * @param {string} query - 検索クエリ
   * @param {Object} options - 検索オプション
   * @returns {Promise<Array>} マッチしたテンプレート配列
   */
  async searchTemplatesOr(query, options = {}) {
    if (!this.indexReady) {
      return await this.searchTemplates(query, options);
    }

    const results = this.searchIndex.searchOr(query, options);

    if (options.includeScore) {
      return results;
    }

    return results.map(r => r.document);
  }

  /**
   * 前方一致検索
   * @param {string} prefix - プレフィックス
   * @param {number} limit - 取得数
   * @returns {Promise<Array>} マッチしたテンプレート配列
   */
  async searchTemplatesPrefix(prefix, limit = 20) {
    if (!this.indexReady) {
      // フォールバック
      const templates = await this.storage.getAll();
      const lowerPrefix = prefix.toLowerCase();
      return templates.filter(t =>
        t.name.toLowerCase().startsWith(lowerPrefix)
      ).slice(0, limit);
    }

    return this.searchIndex.searchPrefix(prefix, { limit });
  }

  /**
   * テンプレートをエクスポート
   * @param {string} templateId - テンプレートID (nullの場合は全テンプレート)
   * @returns {Promise<string>} JSON文字列
   */
  async exportTemplates(templateId = null) {
    if (templateId) {
      const template = await this.storage.findById(templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }
      return JSON.stringify([template], null, 2);
    } else {
      const templates = await this.storage.getAll();
      return JSON.stringify(templates, null, 2);
    }
  }

  /**
   * テンプレートをインポート
   * @param {string} jsonString - JSON文字列
   * @returns {Promise<Array>} インポートされたテンプレート配列
   */
  async importTemplates(jsonString) {
    try {
      const templatesData = JSON.parse(jsonString);
      if (!Array.isArray(templatesData)) {
        throw new Error('Invalid template data format');
      }

      const imported = [];
      for (const templateData of templatesData) {
        const template = templateFromJSON(templateData);
        const added = await this.storage.add(template);
        imported.push(added);
      }

      return imported;
    } catch (error) {
      console.error('Template import failed:', error);
      throw new Error(`Template import failed: ${error.message}`);
    }
  }
}
