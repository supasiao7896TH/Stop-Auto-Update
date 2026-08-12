# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## โปรเจกต์

**Stop Auto-Update** — เว็บแอปนับจำนวน STOP Observation ต่อพนักงาน/เดือน กรอกมือได้ หรือวาง screenshot รายงานจาก Lotus Notes แล้วให้ Gemini Vision อ่านชื่อ+นับจำนวนให้อัตโนมัติ Local-first (IndexedDB) ไม่มี backend server ของตัวเอง

Live: https://stop-auto-update.supasiao.workers.dev

## Commands

Multi-file ES Modules **ไม่มี build step** — ห้ามเพิ่ม Vite/Webpack/bundler ใดๆ (ขัดกับมาตรฐาน Vibe Coding ของพี่ A ที่ห้าม build tools เพื่อไม่ให้ workflow เครื่องบ้าน/ที่ทำงานพัง) ไม่มี `package.json`/npm scripts, ไม่มี lint, ไม่มี automated test — ยังไม่ได้ตั้ง Vitest ไว้เลย (ถ้าจะเพิ่มในอนาคต ต้องเลือก test runner ที่ไม่บังคับ bundler เพราะไม่มี build step)

รันด้วย VS Code "Open with Live Server" หรือ `npx serve .` — ต้องผ่าน local server เสมอ (ES module `import` โดน CORS บล็อกถ้าเปิดแบบ `file://`)

Deploy: push ขึ้น branch `main` → GitHub Actions (`.github/workflows/deploy.yml`) รัน `wrangler deploy` อัตโนมัติขึ้น Cloudflare Workers (static assets, ดู `wrangler.jsonc`) — ไม่มี CI แยกสำหรับ build/test เพราะไม่มีขั้นตอนนั้นให้รัน

## สถาปัตยกรรม

```
index.html              ← markup, Tailwind/Lucide/Fonts CDN, modal skeletons ทั้งหมดอยู่ที่นี่
src/
  main.js                ← entry, boot AppCore ตอน DOMContentLoaded
  style.css               ← custom CSS เล็กน้อย (Tailwind CDN จัดการส่วนใหญ่)
  modules/
    utils.js              ← escHtml(), fullName(), uid()
    app-config.js          ← DB name/version, month names, Gemini model/CDN URLs
    debug.js                ← DebugModule.log/getLog
    state-store.js           ← StateStore: get/set/on/off/optimisticUpdate (reactive)
    storage-engine.js         ← IndexedDB CRUD + parseXlsFile() (SheetJS lazy-load)
    gemini-ai-bridge.js        ← AES-GCM key vault + Vision OCR + tally + fuzzy match
    ui-renderer.js               ← DOM rendering (ไม่มี business logic)
    app-core.js                  ← orchestration, event binding, ทุก handler
```

โมดูลแต่ละไฟล์ export ตัวแปรเดียวเป็น IIFE-object (`export const ModuleName = (() => {...})();`) ตาม 9-module pattern ของ `vibe-coding-core` — ห้ามมี global function หลุดออกมานอก module

## Data model (IndexedDB `stop_auto_update_db` v1)

```
sections:     { id, name, order }
employees:    { id, no, firstName, lastName, sectionId }
taskEntries:  { id (autoIncrement), employeeId, year, month, count }
              unique index: by_emp_year_month = [employeeId, year, month]
settings:     { key: 'geminiApiKeyEnc', value: { iv, ciphertext } }  (base64)
cryptoKeys:   { name: 'geminiKeyWrap', key }   ← non-extractable AES-GCM CryptoKey
```

การเพิ่ม/แก้ taskEntries **ต้องผ่าน** `_upsertTaskEntry()` ใน app-core.js เท่านั้น (หา entry เดิมด้วย employeeId+year+month แล้ว update-in-place หรือสร้างใหม่) — ห้าม `put` เข้า taskEntries ตรงๆ จากที่อื่น เพราะจะข้าม dedup logic นี้ไป

`StorageEngine.open()` memoize connection เดียวไว้ใน `dbPromise` (module-level singleton) — เรียกซ้ำกี่ครั้งได้ connection เดิม ไม่เปิดซ้ำ

## OCR import — จุดที่ต้องเข้าใจก่อนแก้

ภาพต้นทาง (screenshot รายงาน Lotus Notes) **ไม่มีคอลัมน์ตัวเลขจำนวนงาน** — แต่ละแถวคือ 1 observation record ของคนคนหนึ่ง ต้องนับจำนวนแถวที่ชื่อซ้ำกันเอง

จึงออกแบบให้ Gemini ทำหน้าที่แค่ "อ่านรายชื่อทีละแถว" (`GeminiAiBridge.extractObservationRows`) ไม่ใช่ "นับเลขให้" — เพราะ LLM นับแถวจำนวนมากมักพลาด แล้วให้ `GeminiAiBridge.tallyObservations()` นับความถี่ด้วย JS ล้วนฝั่ง client แทน ถ้าจะแก้ prompt หรือ flow นี้ ต้องคงหลักการนี้ไว้

