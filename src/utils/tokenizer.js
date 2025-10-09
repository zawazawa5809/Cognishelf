/**
 * 日本語対応トークナイザ
 * Full-Text Search用のテキスト正規化・トークン化処理
 */

/**
 * 日本語のストップワード (除外語)
 */
const JAPANESE_STOPWORDS = new Set([
  'の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'れ', 'さ', 'ある',
  'いる', 'も', 'する', 'から', 'な', 'こと', 'として', 'い', 'や', 'れる',
  'など', 'なっ', 'ない', 'この', 'ため', 'その', 'あっ', 'よう', 'また',
  'もの', 'という', 'あり', 'まで', 'られ', 'なる', 'へ', 'か', 'だ', 'これ',
  'によって', 'により', 'おり', 'より', 'による', 'ず', 'なり', 'られる',
  'において', 'ば', 'なかっ', 'なく', 'しかし', 'について', 'せ', 'だっ',
  'その後', 'できる', 'それ', 'う', 'ので', 'なお', 'のみ', 'でき', 'き',
  'つ', 'における', 'および', 'いう', 'さらに', 'でも', 'ら', 'たり', 'その他',
  'に関する', 'たち', 'ます', 'ん', 'なら', 'に対して', '特に', 'せる', '及び',
  'これら', 'とき', 'では', 'にて', 'ほか', 'ながら', 'うち', 'そして', 'とともに',
  'ただし', 'かつて', 'それぞれ', 'または', 'お', 'ほど', 'ものの', 'に対する',
  'ほとんど', 'と共に', 'といった', 'です', 'とも', 'ところ', 'ここ'
]);

/**
 * 英語のストップワード
 */
const ENGLISH_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that',
  'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
]);

/**
 * テキストを正規化
 * @param {string} text - 入力テキスト
 * @returns {string} 正規化されたテキスト
 */
export function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    // 小文字化
    .toLowerCase()
    // 全角英数字を半角に変換
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    // 全角スペースを半角に
    .replace(/　/g, ' ')
    // 連続する空白を単一スペースに
    .replace(/\s+/g, ' ')
    // 前後の空白を削除
    .trim();
}

/**
 * テキストをトークン化 (Bi-gram + 単語分割)
 * @param {string} text - 入力テキスト
 * @param {Object} options - オプション
 * @returns {Array<string>} トークン配列
 */
export function tokenize(text, options = {}) {
  const {
    minLength = 2,
    maxLength = 50,
    useBigram = true,
    removeStopwords = true,
    keepNumbers = true
  } = options;

  const normalized = normalizeText(text);
  if (!normalized) return [];

  const tokens = new Set();

  // 1. 英数字と記号で分割 (単語ベース)
  const words = normalized.split(/[\s\u3000,.、。!?！?()（）\[\]「」『』【】]+/);

  for (const word of words) {
    if (!word) continue;

    // 英単語の処理
    if (/^[a-z0-9]+$/.test(word)) {
      if (word.length >= minLength && word.length <= maxLength) {
        // ストップワード除去
        if (removeStopwords && ENGLISH_STOPWORDS.has(word)) {
          continue;
        }
        // 数字のみの場合
        if (!keepNumbers && /^\d+$/.test(word)) {
          continue;
        }
        tokens.add(word);
      }
    }
    // 日本語の処理
    else if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(word)) {
      // ストップワード除去
      if (removeStopwords && JAPANESE_STOPWORDS.has(word)) {
        continue;
      }

      // 単語全体を追加 (2文字以上)
      if (word.length >= minLength && word.length <= maxLength) {
        tokens.add(word);
      }

      // Bi-gram生成 (日本語文字列)
      if (useBigram && word.length >= 2) {
        for (let i = 0; i < word.length - 1; i++) {
          const bigram = word.substring(i, i + 2);
          // ひらがな・カタカナ・漢字のみのbi-gram
          if (/^[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]{2}$/.test(bigram)) {
            tokens.add(bigram);
          }
        }
      }
    }
  }

  return Array.from(tokens);
}

/**
 * 複数フィールドからトークンを抽出
 * @param {Object} document - ドキュメント
 * @param {Array<string>} fields - 対象フィールド
 * @param {Object} options - トークナイズオプション
 * @returns {Array<string>} トークン配列
 */
export function extractTokens(document, fields = ['title', 'content', 'description'], options = {}) {
  const allTokens = new Set();

  for (const field of fields) {
    const value = document[field];

    if (typeof value === 'string') {
      const tokens = tokenize(value, options);
      tokens.forEach(token => allTokens.add(token));
    } else if (Array.isArray(value)) {
      // タグなどの配列フィールド
      value.forEach(item => {
        if (typeof item === 'string') {
          const tokens = tokenize(item, options);
          tokens.forEach(token => allTokens.add(token));
        }
      });
    }
  }

  return Array.from(allTokens);
}

/**
 * クエリトークンとドキュメントトークンのマッチングスコア計算
 * @param {Array<string>} queryTokens - クエリトークン
 * @param {Array<string>} docTokens - ドキュメントトークン
 * @returns {number} スコア (0.0 - 1.0)
 */
export function calculateMatchScore(queryTokens, docTokens) {
  if (queryTokens.length === 0) return 0;

  const docTokenSet = new Set(docTokens);
  let matchCount = 0;

  for (const token of queryTokens) {
    if (docTokenSet.has(token)) {
      matchCount++;
    }
  }

  // マッチ率
  return matchCount / queryTokens.length;
}

/**
 * 前方一致検索用のプレフィックストークン生成
 * @param {string} text - 入力テキスト
 * @param {number} minPrefixLength - 最小プレフィックス長
 * @returns {Array<string>} プレフィックストークン配列
 */
export function generatePrefixTokens(text, minPrefixLength = 2) {
  const normalized = normalizeText(text);
  if (normalized.length < minPrefixLength) return [];

  const prefixes = [];
  for (let i = minPrefixLength; i <= normalized.length; i++) {
    prefixes.push(normalized.substring(0, i));
  }

  return prefixes;
}

/**
 * ハイライト用のマッチ位置検出
 * @param {string} text - 対象テキスト
 * @param {Array<string>} queryTokens - クエリトークン
 * @returns {Array<Object>} [{ start, end, token }, ...]
 */
export function findMatchPositions(text, queryTokens) {
  const normalized = normalizeText(text);
  const positions = [];

  for (const token of queryTokens) {
    let index = 0;
    while (true) {
      index = normalized.indexOf(token, index);
      if (index === -1) break;

      positions.push({
        start: index,
        end: index + token.length,
        token
      });

      index += token.length;
    }
  }

  // 開始位置でソート
  positions.sort((a, b) => a.start - b.start);

  return positions;
}
