/**
 * 転置インデックス (Inverted Index)
 * Full-Text Search用の高速検索データ構造
 */

import { extractTokens, tokenize, calculateMatchScore } from './tokenizer.js';

/**
 * 転置インデックスクラス
 */
export class InvertedIndex {
  constructor() {
    // トークン → ドキュメントIDセット
    this.index = new Map();

    // ドキュメントID → ドキュメント
    this.documents = new Map();

    // ドキュメントID → トークンセット
    this.documentTokens = new Map();

    // 統計情報
    this.stats = {
      totalDocuments: 0,
      totalTokens: 0,
      averageTokensPerDocument: 0
    };
  }

  /**
   * ドキュメントを追加
   * @param {string} docId - ドキュメントID
   * @param {Object} document - ドキュメント
   * @param {Array<string>} fields - インデックス対象フィールド
   */
  addDocument(docId, document, fields = ['title', 'content', 'description', 'tags']) {
    // 既存ドキュメントを削除
    if (this.documents.has(docId)) {
      this.removeDocument(docId);
    }

    // トークン抽出
    const tokens = extractTokens(document, fields);

    // ドキュメント保存
    this.documents.set(docId, document);
    this.documentTokens.set(docId, new Set(tokens));

    // 転置インデックス構築
    for (const token of tokens) {
      if (!this.index.has(token)) {
        this.index.set(token, new Set());
      }
      this.index.get(token).add(docId);
    }

    // 統計更新
    this.updateStats();
  }

  /**
   * ドキュメントを削除
   * @param {string} docId - ドキュメントID
   */
  removeDocument(docId) {
    const tokens = this.documentTokens.get(docId);
    if (!tokens) return;

    // 転置インデックスから削除
    for (const token of tokens) {
      const docSet = this.index.get(token);
      if (docSet) {
        docSet.delete(docId);
        if (docSet.size === 0) {
          this.index.delete(token);
        }
      }
    }

    // ドキュメント削除
    this.documents.delete(docId);
    this.documentTokens.delete(docId);

    // 統計更新
    this.updateStats();
  }

  /**
   * ドキュメントを更新
   * @param {string} docId - ドキュメントID
   * @param {Object} document - 更新後のドキュメント
   * @param {Array<string>} fields - インデックス対象フィールド
   */
  updateDocument(docId, document, fields = ['title', 'content', 'description', 'tags']) {
    this.addDocument(docId, document, fields);
  }

  /**
   * 複数ドキュメントを一括追加
   * @param {Array<Object>} documents - ドキュメント配列 ({ id, ...data })
   * @param {Array<string>} fields - インデックス対象フィールド
   */
  bulkAdd(documents, fields = ['title', 'content', 'description', 'tags']) {
    for (const doc of documents) {
      if (!doc.id) {
        console.warn('Document missing id, skipping:', doc);
        continue;
      }
      this.addDocument(doc.id, doc, fields);
    }
  }

  /**
   * インデックスをクリア
   */
  clear() {
    this.index.clear();
    this.documents.clear();
    this.documentTokens.clear();
    this.updateStats();
  }

  /**
   * クエリで検索 (AND検索)
   * @param {string} query - 検索クエリ
   * @param {Object} options - 検索オプション
   * @returns {Array<Object>} マッチしたドキュメント配列 (スコア順)
   */
  search(query, options = {}) {
    const {
      limit = 100,
      minScore = 0.1,
      sortBy = 'score', // 'score' | 'relevance'
      includeScore = true
    } = options;

    // クエリトークン化
    const queryTokens = tokenize(query);

    if (queryTokens.length === 0) {
      return [];
    }

    // トークンごとにドキュメントIDを取得 (AND検索)
    const docIdSets = queryTokens.map(token => this.index.get(token) || new Set());

    // 積集合を計算 (全トークンを含むドキュメント)
    let matchingDocIds = docIdSets[0];
    for (let i = 1; i < docIdSets.length; i++) {
      matchingDocIds = new Set([...matchingDocIds].filter(id => docIdSets[i].has(id)));
    }

    // スコア計算
    const results = [];
    for (const docId of matchingDocIds) {
      const document = this.documents.get(docId);
      if (!document) continue;

      const docTokens = Array.from(this.documentTokens.get(docId) || []);
      const score = calculateMatchScore(queryTokens, docTokens);

      if (score >= minScore) {
        results.push({
          document,
          score,
          matchedTokens: queryTokens.filter(token => docTokens.includes(token))
        });
      }
    }

    // ソート
    if (sortBy === 'score') {
      results.sort((a, b) => b.score - a.score);
    }

    // 制限
    const limitedResults = results.slice(0, limit);

    // スコア除外オプション
    if (!includeScore) {
      return limitedResults.map(r => r.document);
    }

    return limitedResults;
  }

