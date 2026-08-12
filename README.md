# Stop Auto-Update

เว็บแอปนับจำนวน STOP Observation ต่อพนักงาน/เดือน — กรอกมือได้ หรือวาง screenshot จากรายงาน Lotus Notes แล้วให้ Gemini Vision อ่านชื่อ+นับจำนวนให้อัตโนมัติ

🔗 **ใช้งานออนไลน์:** https://stop-auto-update.supasiao.workers.dev

## วิธีรัน (ไม่ต้อง npm install)

แอปนี้เป็น **Multi-file แบบไม่มี build step** (ES Modules ธรรมดา) — เบราว์เซอร์บล็อกการ `import` module ถ้าเปิดไฟล์แบบ `file://` ตรงๆ (CORS) จึงต้องรันผ่าน local server เล็กๆ แค่ครั้งเดียวตอนเปิดใช้งาน ไม่ต้องติดตั้งอะไรถาวร:

**วิธีที่ 1 — VS Code Live Server (แนะนำ)**
1. คลิกขวาที่ `index.html` ในไฟล์เอ็กซ์พลอเรอร์ของ VS Code
2. เลือก **"Open with Live Server"**
3. เบราว์เซอร์จะเปิดหน้าแอปให้อัตโนมัติ

**วิธีที่ 2 — คำสั่งเดียว (ไม่ต้องติดตั้ง extension)**
```bash
npx serve .
```
แล้วเปิด URL ที่แสดงในเทอร์มินัล (เช่น `http://localhost:3000`)

## ฟีเจอร์หลัก

- จัดการแผนก/พนักงาน (CRUD)
- นำเข้าข้อมูลเริ่มต้นจากไฟล์ Excel (`Observetion PE1 2026..xls` หรือไฟล์รูปแบบเดียวกัน)
- กรอกจำนวนงานด้วยมือ ต่อคน/เดือน/ปี
- นำเข้าอัตโนมัติจาก screenshot รายงาน Lotus Notes ด้วย Gemini Vision (BYOK):
  - วางได้หลายภาพต่อ 1 รอบ (รายชื่อยาวเกิน 1 หน้าจอ)
  - AI ดึงรายชื่อทีละแถว ไม่ใช่ให้ AI นับเลขเอง — แอปนับความถี่เองฝั่ง client แม่นยำกว่า
  - กันแถวซ้ำข้ามภาพด้วย rowKey (Date+Title)
  - มีหน้าตรวจสอบ (review) ก่อนบันทึกจริงเสมอ
- Export/Import JSON สำรองข้อมูล

## ข้อมูลเก็บที่ไหน

ทั้งหมดเก็บใน **IndexedDB ของเบราว์เซอร์เครื่องนั้นๆ** (`stop_auto_update_db`) ไม่มี cloud sync ในเวอร์ชันนี้ — ถ้าจะย้ายข้อมูลข้ามเครื่อง ใช้ปุ่ม Export/Import JSON

Gemini API key เข้ารหัส AES-GCM 256-bit ก่อนเก็บใน IndexedDB (ปุ่ม ⚙ ตั้งค่า) — ใช้แบบ BYOK ต่อเบราว์เซอร์/เครื่อง (แต่ละคนที่เปิด URL ต้องตั้ง key ของตัวเอง เพราะ IndexedDB ไม่ sync ข้ามเครื่อง)

## Deploy

Deploy อยู่บน Cloudflare Workers ผ่าน GitHub Actions (`wrangler deploy` อัตโนมัติทุกครั้งที่ push ขึ้น `main`) — ดูรายละเอียดที่ `.github/workflows/deploy.yml` และ `wrangler.jsonc`

## Roadmap

- [x] Phase ① Local-First + Excel Import + AI OCR (เวอร์ชันนี้)
- [x] Phase ② ปรับปรุงตาม feedback การใช้งานจริง (แก้ id-patch bug, dark mode, OCR name matching, sort by No., email banner export)
- [x] Phase ④ Deploy ขึ้น Cloudflare Workers
- [ ] Phase ③ Cloud sync (ถ้าต้องการ real-time หลายคนแก้พร้อมกันในอนาคต — ดู skill `vibe-coding-firebase`)
