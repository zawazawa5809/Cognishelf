/**
 * プロジェクトデータモデル
 */

/**
 * プロジェクトオブジェクトを生成
 * @param {Object} data - プロジェクトデータ
 * @returns {Object} プロジェクト
 */
export function createProject(data = {}) {
  const now = new Date().toISOString();

  return {
    id: data.id || `project-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
    name: data.name || "",
    description: data.description || "",

    // プロジェクト期間
    startDate: data.startDate || now,
    endDate: data.endDate || null,

    // 現在のフェーズ
    currentPhase: data.currentPhase || "企画",

    // チームメンバー
    team: data.team || [],
    // 例: [{ name: "山田太郎", role: "PM", email: "yamada@example.com" }]

    // プロジェクト設定
    settings: data.settings || {
      defaultPriority: "中",
      phases: ["企画", "要件定義", "設計", "開発", "テスト", "リリース"]
    },

    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  };
}

/**
 * チームメンバーを追加
 * @param {Object} project - プロジェクト
 * @param {string} name - 名前
 * @param {string} role - 役割
 * @param {string} email - メールアドレス
 * @returns {Object} 更新されたプロジェクト
 */
export function addTeamMember(project, name, role, email = "") {
  project.team.push({ name, role, email });
  project.updatedAt = new Date().toISOString();
  return project;
}

/**
 * フェーズを進める
 * @param {Object} project - プロジェクト
 * @returns {Object} 更新されたプロジェクト
 */
export function advancePhase(project) {
  const phases = project.settings.phases;
  const currentIndex = phases.indexOf(project.currentPhase);

  if (currentIndex >= 0 && currentIndex < phases.length - 1) {
    project.currentPhase = phases[currentIndex + 1];
    project.updatedAt = new Date().toISOString();
  }

  return project;
}

/**
 * プロジェクトをフォームデータから生成
 * @param {FormData} formData - フォームデータ
 * @returns {Object} プロジェクト
 */
export function projectFromFormData(formData) {
  const project = createProject();

  project.name = formData.get('project-name') || "";
  project.description = formData.get('project-description') || "";
  project.startDate = formData.get('project-start-date') || new Date().toISOString();
  project.endDate = formData.get('project-end-date') || null;
  project.currentPhase = formData.get('project-phase') || "企画";

  // チームメンバー (カンマ区切りテキストから配列へ)
  const teamText = formData.get('project-team') || "";
  if (teamText.trim()) {
    project.team = teamText.split(',').map(s => {
      const match = s.trim().match(/^(.+?)\((.+?)\)$/);
      if (match) {
        return { name: match[1].trim(), role: match[2].trim(), email: "" };
      }
      return { name: s.trim(), role: "", email: "" };
    });
  }

  return project;
}

/**
 * デフォルトプロジェクトを生成
 * @returns {Object} デフォルトプロジェクト
 */
export function createDefaultProject() {
  return createProject({
    name: "デフォルトプロジェクト",
    description: "プロジェクト未分類のアイテム用",
    currentPhase: "企画",
    team: []
  });
}