  /**
   * OR検索 (いずれかのトークンを含む)
   * @param {string} query - 検索クエリ
   * @param {Object} options - 検索オプション
   * @returns {Array<Object>} マッチしたドキュメント配列
   */
  searchOr(query, options = {}) {
    const {
      limit = 100,
      minScore = 0.1,
      includeScore = true
    } = options;

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    // トークンごとにドキュメントIDを取得
    const allDocIds = new Set();
    for (const token of queryTokens) {
      const docIds = this.index.get(token);
      if (docIds) {
        docIds.forEach(id => allDocIds.add(id));
      }
    }

    // スコア計算
    const results = [];
    for (const docId of allDocIds) {
      const document = this.documents.get(docId);
      if (!document) continue;

      const docTokens = Array.from(this.documentTokens.get(docId) || []);
      const score = calculateMatchScore(queryTokens, docTokens);

      if (score >= minScore) {
        results.push({
          document,
          score,
          matchedTokens: queryTokens.filter(token => docTokens.includes(token))
        });
      }
    }

    // スコア順ソート
    results.sort((a, b) => b.score - a.score);

    const limitedResults = results.slice(0, limit);

    if (!includeScore) {
      return limitedResults.map(r => r.document);
    }

    return limitedResults;
  }

  /**
   * 前方一致検索 (プレフィックス検索)
   * @param {string} prefix - プレフィックス
   * @param {Object} options - 検索オプション
   * @returns {Array<Object>} マッチしたドキュメント配列
   */
  searchPrefix(prefix, options = {}) {
    const { limit = 100 } = options;

    const normalizedPrefix = prefix.toLowerCase().trim();
    if (!normalizedPrefix) return [];

    const matchingDocIds = new Set();

    // 前方一致するトークンを検索
    for (const [token, docIds] of this.index.entries()) {
      if (token.startsWith(normalizedPrefix)) {
        docIds.forEach(id => matchingDocIds.add(id));
      }
    }

    const results = Array.from(matchingDocIds)
      .map(docId => this.documents.get(docId))
      .filter(doc => doc !== undefined)
      .slice(0, limit);

    return results;
  }

  /**
   * 統計情報を更新
   */
  updateStats() {
    this.stats.totalDocuments = this.documents.size;
    this.stats.totalTokens = this.index.size;

    if (this.stats.totalDocuments > 0) {
      const totalDocTokens = Array.from(this.documentTokens.values())
        .reduce((sum, tokenSet) => sum + tokenSet.size, 0);
      this.stats.averageTokensPerDocument = totalDocTokens / this.stats.totalDocuments;
    } else {
      this.stats.averageTokensPerDocument = 0;
    }
  }

  /**
   * 統計情報を取得
   * @returns {Object} 統計情報
   */
  getStats() {
    return {
      ...this.stats,
      indexSizeBytes: this.estimateIndexSize()
    };
  }

  /**
   * インデックスサイズを推定
   * @returns {number} 推定バイト数
   */
  estimateIndexSize() {
    let size = 0;

    // トークン → ドキュメントIDマップのサイズ
    for (const [token, docIds] of this.index.entries()) {
      size += token.length * 2; // 文字列は2バイト/文字と仮定
      size += docIds.size * 50; // ドキュメントID (UUIDなど)
    }

    // ドキュメントトークンマップのサイズ
    for (const [docId, tokenSet] of this.documentTokens.entries()) {
      size += docId.length * 2;
      size += tokenSet.size * 20; // トークン参照
    }

    return size;
  }

  /**
   * インデックスをJSON形式でエクスポート
   * @returns {Object} エクスポートデータ
   */
  export() {
    return {
      index: Array.from(this.index.entries()).map(([token, docIds]) => ({
        token,
        docIds: Array.from(docIds)
      })),
      documents: Array.from(this.documents.entries()).map(([id, doc]) => ({
        id,
        document: doc
      })),
      documentTokens: Array.from(this.documentTokens.entries()).map(([id, tokens]) => ({
        id,
        tokens: Array.from(tokens)
      })),
      stats: this.stats
    };
  }

  /**
   * JSONデータからインデックスをインポート
   * @param {Object} data - インポートデータ
   */
  import(data) {
    this.clear();

    // インデックス復元
    for (const { token, docIds } of data.index) {
      this.index.set(token, new Set(docIds));
    }

    // ドキュメント復元
    for (const { id, document } of data.documents) {
      this.documents.set(id, document);
    }

    // ドキュメントトークン復元
    for (const { id, tokens } of data.documentTokens) {
      this.documentTokens.set(id, new Set(tokens));
    }

    // 統計更新
    this.updateStats();
  }
}
