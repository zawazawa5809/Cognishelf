/**
 * テンプレートデータモデル
 * Phase 2: テンプレートライブラリ
 */

/**
 * テンプレートカテゴリ定義
 */
export const TEMPLATE_CATEGORIES = {
  MEETING: '会議・コミュニケーション',
  DOCUMENT: 'ドキュメント作成',
  PM: 'プロジェクト管理',
  RISK: 'リスク管理'
};

/**
 * 変数型定義
 */
export const VARIABLE_TYPES = {
  TEXT: 'text',
  TEXTAREA: 'textarea',
  DATE: 'date',
  DATETIME: 'datetime',
  SELECT: 'select'
};

/**
 * テンプレートのデフォルト構造を生成
 * @returns {Object} デフォルトのテンプレート構造
 */
export function createDefaultTemplate() {
  return {
    id: null,
    name: "",
    category: TEMPLATE_CATEGORIES.MEETING,
    tags: [],
    description: "",

    // プロンプトテンプレート
    promptTemplate: "",

    // コンテキストテンプレート(オプション)
    contextTemplate: "",

    // 変数定義
    variables: [],
    // 例: [{ name: "projectName", label: "プロジェクト名", type: "text", defaultValue: "", required: true }]

    // 統計情報
    usageCount: 0,
    rating: 0,

    // メタデータ
    author: "system", // system | custom
    isCustom: false,
    createdAt: null,
    updatedAt: null
  };
}

/**
 * 変数メタデータを生成
 * @param {string} name - 変数名 (例: "projectName")
 * @param {string} label - ラベル (例: "プロジェクト名")
 * @param {string} type - 変数型 (VARIABLE_TYPES)
 * @param {Object} options - オプション
 * @returns {Object} 変数メタデータ
 */
export function createVariable(name, label, type = VARIABLE_TYPES.TEXT, options = {}) {
  return {
    name,
    label,
    type,
    defaultValue: options.defaultValue || "",
    required: options.required !== undefined ? options.required : true,
    placeholder: options.placeholder || "",
    options: options.selectOptions || [] // select型の場合の選択肢
  };
}

/**
 * テンプレートオブジェクトを生成
 * @param {Object} data - テンプレートデータ
 * @returns {Object} テンプレート
 */
export function createTemplate(data = {}) {
  const now = new Date().toISOString();
  const template = createDefaultTemplate();

  return {
    ...template,
    ...data,
    id: data.id || `template-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  };
}

/**
 * テンプレートの使用統計を更新
 * @param {Object} template - テンプレート
 * @returns {Object} 更新されたテンプレート
 */
export function incrementTemplateUsage(template) {
  template.usageCount = (template.usageCount || 0) + 1;
  template.updatedAt = new Date().toISOString();
  return template;
}

/**
 * テンプレートのレーティングを更新
 * @param {Object} template - テンプレート
 * @param {number} rating - 評価 (1-5)
 * @returns {Object} 更新されたテンプレート
 */
export function updateTemplateRating(template, rating) {
  if (rating < 1 || rating > 5) {
    throw new Error('Rating must be between 1 and 5');
  }

  // 簡易的な平均計算 (より正確にはratingCountも保持すべき)
  const currentRating = template.rating || 0;
  const usageCount = template.usageCount || 1;

  template.rating = ((currentRating * (usageCount - 1)) + rating) / usageCount;
  template.updatedAt = new Date().toISOString();

  return template;
}

/**
 * テンプレートから変数を抽出
 * @param {string} templateText - テンプレートテキスト
 * @returns {Array<string>} 変数名の配列
 */
export function extractVariables(templateText) {
  const regex = /\{\{(\w+)\}\}/g;
  const variables = new Set();
  let match;

  while ((match = regex.exec(templateText)) !== null) {
    variables.add(match[1]);
  }

  return Array.from(variables);
}

/**
 * テンプレートをバリデーション
 * @param {Object} template - テンプレート
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
export function validateTemplate(template) {
  const errors = [];

  if (!template.name || template.name.trim() === "") {
    errors.push("テンプレート名は必須です");
  }

  if (!template.category) {
    errors.push("カテゴリは必須です");
  }

  if (!template.promptTemplate || template.promptTemplate.trim() === "") {
    errors.push("プロンプトテンプレートは必須です");
  }

  // 変数定義とテンプレート内の変数の整合性チェック
  const extractedVars = extractVariables(template.promptTemplate);
  const definedVars = new Set(template.variables.map(v => v.name));

  const undefinedVars = extractedVars.filter(v => !definedVars.has(v));
  if (undefinedVars.length > 0) {
    errors.push(`未定義の変数が使用されています: ${undefinedVars.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * JSONからテンプレートをインポート
 * @param {Object} json - JSONオブジェクト
 * @returns {Object} テンプレート
 */
export function templateFromJSON(json) {
  return createTemplate({
    ...json,
    // セキュリティ: IDは再生成
    id: `template-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
    isCustom: true,
    author: "custom",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

/**
 * テンプレートをJSONエクスポート用に変換
 * @param {Object} template - テンプレート
 * @returns {Object} エクスポート用JSON
 */
export function templateToJSON(template) {
  const { id, usageCount, rating, createdAt, updatedAt, ...exportData } = template;
  return exportData;
}
