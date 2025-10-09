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

/**
 * テンプレート管理クラス
 */
export class TemplateManager {
  constructor(storageManager) {
    this.storage = storageManager;
    this.isInitialized = false;
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

      this.isInitialized = true;
    } catch (error) {
      console.error('TemplateManager initialization failed:', error);
      throw error;
    }
  }

  /**
   * デフォルトテンプレートをJSONファイルから読み込み
   */
  async loadDefaultTemplates() {
    try {
      const response = await fetch('/data/pm-templates.json');
      if (!response.ok) {
        throw new Error(`Failed to load templates: ${response.statusText}`);
      }

      const templatesData = await response.json();

      for (const templateData of templatesData) {
        const template = createTemplate(templateData);
        await this.storage.add(template);
      }

      console.log(`Loaded ${templatesData.length} default templates`);
    } catch (error) {
      console.error('Failed to load default templates:', error);
      // デフォルトテンプレート読み込み失敗は致命的ではないので続行
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
   * カテゴリでフィルタリング
   * @param {string} category - カテゴリ名
   * @returns {Promise<Array>} フィルタリングされたテンプレート配列
   */
  async getTemplatesByCategory(category) {
    const templates = await this.storage.getAll();
    if (!category || category === 'all') return templates;
    return templates.filter(t => t.category === category);
  }

  /**
   * タグで検索
   * @param {string} tag - タグ名
   * @returns {Promise<Array>} タグを含むテンプレート配列
   */
  async getTemplatesByTag(tag) {
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
      date: values.date || this.formatDate(now),
      time: values.time || this.formatTime(now),
      datetime: values.datetime || this.formatDateTime(now),
      // 自動変数: 年月日
      year: values.year || now.getFullYear().toString(),
      month: values.month || (now.getMonth() + 1).toString().padStart(2, '0'),
      day: values.day || now.getDate().toString().padStart(2, '0')
    };
  }

  /**
   * 日付フォーマット
   * @param {Date} date - 日付オブジェクト
   * @returns {string} フォーマット済み日付 (YYYY-MM-DD)
   */
  formatDate(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 時刻フォーマット
   * @param {Date} date - 日付オブジェクト
   * @returns {string} フォーマット済み時刻 (HH:MM)
   */
  formatTime(date) {
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    return `${hour}:${minute}`;
  }

  /**
   * 日時フォーマット
   * @param {Date} date - 日付オブジェクト
   * @returns {string} フォーマット済み日時 (YYYY-MM-DD HH:MM)
   */
  formatDateTime(date) {
    return `${this.formatDate(date)} ${this.formatTime(date)}`;
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

    return await this.storage.add(template);
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

    return await this.storage.update(templateId, updatedTemplate);
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

    return await this.storage.delete(templateId);
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
   * 人気テンプレートを取得
   * @param {number} limit - 取得数
   * @returns {Promise<Array>} 人気テンプレート配列
   */
  async getPopularTemplates(limit = 5) {
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
   * テンプレートを検索
   * @param {string} query - 検索クエリ
   * @returns {Promise<Array>} マッチしたテンプレート配列
   */
  async searchTemplates(query) {
    if (!query || query.trim() === '') {
      return await this.getAllTemplates();
    }

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
