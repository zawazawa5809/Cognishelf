// Vite Entry Point
import { openDB } from 'idb';
import { marked } from 'marked';
import { CognishelfApp } from './app.js';
import { PromptMixerUI } from './modules/promptMixer/PromptMixerUI.js';
import '../styles.css';

// グローバルに公開(既存コードとの互換性のため)
window.idb = { openDB };
window.marked = marked;

// アプリケーション起動
document.addEventListener('DOMContentLoaded', async () => {
  window.app = new CognishelfApp();
  await window.app.init();

  // PromptMixerUI初期化
  window.promptMixerUI = new PromptMixerUI();
});
