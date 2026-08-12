export const AppConfig = (() => {
  'use strict';

  return {
    APP_NAME: 'Stop Auto-Update',
    BRAND: 'A-Class WebCraft · by Supasit.A',
    REPORT_DEPARTMENT_LABEL: 'PE#1',

    DB_NAME: 'stop_auto_update_db',
    DB_VERSION: 1,
    STORES: {
      SECTIONS: 'sections',
      EMPLOYEES: 'employees',
      TASK_ENTRIES: 'taskEntries',
      SETTINGS: 'settings',
      CRYPTO_KEYS: 'cryptoKeys',
    },

    MONTH_NAMES: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
    MONTH_NAMES_FULL: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ],

    // ตรวจรุ่นล่าสุดที่ยังรองรับก่อนใช้จริงทุกครั้ง โมเดลเปลี่ยนเร็ว
    // gemini-2.5-flash ถูก Google ปิดไม่ให้ผู้ใช้ใหม่เรียกแล้ว (ปิดใช้งานเต็ม 16 ต.ค. 2569)
    GEMINI_MODEL: 'gemini-3.6-flash',
    GEMINI_API_BASE: 'https://generativelanguage.googleapis.com/v1beta/models',
    GEMINI_RETRIES: 3,
    GEMINI_BACKOFF_MS: [1000, 2000, 4000],

    SHEETJS_CDN: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    HTML2CANVAS_CDN: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',

    CURRENT_YEAR: new Date().getFullYear(),
    THEME_STORAGE_KEY: 'stop-auto-update-theme',
  };
})();
