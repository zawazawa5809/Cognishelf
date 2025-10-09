// Vite Entry Point
import { openDB } from 'idb';
import { marked } from 'marked';
import { CognishelfApp } from './app.js';
import { TemplateManager } from './managers/TemplateManager.js';
import '../styles.css';

// グローバルに公開(既存コードとの互換性のため)
window.idb = { openDB };
window.marked = marked;

// アプリケーション起動
document.addEventListener('DOMContentLoaded', async () => {
  window.app = new CognishelfApp();
  await window.app.init();

  // Phase 2: TemplateManager初期化
  if (window.app.templatesManager) {
    window.templateManager = new TemplateManager(window.app.templatesManager);
    await window.templateManager.init();
    await window.app.renderTemplates();
    console.log('TemplateManager initialized');
  }
});
