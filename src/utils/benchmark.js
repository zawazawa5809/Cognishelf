/**
 * パフォーマンスベンチマークユーティリティ
 */

/**
 * 関数の実行時間を計測
 * @param {Function} fn - 計測する関数
 * @param {string} label - ラベル
 * @returns {Promise<Object>} { result, duration, label }
 */
export async function measurePerformance(fn, label = 'Operation') {
  const startTime = performance.now();
  const result = await fn();
  const endTime = performance.now();
  const duration = endTime - startTime;

  console.log(`[Benchmark] ${label}: ${duration.toFixed(2)}ms`);

  return { result, duration, label };
}

/**
 * 複数の関数を比較ベンチマーク
 * @param {Array<Object>} tests - [{ fn, label }, ...]
 * @returns {Promise<Array>} ベンチマーク結果配列
 */
export async function compareBenchmark(tests) {
  console.log('=== Benchmark Comparison ===');

  const results = [];

  for (const test of tests) {
    const { fn, label } = test;
    const { duration, result } = await measurePerformance(fn, label);
    results.push({ label, duration, resultCount: Array.isArray(result) ? result.length : 1 });
  }

  // 結果を表示
  console.table(results);

  // 最速を表示
  const fastest = results.reduce((min, r) => r.duration < min.duration ? r : min);
  console.log(`✅ Fastest: ${fastest.label} (${fastest.duration.toFixed(2)}ms)`);

  return results;
}

/**
 * IndexedDB検索のベンチマーク
 * @param {Object} storage - ストレージマネージャー
 * @param {Object} options - テストオプション
 */
export async function benchmarkIndexedDBSearch(storage, options = {}) {
  const {
    category = '会議・コミュニケーション',
    tag = 'weekly',
    limit = 10
  } = options;

  console.log('=== IndexedDB Search Benchmark ===');

  // 1. カテゴリ検索: インデックス vs フルスキャン
  if (typeof storage.findByCategory === 'function') {
    await compareBenchmark([
      {
        label: 'Category (Index)',
        fn: async () => await storage.findByCategory(category)
      },
      {
        label: 'Category (Full Scan)',
        fn: async () => {
          const all = await storage.getAll();
          return all.filter(item => item.category === category);
        }
      }
    ]);
  }

  // 2. タグ検索: インデックス vs フルスキャン
  if (typeof storage.findByTag === 'function') {
    await compareBenchmark([
      {
        label: 'Tag (Index)',
        fn: async () => await storage.findByTag(tag)
      },
      {
        label: 'Tag (Full Scan)',
        fn: async () => {
          const all = await storage.getAll();
          return all.filter(item => item.tags && item.tags.includes(tag));
        }
      }
    ]);
  }

  // 3. 人気テンプレート: インデックスカーソル vs メモリソート
  if (typeof storage.findByUsageCount === 'function') {
    await compareBenchmark([
      {
        label: 'Popular (Index Cursor)',
        fn: async () => await storage.findByUsageCount(limit, 'desc')
      },
      {
        label: 'Popular (Memory Sort)',
        fn: async () => {
          const all = await storage.getAll();
          return all.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0)).slice(0, limit);
        }
      }
    ]);
  }

  // 4. 複数条件検索
  if (typeof storage.findByMultipleConditions === 'function') {
    await compareBenchmark([
      {
        label: 'Multi-Condition (Optimized)',
        fn: async () => await storage.findByMultipleConditions({ category, tags: [tag] })
      },
      {
        label: 'Multi-Condition (Full Scan)',
        fn: async () => {
          const all = await storage.getAll();
          return all.filter(item =>
            item.category === category &&
            item.tags && item.tags.includes(tag)
          );
        }
      }
    ]);
  }

  console.log('=== Benchmark Completed ===');
}

/**
 * テストデータを生成してベンチマーク
 * @param {Object} storage - ストレージマネージャー
 * @param {number} count - 生成するデータ数
 */
export async function benchmarkWithTestData(storage, count = 1000) {
  console.log(`Generating ${count} test records...`);

  const categories = ['会議・コミュニケーション', 'ドキュメント作成', 'プロジェクト管理', 'リスク管理'];
  const tags = ['daily', 'weekly', 'monthly', 'important', 'urgent'];

  // テストデータ生成
  for (let i = 0; i < count; i++) {
    await storage.add({
      name: `Test Template ${i}`,
      category: categories[i % categories.length],
      tags: [tags[i % tags.length], tags[(i + 1) % tags.length]],
      description: `Test description for template ${i}`,
      promptTemplate: `Test prompt template ${i}`,
      usageCount: Math.floor(Math.random() * 100),
      author: 'test',
      variables: []
    });
  }

  console.log(`✅ Generated ${count} test records`);

  // ベンチマーク実行
  await benchmarkIndexedDBSearch(storage, {
    category: categories[0],
    tag: tags[0],
    limit: 10
  });
}

/**
 * Full-Text Search のベンチマーク
 * @param {Object} templateManager - TemplateManagerインスタンス
 * @param {string} query - 検索クエリ
 */
export async function benchmarkFullTextSearch(templateManager, query = '会議') {
  console.log('=== Full-Text Search Benchmark ===');
  console.log(`Query: "${query}"`);

  const tests = [
    {
      label: 'Full-Text Search (Inverted Index)',
      fn: async () => await templateManager.searchTemplates(query, { mode: 'fulltext' })
    },
    {
      label: 'Simple Search (Linear Scan)',
      fn: async () => await templateManager.searchTemplates(query, { mode: 'simple' })
    }
  ];

  // インデックスが利用可能な場合のみ比較
  if (templateManager.indexReady) {
    const results = await compareBenchmark(tests);

    // 改善率を表示
    if (results.length === 2) {
      const speedup = results[1].duration / results[0].duration;
      console.log(`📊 Speedup: ${speedup.toFixed(2)}x faster with Full-Text Search`);
    }
  } else {
    console.warn('⚠️ Full-Text Search index not ready, skipping benchmark');
  }

  console.log('=== Benchmark Completed ===');
}

/**
 * トークナイザのベンチマーク
 * @param {string} text - テキスト
 */
export async function benchmarkTokenizer(text) {
  console.log('=== Tokenizer Benchmark ===');

  const { tokenize } = await import('./tokenizer.js');

  const result = await measurePerformance(
    () => tokenize(text),
    'Tokenize'
  );

  console.log(`Tokens generated: ${result.result.length}`);
  console.log(`Tokens: ${result.result.slice(0, 10).join(', ')}...`);

  console.log('=== Benchmark Completed ===');
}
