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

    // Categorical palette จาก dataviz skill (เรียงลำดับตายตัว ผ่านการ validate เรื่อง
    // colorblind-safety แล้ว — ห้ามสลับลำดับ) ใช้ badge สีตามแผนกในรูปสรุปอีเมล
    // bg = tint อ่อนสำหรับพื้นหลัง badge, text = เฉดเข้มของสีเดียวกันสำหรับตัวหนังสือ (อ่านง่าย)
    SECTION_COLOR_PALETTE: [
      { bg: '#E5EFFA', text: '#1B4E8B' }, // blue
      { bg: '#FDECE6', text: '#994422' }, // orange
      { bg: '#E3F5EF', text: '#12724F' }, // aqua
      { bg: '#FDF4E0', text: '#9A6900' }, // yellow
      { bg: '#FCEFF4', text: '#97506B' }, // magenta
      { bg: '#E0F0E0', text: '#005500' }, // green
      { bg: '#E9E7F4', text: '#30266D' }, // violet
      { bg: '#FCE9E9', text: '#942F2F' }, // red
    ],
    // เฉดเดียวกัน ผสมกับพื้นมืด (#1a1a19) แทนขาว — ใช้คู่กับ SECTION_COLOR_PALETTE
    // ลำดับ index เดียวกันเสมอ (เลือกชุดไหนตาม dark mode ตอน render เท่านั้น)
    SECTION_COLOR_PALETTE_DARK: [
      { bg: '#1D2D3F', text: '#7FAEE6' }, // blue
      { bg: '#44291E', text: '#F3A485' }, // orange
      { bg: '#1A382C', text: '#76CFAF' }, // aqua
      { bg: '#443514', text: '#F4C766' }, // yellow
      { bg: '#432D35', text: '#F1B0C8' }, // magenta
      { bg: '#152F14', text: '#66B566' }, // green
      { bg: '#242035', text: '#9289CA' }, // violet
      { bg: '#422322', text: '#EE9291' }, // red
    ],

    CURRENT_YEAR: new Date().getFullYear(),
    THEME_STORAGE_KEY: 'stop-auto-update-theme',
  };
})();
