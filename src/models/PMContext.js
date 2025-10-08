/**
 * PM特化コンテキストデータモデル
 */

/**
 * PMコンテキストのデフォルト設定を生成
 * @returns {Object} デフォルトのpmConfig
 */
export function createDefaultPMConfig() {
  return {
    projectId: null,
    projectName: "",
    contextType: "背景情報", // 背景情報、技術仕様、制約条件、リスク
    visibility: "個人", // 個人、チーム全体、ステークホルダー

    // バージョン管理
    version: "1.0",
    previousVersionId: null,

    // 関連プロンプト
    relatedPrompts: []
  };
}

/**
 * PMコンテキストオブジェクトを生成
 * @param {Object} data - コンテキストデータ
 * @returns {Object} PMコンテキスト
 */
export function createPMContext(data = {}) {
  const now = new Date().toISOString();

  return {
    id: data.id || `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
    title: data.title || "",
    content: data.content || "",
    category: data.category || "",
    tags: data.tags || [],
    folder: data.folder || "",
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
    pmConfig: data.pmConfig || createDefaultPMConfig()
  };
}

/**
 * 関連プロンプトを追加
 * @param {Object} context - コンテキスト
 * @param {string} promptId - プロンプトID
 * @returns {Object} 更新されたコンテキスト
 */
export function addRelatedPrompt(context, promptId) {
  if (!context.pmConfig) {
    context.pmConfig = createDefaultPMConfig();
  }

  if (!context.pmConfig.relatedPrompts.includes(promptId)) {
    context.pmConfig.relatedPrompts.push(promptId);
    context.updatedAt = new Date().toISOString();
  }

  return context;
}

/**
 * 新しいバージョンを作成
 * @param {Object} context - 元のコンテキスト
 * @param {string} newContent - 新しいコンテンツ
 * @returns {Object} 新バージョンのコンテキスト
 */
export function createNewVersion(context, newContent) {
  const newVersion = createPMContext({
    ...context,
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
    content: newContent,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // バージョン情報を更新
  const currentVersion = parseFloat(context.pmConfig?.version || "1.0");
  newVersion.pmConfig.version = (currentVersion + 0.1).toFixed(1);
  newVersion.pmConfig.previousVersionId = context.id;

  return newVersion;
}

/**
 * PM設定をフォームデータから生成
 * @param {FormData} formData - フォームデータ
 * @returns {Object} pmConfig
 */
export function pmConfigFromFormData(formData) {
  const config = createDefaultPMConfig();

  // プロジェクト情報
  config.projectId = formData.get('pm-project-id') || null;
  config.projectName = formData.get('pm-project-name') || "";
  config.contextType = formData.get('pm-context-type') || "背景情報";
  config.visibility = formData.get('pm-visibility') || "個人";

  // バージョン情報
  config.version = formData.get('pm-version') || "1.0";
  config.previousVersionId = formData.get('pm-previous-version-id') || null;

  return config;
}
