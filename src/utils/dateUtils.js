/**
 * 日付ユーティリティ関数
 * 共通の日付フォーマット処理を提供
 */

/**
 * 日付を YYYY-MM-DD 形式にフォーマット
 * @param {Date} date - 日付オブジェクト
 * @returns {string} フォーマット済み日付 (YYYY-MM-DD)
 */
export function formatDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new TypeError('Invalid Date object');
  }

  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 時刻を HH:MM 形式にフォーマット
 * @param {Date} date - 日付オブジェクト
 * @returns {string} フォーマット済み時刻 (HH:MM)
 */
export function formatTime(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new TypeError('Invalid Date object');
  }

  const hour = date.getHours().toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');
  return `${hour}:${minute}`;
}

/**
 * 日時を YYYY-MM-DD HH:MM 形式にフォーマット
 * @param {Date} date - 日付オブジェクト
 * @returns {string} フォーマット済み日時 (YYYY-MM-DD HH:MM)
 */
export function formatDateTime(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new TypeError('Invalid Date object');
  }

  return `${formatDate(date)} ${formatTime(date)}`;
}

/**
 * ISO 8601文字列をパース
 * @param {string} isoString - ISO 8601形式の日時文字列
 * @returns {Date|null} Dateオブジェクト、失敗時はnull
 */
export function parseISOString(isoString) {
  try {
    const date = new Date(isoString);
    return isNaN(date.getTime()) ? null : date;
  } catch (error) {
    return null;
  }
}

/**
 * 現在の日時を ISO 8601形式で取得
 * @returns {string} ISO 8601形式の日時文字列
 */
export function getCurrentISOString() {
  return new Date().toISOString();
}
