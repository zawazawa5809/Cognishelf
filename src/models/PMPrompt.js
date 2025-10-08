/**
 * PM特化プロンプトデータモデル
 */

/**
 * PMプロンプトのデフォルト設定を生成
 * @returns {Object} デフォルトのpmConfig
 */
export function createDefaultPMConfig() {
  return {
    // プロジェクト情報
    projectId: null,
    projectName: "",
    phase: "未分類", // 企画、要件定義、設計、開発、テスト、リリース

    // ステークホルダー
    stakeholders: [],
    // 例: [{ name: "山田太郎", role: "PO", email: "yamada@example.com" }]

    // 関連ドキュメント
    relatedDocs: [],
    // 例: [{ title: "要件定義書v1.0", url: "https://..." }]

    // 優先度・重要度
    priority: "中", // 高、中、低
    importance: 3,  // 1-5

    // ステータス
    status: "下書き", // 下書き、進行中、完了、保留
    dueDate: null,

    // 使用統計
    stats: {
      usageCount: 0,
      lastUsed: null,
      effectiveness: 0  // 有効性評価 1-5
    }
  };
}

/**
 * PMプロンプトオブジェクトを生成
 * @param {Object} data - プロンプトデータ
 * @returns {Object} PMプロンプト
 */
export function createPMPrompt(data = {}) {
  const now = new Date().toISOString();

  return {
    id: data.id || `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
    title: data.title || "",
    content: data.content || "",
    tags: data.tags || [],
    folder: data.folder || "",
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
    pmConfig: data.pmConfig || createDefaultPMConfig()
  };
}

/**
 * プロンプトの使用統計を更新
 * @param {Object} prompt - プロンプト
 * @returns {Object} 更新されたプロンプト
 */
export function incrementUsageStats(prompt) {
  if (!prompt.pmConfig) {
    prompt.pmConfig = createDefaultPMConfig();
  }

  prompt.pmConfig.stats.usageCount++;
  prompt.pmConfig.stats.lastUsed = new Date().toISOString();
  prompt.updatedAt = new Date().toISOString();

  return prompt;
}

/**
 * ステークホルダーを追加
 * @param {Object} prompt - プロンプト
 * @param {string} name - 名前
 * @param {string} role - 役割
 * @param {string} email - メールアドレス
 * @returns {Object} 更新されたプロンプト
 */
export function addStakeholder(prompt, name, role, email = "") {
  if (!prompt.pmConfig) {
    prompt.pmConfig = createDefaultPMConfig();
  }

  prompt.pmConfig.stakeholders.push({ name, role, email });
  prompt.updatedAt = new Date().toISOString();

  return prompt;
}

/**
 * 関連ドキュメントを追加
 * @param {Object} prompt - プロンプト
 * @param {string} title - ドキュメントタイトル
 * @param {string} url - ドキュメントURL
 * @returns {Object} 更新されたプロンプト
 */
export function addRelatedDoc(prompt, title, url) {
  if (!prompt.pmConfig) {
    prompt.pmConfig = createDefaultPMConfig();
  }

  prompt.pmConfig.relatedDocs.push({ title, url });
  prompt.updatedAt = new Date().toISOString();

  return prompt;
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
  config.phase = formData.get('pm-phase') || "未分類";

  // 優先度・ステータス
  config.priority = formData.get('pm-priority') || "中";
  config.importance = parseInt(formData.get('pm-importance') || "3", 10);
  config.status = formData.get('pm-status') || "下書き";
  config.dueDate = formData.get('pm-due-date') || null;

  // ステークホルダー (カンマ区切りテキストから配列へ)
  const stakeholdersText = formData.get('pm-stakeholders') || "";
  if (stakeholdersText.trim()) {
    config.stakeholders = stakeholdersText.split(',').map(s => {
      const match = s.trim().match(/^(.+?)\((.+?)\)$/);
      if (match) {
        return { name: match[1].trim(), role: match[2].trim(), email: "" };
      }
      return { name: s.trim(), role: "", email: "" };
    });
  }

  return config;
}
