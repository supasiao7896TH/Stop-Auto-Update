import { AppConfig } from './app-config.js';
import { DebugModule } from './debug.js';
import { StorageEngine } from './storage-engine.js';
import { fullName } from './utils.js';

// GEMINI_AI_BRIDGE — BYOK Vision OCR + AES-GCM key vault + fuzzy name matching.
//
// Threat model (BYOK, single-user, no deploy yet): the AES-GCM wrap key is a
// non-extractable CryptoKey stored in IndexedDB. This stops someone from opening
// DevTools > Application > IndexedDB and reading the API key directly. It does
// NOT protect against XSS (decrypt runs in the same JS context as the page) or
// network inspection (the key is sent to Google's API in plain HTTPS requests,
// visible in DevTools > Network — normal for any client-side API call).
export const GeminiAiBridge = (() => {
  'use strict';

  const SETTINGS_KEY = 'geminiApiKeyEnc';
  const CRYPTO_KEY_NAME = 'geminiKeyWrap';

  async function _getOrCreateWrapKey() {
    let key = await StorageEngine.getCryptoKey(CRYPTO_KEY_NAME);
    if (key) return key;
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await StorageEngine.setCryptoKey(CRYPTO_KEY_NAME, key);
    return key;
  }

  function _bufToB64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  function _b64ToBuf(b64) {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  }

  async function encryptAndStoreApiKey(plainApiKey) {
    const wrapKey = await _getOrCreateWrapKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      wrapKey,
      new TextEncoder().encode(plainApiKey)
    );
    await StorageEngine.setSetting(SETTINGS_KEY, {
      iv: _bufToB64(iv),
      ciphertext: _bufToB64(ciphertext),
    });
  }

  async function hasApiKey() {
    const setting = await StorageEngine.getSetting(SETTINGS_KEY);
    return !!setting;
  }

  async function getDecryptedApiKey() {
    const setting = await StorageEngine.getSetting(SETTINGS_KEY);
    if (!setting) return null;
    const wrapKey = await _getOrCreateWrapKey();
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: _b64ToBuf(setting.value.iv) },
      wrapKey,
      _b64ToBuf(setting.value.ciphertext)
    );
    return new TextDecoder().decode(plainBuf);
  }

  async function clearApiKey() {
    const db = await StorageEngine.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AppConfig.STORES.SETTINGS, 'readwrite');
      tx.objectStore(AppConfig.STORES.SETTINGS).delete(SETTINGS_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function _fetchWithRetry(url, options) {
    let lastErr;
    for (let attempt = 0; attempt <= AppConfig.GEMINI_RETRIES; attempt++) {
      let res;
      try {
        res = await fetch(url, options);
      } catch (err) {
        // network-level failure (offline, DNS, CORS) — worth retrying
        lastErr = err;
        if (attempt < AppConfig.GEMINI_RETRIES) {
          await new Promise((r) => setTimeout(r, AppConfig.GEMINI_BACKOFF_MS[attempt] ?? 4000));
          continue;
        }
        throw lastErr;
      }

      if (res.ok) return res.json();

      const bodyText = await res.text().catch(() => '');
      lastErr = new Error(`Gemini API error ${res.status}: ${bodyText.slice(0, 500)}`);
      // 429/5xx are transient — worth retrying. Other 4xx (bad key, bad request) won't
      // fix themselves on retry, so fail fast instead of waiting ~7s to say the same thing.
      if (res.status !== 429 && res.status < 500) throw lastErr;
      if (attempt < AppConfig.GEMINI_RETRIES) {
        await new Promise((r) => setTimeout(r, AppConfig.GEMINI_BACKOFF_MS[attempt] ?? 4000));
      }
    }
    throw lastErr;
  }

  const EXTRACTION_PROMPT_BASE = `คุณกำลังดูภาพหน้าจอรายงาน Safety Observation (STOP) จากระบบ Lotus Notes
ในตารางแต่ละแถวคือ 1 รายการ observation ของพนักงาน 1 คน (คอลัมน์ Observer คือชื่อผู้บันทึก)
ให้คุณอ่านทุกแถวข้อมูล (ข้ามแถวหัวตาราง/แถวสรุปหมวด) จากภาพทั้งหมดที่แนบมา แล้วดึงออกมาเป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอก JSON

Schema: {"rows": [{"observer": string, "rowKey": string}]}
- observer: ชื่อ-นามสกุลในคอลัมน์ Observer ตามที่เห็นในภาพ โดยปกติให้คงตัวสะกดตามภาพ
  แต่ถ้าชื่อที่อ่านได้ใกล้เคียงกับชื่อใดชื่อหนึ่งใน "รายชื่อพนักงานที่มีอยู่ในระบบ" ด้านล่างมาก
  (เช่น ตัวอักษรซ้ำ/ขาดหายไปเล็กน้อยจากภาพไม่ชัด) ให้ใช้ตัวสะกดตามรายชื่อนั้นแทน เพื่อความแม่นยำ
- rowKey: ข้อความสั้นๆ ที่ไม่ซ้ำต่อแถว ใช้ตรวจจับแถวซ้ำ (เช่น รวม Date + Title ของแถวนั้น)
- ถ้าภาพซ้อนทับกัน (มีบางแถวปรากฏในหลายภาพ) ให้ใส่ rowKey เดิมซ้ำได้ ไม่ต้องกรองเอง ฝั่งแอปจะกรองซ้ำเอง`;

  function _buildExtractionPrompt(employees) {
    if (!employees?.length) return EXTRACTION_PROMPT_BASE;
    const roster = employees.map((e) => fullName(e)).join(', ');
    return `${EXTRACTION_PROMPT_BASE}

รายชื่อพนักงานที่มีอยู่ในระบบ (ใช้ช่วยตรวจตัวสะกดตามที่อธิบายไว้ข้างต้น):
${roster}`;
  }

  async function extractObservationRows(apiKey, images, employees = []) {
    const parts = [
      { text: _buildExtractionPrompt(employees) },
      ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.base64 } })),
    ];
    const url = `${AppConfig.GEMINI_API_BASE}/${AppConfig.GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = {
      contents: [{ parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    };

    let json;
    try {
      json = await _fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      DebugModule.log('error', 'GeminiAiBridge.extractObservationRows.fetch', err);
      throw new Error(`เรียก Gemini API ไม่สำเร็จ: ${err.message || err}`);
    }

    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini ไม่ส่งผลลัพธ์กลับมา (ภาพอาจไม่ชัดหรือไม่มีข้อมูลที่อ่านได้)');

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      DebugModule.log('error', 'GeminiAiBridge.extractObservationRows.parse', err);
      throw new Error('อ่านผลลัพธ์จาก Gemini ไม่สำเร็จ (รูปแบบ JSON ไม่ถูกต้อง) ลองใหม่อีกครั้ง');
    }
    return Array.isArray(parsed.rows) ? parsed.rows : [];
  }

  // รวมรายชื่อจากหลายภาพ, กันแถวซ้ำด้วย rowKey, นับความถี่ต่อชื่อเอง (ไม่พึ่งให้ Gemini นับ)
  function tallyObservations(rawRows) {
    const seenRowKeys = new Set();
    const counts = new Map();

    for (const row of rawRows) {
      const name = String(row.observer ?? '').trim();
      if (!name) continue;
      const rowKey = String(row.rowKey ?? '').trim() || `${name}::${counts.size}`;
      if (seenRowKeys.has(rowKey)) continue; // กันแถวซ้ำข้ามภาพที่ overlap กัน
      seenRowKeys.add(rowKey);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }

    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }

  // Zero-width space/joiner/BOM (U+200B, U+200C, U+200D, U+FEFF) — มองไม่เห็นบนจอ
  // แต่ทำให้ string เทียบไม่เท่ากัน มักติดมาจากการ copy ชื่อจาก Lotus Notes/Excel
  // หรือ OCR แทรกมาเอง — เขียนด้วย \u escape ตรงๆ กันพลาดเรื่อง encoding ตอนแก้ไฟล์
  const ZERO_WIDTH_CHARS_RE = /[​‌‍﻿]/g;

  function _normalize(str) {
    return String(str ?? '')
      .replace(ZERO_WIDTH_CHARS_RE, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function _levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] =
          a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
    return dp[m][n];
  }

  // exact -> first-name -> substring -> Levenshtein (length-scaled threshold)
  function matchEmployeeByName(rawName, employees) {
    const target = _normalize(rawName);
    if (!target) return null;

    for (const emp of employees) {
      if (_normalize(fullName(emp)) === target) return { employee: emp, matchType: 'exact' };
    }

    const firstToken = target.split(' ')[0];
    const firstNameMatches = employees.filter((emp) => _normalize(emp.firstName) === firstToken);
    if (firstNameMatches.length === 1) return { employee: firstNameMatches[0], matchType: 'firstName' };

    for (const emp of employees) {
      const empFull = _normalize(fullName(emp));
      if (empFull.includes(target) || target.includes(empFull)) {
        return { employee: emp, matchType: 'substring' };
      }
    }

    let best = null;
    let bestDist = Infinity;
    for (const emp of employees) {
      const empFull = _normalize(fullName(emp));
      const dist = _levenshtein(target, empFull);
      if (dist < bestDist) {
        bestDist = dist;
        best = emp;
      }
    }
    const threshold = Math.max(2, Math.floor(target.length * 0.3));
    if (best && bestDist <= threshold) return { employee: best, matchType: 'fuzzy' };

    DebugModule.log('warn', 'GeminiAiBridge.matchEmployeeByName.noMatch', {
      message: `ไม่พบคนที่ตรงกับ "${rawName}"`,
      normalizedTarget: target,
      targetCharCodes: [...target].map((c) => c.charCodeAt(0)),
      closestCandidate: best ? fullName(best) : null,
      closestDistance: bestDist,
      threshold,
    });
    return null;
  }

  return {
    encryptAndStoreApiKey,
    hasApiKey,
    getDecryptedApiKey,
    clearApiKey,
    extractObservationRows,
    tallyObservations,
    matchEmployeeByName,
  };
})();