รองรับวางหลายภาพต่อ 1 รอบนำเข้า (เพราะรายชื่อยาวเกิน 1 หน้าจอ) และกันแถวซ้ำข้ามภาพด้วย `rowKey` (Date+Title) ก่อนนับ — ถ้าผู้ใช้แปะภาพซ้อนทับกัน (scroll เหลื่อม) จะไม่นับซ้ำ

ผลลัพธ์ OCR ที่ได้คือ**ยอดรวมสุดท้ายของเดือนนั้น** (ไม่ใช่ยอดเพิ่ม) — ตอน "บันทึกทั้งหมด" จะ**overwrite** ค่าเดิมของเดือนนั้น ไม่ใช่บวกเพิ่ม (ผ่าน `_upsertTaskEntry`)

## Excel import (.xls seed)

`storage-engine.js#parseXlsFile()` หาหัวตารางด้วยการค้นเซลล์ `'JAN'` แล้วคำนวณตำแหน่งคอลัมน์ Section/No./ชื่อ/นามสกุล แบบ **relative offset** จากตำแหน่ง JAN (ไม่ hardcode index ตรงๆ) —ยึดตาม layout ของไฟล์ `Observetion PE1 2026..xls` จริง ถ้าพี่ A เปลี่ยน template ไฟล์ ต้องตรวจ layout ใหม่ก่อนแก้ (ไฟล์ `.xls`/`.xlsx` ต้นฉบับอยู่ที่ root แต่ไม่ถูก track ใน git — ดู `.gitignore`)

## Default seed data (`src/assets/seed-data.json`)

DB ที่ว่างเปล่า (เบราว์เซอร์/เครื่องใหม่ที่ไม่เคยมีข้อมูล) จะถูก auto-seed ด้วยไฟล์นี้ตอน `AppCore.init()` (`_seedDefaultDataIfEmpty()` ใน `app-core.js`) — เช็คจาก `employees.length > 0` ก่อนเสมอ ถ้ามีข้อมูลอยู่แล้วจะ**ไม่ทับ** จึงปลอดภัยกับผู้ใช้ที่มีข้อมูลของตัวเองอยู่แล้ว มีผลเฉพาะผู้ใช้ใหม่จริงๆ เท่านั้น

**ข้อมูลนี้เป็น static snapshot ไม่อัปเดตเองเมื่อเวลาผ่านไป** (ไม่มี cloud sync) — เมื่อจะรีเฟรชให้เป็นเดือนล่าสุด: กด "Export" จากเบราว์เซอร์ที่มีข้อมูลล่าสุดครบถ้วน → เอาไฟล์ที่ได้มาแทนที่ `src/assets/seed-data.json` (ตัดเดือนที่ยังนับไม่ครบทั้งเดือนออกก่อน อย่าให้มีข้อมูล partial ปนเข้ามา — จะดูเหมือนบางคน "ไม่มี STOP เลย" ทั้งที่ยังไม่ได้นับ) → ตัด key `exportedAt` ทิ้ง → commit → push

## Email banner (คัดลอกรูปสรุปเข้า clipboard)

ปุ่ม "คัดลอกรูปสำหรับอีเมล" ใช้ `html2canvas` (CDN lazy-load แบบเดียวกับ SheetJS, ดู `AppConfig.HTML2CANVAS_CDN`) แปลง element ที่ render ไว้ใน `#emailBannerContainer` (ซ่อนนอกจอใน `index.html`) เป็นรูป PNG แล้วเขียนเข้า clipboard ด้วย `navigator.clipboard.write()` — ถ้าคัดลอกไม่ได้ (permission/browser ไม่รองรับ) จะ fallback เป็นดาวน์โหลดไฟล์แทนอัตโนมัติ

Banner รวม**ทุกแผนกทุกเดือนเสมอ** (ไม่ตาม filter ที่ผู้ใช้เลือกอยู่บนจอ) และ auto-detect "รายงานประจำเดือน" จากเดือนล่าสุดที่มีข้อมูลจริงในปีที่เลือก (`UiRenderer._latestMonthWithData`) — ไม่ใช่เดือนปัจจุบันของปฏิทิน

## Security

- Gemini API key: AES-GCM 256-bit, non-extractable wrap key ใน IndexedDB — BYOK เหมาะกับ use case นี้เพราะใช้คนเดียว ยังไม่ได้ทำ shared multi-user จริงจัง (ถ้าจะแชร์ key กลางในอนาคต ต้องเปลี่ยนเป็น Cloudflare Worker proxy แทน — ดู `vibe-coding-core/references/ai-integration.md`)
- ชื่อพนักงาน/แผนก/ข้อมูลจาก OCR ทุกจุดที่ render ต้องผ่าน `escHtml()` ใน utils.js ก่อนเสมอ (ป้องกัน XSS)
- รายชื่อพนักงาน/แผนกไม่ใช่ข้อมูลลับ (ยืนยันแล้ว) — เก็บใน `src/assets/seed-data.json` และ deploy ขึ้น production ได้ปกติ

## ยังไม่ได้ทำ

- ไม่มี Cloud sync / multi-user (แต่ละเบราว์เซอร์เก็บข้อมูลแยกกันใน IndexedDB ของตัวเอง)
- ไม่มี automated test
