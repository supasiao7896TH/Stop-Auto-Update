import { AppConfig } from './app-config.js';
import { DebugModule } from './debug.js';
import { uid } from './utils.js';

export const StorageEngine = (() => {
  'use strict';

  const { STORES } = AppConfig;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(AppConfig.DB_NAME, AppConfig.DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORES.SECTIONS)) {
          db.createObjectStore(STORES.SECTIONS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.EMPLOYEES)) {
          db.createObjectStore(STORES.EMPLOYEES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.TASK_ENTRIES)) {
          const store = db.createObjectStore(STORES.TASK_ENTRIES, { keyPath: 'id', autoIncrement: true });
          store.createIndex('by_emp_year_month', ['employeeId', 'year', 'month'], { unique: true });
        }
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
          db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORES.CRYPTO_KEYS)) {
          db.createObjectStore(STORES.CRYPTO_KEYS, { keyPath: 'name' });
        }
      };

      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
    return dbPromise;
  }

  async function getAll(storeName) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // เขียน key ที่ autoIncrement สร้างให้กลับเข้า `value` เดิม (mutate in place) แทนที่จะคืน
  // object ใหม่แยกออกไป — จำเป็นเพราะ `value` มักเป็น object ตัวเดียวกับที่ถูกเก็บอยู่ใน
  // StateStore อยู่แล้ว (เช่น taskEntries draft ใน app-core.js) ถ้าไม่ patch id กลับเข้า
  // ตัวเดิม ครั้งถัดไปที่แก้ entry เดียวกันจะหา id ไม่เจอ แล้ว put() ซ้ำแบบไม่มี id จะสร้าง
  // แถวใหม่ซ้อนแทนที่จะ update จนชน unique index (เจอบั๊กนี้มาแล้วรอบหนึ่งใน bulkPut)
  async function put(storeName, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).put(value);
      req.onsuccess = () => {
        if (value.id === undefined) value.id = req.result;
        resolve(value);
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  // เขียน key ที่ autoIncrement สร้างให้กลับเข้าไปในแต่ละ object (เหมือน put() เดี่ยว)
  // จำเป็นสำหรับ store ที่ไม่ได้ส่ง id มา (เช่น taskEntries ตอน seed import) — ถ้าไม่ทำ
  // ตัว object ใน StateStore จะไม่มี id ค้างอยู่ และการแก้ไขซ้ำครั้งต่อไปจะสร้างแถวใหม่ซ้อน
  // แทนที่จะ update แถวเดิม จนชน unique index by_emp_year_month
  async function bulkPut(storeName, values) {
    if (!values.length) return values;
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      values.forEach((v) => {
        const req = store.put(v);
        req.onsuccess = () => {
          if (v.id === undefined) v.id = req.result;
        };
      });
      tx.oncomplete = () => resolve(values);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function remove(storeName, key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clear(storeName) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getByEmpYearMonth(employeeId, year, month) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const idx = db
        .transaction(STORES.TASK_ENTRIES, 'readonly')
        .objectStore(STORES.TASK_ENTRIES)
        .index('by_emp_year_month');
      const req = idx.get([employeeId, year, month]);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function getSetting(key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORES.SETTINGS, 'readonly').objectStore(STORES.SETTINGS).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function setSetting(key, value) {
    return put(STORES.SETTINGS, { key, value });
  }

  async function getCryptoKey(name) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORES.CRYPTO_KEYS, 'readonly').objectStore(STORES.CRYPTO_KEYS).get(name);
      req.onsuccess = () => resolve(req.result ? req.result.key : null);
      req.onerror = () => reject(req.error);
    });
  }

  async function setCryptoKey(name, key) {
    return put(STORES.CRYPTO_KEYS, { name, key });
  }

  // ---- .xls seed import (SheetJS, lazy-loaded from CDN) ----

  let sheetJsPromise = null;
  function _loadSheetJs() {
    if (window.XLSX) return Promise.resolve();
    if (sheetJsPromise) return sheetJsPromise;
    sheetJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = AppConfig.SHEETJS_CDN;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('โหลดตัวอ่านไฟล์ Excel (SheetJS) ไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ต'));
      document.head.appendChild(script);
    });
    return sheetJsPromise;
  }

  // Layout ที่รองรับ: แถวหัวตารางมีเซลล์ 'JAN' อยู่ในแถวเดียวกับ FEB..DEC/SUM
  // คอลัมน์ก่อนหน้า JAN 4 คอลัมน์ ตามลำดับคือ Section, No., ชื่อ, นามสกุล (ใน "Observetion PE1 2026..xls")
  function _parseObservationSheet(rows, year) {
    const headerRowIdx = rows.findIndex((r) => r.some((c) => String(c ?? '').trim().toUpperCase() === 'JAN'));
    if (headerRowIdx === -1) {
      throw new Error('ไม่พบหัวตารางเดือน (JAN..DEC) ในไฟล์ — ตรวจว่าเลือกไฟล์รายงานถูกต้อง');
    }
    const header = rows[headerRowIdx];
    const monthColStart = header.findIndex((c) => String(c ?? '').trim().toUpperCase() === 'JAN');
    const sectionCol = monthColStart - 4;
    const noCol = monthColStart - 3;
    const firstNameCol = monthColStart - 2;
    const lastNameCol = monthColStart - 1;

    const sectionNames = [];
    const employees = [];
    const taskEntries = [];
    let currentSection = null;

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      const firstName = row[firstNameCol];
      if (!firstName || !String(firstName).trim()) continue; // ข้ามแถวว่าง/แถวสรุป

      const sectionCell = row[sectionCol];
      if (sectionCell && String(sectionCell).trim()) {
        currentSection = String(sectionCell).trim();
        if (!sectionNames.includes(currentSection)) sectionNames.push(currentSection);
      }

      const empId = uid();
      employees.push({
        id: empId,
        no: Number(row[noCol]) || employees.length + 1,
        firstName: String(firstName).trim(),
        lastName: String(row[lastNameCol] ?? '').trim(),
        sectionName: currentSection,
      });

      for (let m = 0; m < 12; m++) {
        const raw = row[monthColStart + m];
        const count = Number(raw);
        if (raw !== null && raw !== undefined && raw !== '' && !Number.isNaN(count)) {
          taskEntries.push({ employeeId: empId, year, month: m + 1, count });
        }
      }
    }

    return { sectionNames, employees, taskEntries };
  }

  async function parseXlsFile(file, year) {
    await _loadSheetJs();
    const buf = await file.arrayBuffer();
    const wb = window.XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    return _parseObservationSheet(rows, year);
  }

  return {
    open,
    getAll,
    put,
    bulkPut,
    remove,
    clear,
    getByEmpYearMonth,
    getSetting,
    setSetting,
    getCryptoKey,
    setCryptoKey,
    parseXlsFile,
  };
})();
