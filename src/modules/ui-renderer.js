import { AppConfig } from './app-config.js';
import { escHtml, fullName } from './utils.js';

export const UiRenderer = (() => {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  // ---- Theme ----

  function applyTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    const icon = $('themeToggleIcon');
    if (icon) icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
    if (window.lucide) window.lucide.createIcons();

    // D1 (สว่าง) กับ D2 (มืด) เป็นโลโก้เดียวกันคนละโหมด — ห้ามใช้ D1 บนพื้นมืด (คอนทราสต์ไม่พอ)
    const brandLogo = $('brandLogo');
    if (brandLogo) {
      brandLogo.src =
        theme === 'dark' ? './src/assets/brand/d2-crt-night-bare.svg' : './src/assets/brand/d1-neon-arcade-bare.svg';
    }
  }

  // ---- Toast ----

  function toast(message, type = 'info') {
    const container = $('toastContainer');
    if (!container) return;
    const colors = {
      info: 'bg-slate-800 dark:bg-slate-700',
      success: 'bg-emerald-600',
      error: 'bg-rose-600',
      warn: 'bg-amber-600',
    };
    const el = document.createElement('div');
    el.className = `${colors[type] || colors.info} text-white text-sm px-4 py-2.5 rounded-xl shadow-lg backdrop-blur-md/50 animate-[fadeIn_.15s_ease-out]`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }

  // ---- Modal ----

  function openModal(modalId) {
    const modal = $(modalId);
    if (!modal) return;
    modal.classList.remove('hidden');
    const focusable = modal.querySelector('input, select, textarea, button');
    focusable?.focus();
  }

  function closeModal(modalId) {
    $(modalId)?.classList.add('hidden');
  }

  // ---- Static UI (built once) ----

  function renderMonthHeader() {
    const row = $('monthHeaderRow');
    if (!row) return;
    row.innerHTML =
      '<th class="px-3 py-2 text-left font-semibold">Section</th>' +
      '<th class="px-3 py-2 text-left font-semibold">No.</th>' +
      '<th class="px-3 py-2 text-left font-semibold min-w-[180px]">ชื่อ-นามสกุล</th>' +
      AppConfig.MONTH_NAMES.map((m) => `<th class="px-2 py-2 text-center font-semibold">${m}</th>`).join('') +
      '<th class="px-3 py-2 text-center font-semibold">SUM</th>' +
      '<th class="px-2 py-2"></th>';
  }

  function renderYearOptions(selectEl, selectedYear) {
    if (!selectEl) return;
    const current = AppConfig.CURRENT_YEAR;
    const years = [current + 1, current, current - 1, current - 2];
    selectEl.innerHTML = years.map((y) => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}</option>`).join('');
  }

  function renderMonthOptions(selectEl, selectedMonth) {
    if (!selectEl) return;
    selectEl.innerHTML = AppConfig.MONTH_NAMES.map(
      (m, i) => `<option value="${i + 1}" ${i + 1 === selectedMonth ? 'selected' : ''}>${m}</option>`
    ).join('');
  }

  function renderSectionOptions(selectEl, sections, selectedId, includeAll = false) {
    if (!selectEl) return;
    const opts = [];
    if (includeAll) opts.push(`<option value="">ทั้งหมด</option>`);
    sections.forEach((s) => {
      opts.push(`<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${escHtml(s.name)}</option>`);
    });
    selectEl.innerHTML = opts.join('');
  }

  function renderEmployeeOptions(selectEl, employees, selectedId) {
    if (!selectEl) return;
    selectEl.innerHTML = employees
      .slice()
      .sort((a, b) => a.no - b.no)
      .map((e) => `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escHtml(fullName(e))}</option>`)
      .join('');
  }

  // ---- Section colors (shared by sidebar, main table, email banner) ----

  function _isDarkMode() {
    return document.documentElement.classList.contains('dark');
  }

  // สีตายตัวต่อแผนกตามลำดับ section.order — ไม่ผูกกับลำดับที่ filter/แสดงผล เพื่อให้
  // แผนกเดิมได้สีเดิมเสมอ (categorical color ต้องผูกกับ entity ไม่ใช่ตำแหน่งที่ render)
  // forceLight: ใช้ตอน render รูปสรุปอีเมล ซึ่งพื้นเป็นสีขาวตายตัวเสมอ ไม่ตามธีมแอป
  function _sectionColorMap(sections, forceLight = false) {
    const isDark = !forceLight && _isDarkMode();
    const palette = isDark ? AppConfig.SECTION_COLOR_PALETTE_DARK : AppConfig.SECTION_COLOR_PALETTE;
    const sorted = sections.slice().sort((a, b) => a.order - b.order);
    return new Map(sorted.map((s, i) => [s.id, palette[i % palette.length]]));
  }

  // ---- Sidebar ----

  function renderSectionsSidebar(sections, activeSectionId) {
    const container = $('sectionListContainer');
    if (!container) return;
    const sectionColorById = _sectionColorMap(sections);
    const allClass = !activeSectionId ? 'bg-white/60 dark:bg-white/10 font-semibold' : 'hover:bg-white/40 dark:hover:bg-white/5';
    let html = `<button data-section-id="" class="section-nav-item w-full text-left px-3 py-2 rounded-lg text-sm ${allClass}">ทั้งหมด</button>`;
    html += sections
      .map((s) => {
        const active = s.id === activeSectionId;
        const cls = active ? 'bg-white/60 dark:bg-white/10 font-semibold' : 'hover:bg-white/40 dark:hover:bg-white/5';
        const color = sectionColorById.get(s.id);
        const dot = `<span style="display:inline-block; width:8px; height:8px; border-radius:999px; background:${color.text}; margin-right:8px; flex-shrink:0;"></span>`;
        return `<button data-section-id="${s.id}" class="section-nav-item w-full text-left px-3 py-2 rounded-lg text-sm ${cls} flex items-center">${dot}${escHtml(s.name)}</button>`;
      })
      .join('');
    container.innerHTML = html;
  }

  // ---- Main table ----

  function _monthCount(taskEntries, employeeId, year, month) {
    const entry = taskEntries.find((t) => t.employeeId === employeeId && t.year === year && t.month === month);
    return entry ? entry.count : null;
  }

  function renderTable({ sections, employees, taskEntries, filterYear, filterSectionId }) {
    const tbody = $('taskTableBody');
    if (!tbody) return;

    const sectionNameById = new Map(sections.map((s) => [s.id, s.name]));
    const sectionColorById = _sectionColorMap(sections);
    const neutralBadge = _isDarkMode() ? { bg: '#2c2c2a', text: '#c3c2b7' } : { bg: '#f1f5f9', text: '#64748b' };
    let visible = employees.filter((e) => !filterSectionId || e.sectionId === filterSectionId);
    // เรียงตาม No. ตรงตามลำดับในไฟล์ Excel ต้นฉบับ (ไม่จัดกลุ่มตามชื่อแผนกแล้ว
    // เพราะไฟล์ต้นฉบับไม่ได้เรียงแผนกตามตัวอักษร)
    visible = visible.slice().sort((a, b) => a.no - b.no);

    if (!visible.length) {
      tbody.innerHTML = `<tr><td colspan="17" class="px-3 py-10 text-center text-slate-400">ยังไม่มีข้อมูลพนักงาน — กด "เพิ่มพนักงาน" หรือ "นำเข้าจาก Excel" เพื่อเริ่มต้น</td></tr>`;
      return;
    }

    tbody.innerHTML = visible
      .map((emp) => {
        const monthCells = AppConfig.MONTH_NAMES.map((_, i) => {
          const month = i + 1;
          const count = _monthCount(taskEntries, emp.id, filterYear, month);
          return `<td class="px-1 py-1 text-center">
            <button data-emp-id="${emp.id}" data-month="${month}" class="month-cell-btn w-10 h-8 rounded-lg text-sm hover:bg-sky-100 dark:hover:bg-sky-900/40 ${count ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-300 dark:text-slate-600'}">${count ?? '–'}</button>
          </td>`;
        }).join('');
        const sum = AppConfig.MONTH_NAMES.reduce((acc, _, i) => acc + (_monthCount(taskEntries, emp.id, filterYear, i + 1) || 0), 0);
        const sectionColor = sectionColorById.get(emp.sectionId) || neutralBadge;
        const sectionBadge = `<span style="display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600; background:${sectionColor.bg}; color:${sectionColor.text};">${escHtml(sectionNameById.get(emp.sectionId) || '-')}</span>`;

        return `<tr class="border-b border-slate-100 dark:border-white/5">
          <td class="px-3 py-2">${sectionBadge}</td>
          <td class="px-3 py-2 text-slate-500">${emp.no}</td>
          <td class="px-3 py-2 font-medium">${escHtml(fullName(emp))}</td>
          ${monthCells}
          <td class="px-3 py-2 text-center font-bold text-sky-700 dark:text-sky-400">${sum}</td>
          <td class="px-2 py-2 text-center">
            <button data-edit-emp-id="${emp.id}" class="edit-emp-btn text-slate-400 hover:text-sky-600" aria-label="แก้ไขพนักงาน ${escHtml(fullName(emp))}">
              <i data-lucide="pencil" class="w-4 h-4"></i>
            </button>
          </td>
        </tr>`;
      })
      .join('');

    if (window.lucide) window.lucide.createIcons();
  }

  // ---- Manage sections modal ----

  function renderSectionsManageList(sections) {
    const container = $('sectionsManageList');
    if (!container) return;
    if (!sections.length) {
      container.innerHTML = `<p class="text-sm text-slate-400 py-2">ยังไม่มีแผนก</p>`;
      return;
    }
    container.innerHTML = sections
      .map(
        (s) => `<div class="flex items-center justify-between px-3 py-2 rounded-lg bg-white/50 dark:bg-white/5">
          <span class="text-sm">${escHtml(s.name)}</span>
          <button data-delete-section-id="${s.id}" class="delete-section-btn text-slate-400 hover:text-rose-600" aria-label="ลบแผนก ${escHtml(s.name)}">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>`
      )
      .join('');
    if (window.lucide) window.lucide.createIcons();
  }

  // ---- Employee form ----

  function fillEmployeeForm(employee) {
    $('employeeId').value = employee?.id || '';
    $('employeeNo').value = employee?.no ?? '';
    $('employeeFirstName').value = employee?.firstName ?? '';
    $('employeeLastName').value = employee?.lastName ?? '';
    $('employeeSection').value = employee?.sectionId ?? '';
    $('employeeModalTitle').textContent = employee ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงานใหม่';
    $('btnDeleteEmployee').classList.toggle('hidden', !employee);
  }

  // ---- Manual entry form ----

  function fillManualEntryForm({ employeeId, year, month, count }) {
    if (employeeId) $('manualEntryEmployee').value = employeeId;
    $('manualEntryYear').value = year;
    if (month) $('manualEntryMonth').value = month;
    $('manualEntryCount').value = count ?? '';
  }

  // ---- OCR import modal ----

  function renderOcrImageQueue(images) {
    const container = $('ocrImageQueue');
    if (!container) return;
    if (!images.length) {
      container.innerHTML = `<p class="text-xs text-slate-400">ยังไม่มีภาพ — วาง (Ctrl+V) หรือลากไฟล์มาวาง หรือกดเลือกไฟล์</p>`;
      return;
    }
    container.innerHTML = images
      .map(
        (img, idx) => `<div class="relative inline-block mr-2 mb-2">
          <img src="data:${img.mimeType};base64,${img.base64}" class="w-20 h-20 object-cover rounded-lg border border-slate-200 dark:border-white/10" alt="ภาพที่ ${idx + 1}" />
          <button data-remove-image-idx="${idx}" class="remove-ocr-image-btn absolute -top-2 -right-2 bg-rose-600 text-white rounded-full w-5 h-5 text-xs leading-5">✕</button>
        </div>`
      )
      .join('');
  }

  function renderOcrReviewList(reviewRows, employees) {
    const container = $('ocrReviewList');
    if (!container) return;
    if (!reviewRows.length) {
      container.innerHTML = `<p class="text-sm text-slate-400 py-2">ไม่พบรายชื่อในภาพ</p>`;
      return;
    }
    const empOptions = (selectedId) =>
      `<option value="">— ไม่บันทึก —</option>` +
      employees
        .slice()
        .sort((a, b) => a.no - b.no)
        .map((e) => `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${escHtml(fullName(e))}</option>`)
        .join('');

    container.innerHTML = reviewRows
      .map((row, idx) => {
        const matchedBadge = row.matchType
          ? `<span class="text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">match: ${row.matchType}</span>`
          : `<span class="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">ไม่พบ — เลือกเอง</span>`;
        return `<div class="grid grid-cols-[1fr_1fr_70px] gap-2 items-center px-2 py-2 border-b border-slate-100 dark:border-white/5 text-sm">
          <div>
            <div class="font-medium">${escHtml(row.sourceName)}</div>
            ${matchedBadge}
          </div>
          <select data-review-idx="${idx}" class="ocr-review-emp-select w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-slate-800 px-2 py-1 text-sm">
            ${empOptions(row.employeeId)}
          </select>
          <input type="number" min="0" data-review-idx="${idx}" value="${row.count}" class="ocr-review-count-input w-full rounded-lg border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-slate-800 px-2 py-1 text-sm text-center" />
        </div>`;
      })
      .join('');
  }

  function setOcrReviewVisible(visible) {
    $('ocrReviewSection')?.classList.toggle('hidden', !visible);
  }

  // ---- Email banner (image export for pasting into email) ----

  function _latestMonthWithData(taskEntries, year) {
    // นับเฉพาะเดือนที่มีจำนวนงานจริง (count > 0) — แถวที่ count เป็น 0 (เช่น กรอกฟอร์ม
    // แล้วเผลอไม่ใส่เลข) ไม่ควรถูกตีความว่า "เดือนนี้มีคนเขียนรายงานแล้ว"
    const months = taskEntries.filter((t) => t.year === year && t.count > 0).map((t) => t.month);
    return months.length ? Math.max(...months) : null;
  }

  function renderEmailBanner(container, { sections, employees, taskEntries, year }) {
    if (!container) return;

    const sectionNameById = new Map(sections.map((s) => [s.id, s.name]));
    // forceLight: banner เป็นพื้นขาวตายตัวเสมอ ไม่ตามธีม dark/light ของแอป
    const sectionColorById = _sectionColorMap(sections, true);
    const neutralBadge = { bg: '#f1f5f9', text: '#64748b' };

    const latestMonth = _latestMonthWithData(taskEntries, year);
    const reportLabel = latestMonth ? `${AppConfig.MONTH_NAMES_FULL[latestMonth - 1]} ${year}` : String(year);

    const sortedEmployees = employees.slice().sort((a, b) => a.no - b.no);
    const monthHeaderCells = AppConfig.MONTH_NAMES.map(
      (m) => `<th style="padding:8px; border:1px solid #1c5cab; color:#ffffff;">${m}</th>`
    ).join('');

    const rows = sortedEmployees
      .map((emp, idx) => {
        const rowBg = idx % 2 === 0 ? '#ffffff' : '#f9f9f7';
        const monthCells = AppConfig.MONTH_NAMES.map((_, i) => {
          const count = _monthCount(taskEntries, emp.id, year, i + 1);
          return `<td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center; background:${rowBg};">${count ?? '–'}</td>`;
        }).join('');
        const sum = AppConfig.MONTH_NAMES.reduce((acc, _, i) => acc + (_monthCount(taskEntries, emp.id, year, i + 1) || 0), 0);
        const sectionColor = sectionColorById.get(emp.sectionId) || neutralBadge;
        const sectionBadge = `<span style="display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600; background:${sectionColor.bg}; color:${sectionColor.text};">${escHtml(sectionNameById.get(emp.sectionId) || '-')}</span>`;
        return `<tr>
          <td style="padding:6px 8px; border:1px solid #e2e8f0; background:${rowBg};">${sectionBadge}</td>
          <td style="padding:6px 8px; border:1px solid #e2e8f0; color:#64748b; background:${rowBg};">${emp.no}</td>
          <td style="padding:6px 8px; border:1px solid #e2e8f0; font-weight:600; background:${rowBg};">${escHtml(fullName(emp))}</td>
          ${monthCells}
          <td style="padding:6px 8px; border:1px solid #e2e8f0; text-align:center; background:${rowBg};">
            <span style="display:inline-block; padding:2px 10px; border-radius:999px; font-weight:700; background:#e5effa; color:#1c5cab;">${sum}</span>
          </td>
        </tr>`;
      })
      .join('');

    container.innerHTML = `
      <div style="background:#ffffff; width:1180px; font-family:'Noto Sans Thai', Arial, sans-serif; color:#1e293b;">
        <div style="text-align:center; padding:20px 24px; background:#e5effa;">
          <div style="font-size:22px; font-weight:700; color:#184f95;">STOP Observation Summary</div>
          <div style="font-size:13px; color:#52514e; margin-top:4px;">แผนก: ${escHtml(AppConfig.REPORT_DEPARTMENT_LABEL)}</div>
          <div style="font-size:13px; color:#52514e;">รายงานประจำเดือน ${escHtml(reportLabel)}</div>
        </div>
        <div style="display:flex; height:6px;">
          <div style="flex:0.365; background:#F4614B;"></div>
          <div style="flex:0.25; background:#ffffff;"></div>
          <div style="flex:0.385; background:#3D4EA3;"></div>
        </div>
        <div style="padding:20px 24px;">
          <table style="width:100%; border-collapse:collapse; font-size:12px;">
            <thead>
              <tr style="background:#2a78d6;">
                <th style="padding:8px; border:1px solid #1c5cab; color:#ffffff;">Section</th>
                <th style="padding:8px; border:1px solid #1c5cab; color:#ffffff;">No.</th>
                <th style="padding:8px; border:1px solid #1c5cab; color:#ffffff;">ชื่อ-นามสกุล</th>
                ${monthHeaderCells}
                <th style="padding:8px; border:1px solid #1c5cab; color:#ffffff;">SUM</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <div style="text-align:center; margin-top:16px; font-size:11px; color:#94a3b8;">
            สร้างเมื่อ ${escHtml(new Date().toLocaleString('th-TH'))} · A-Class WebCraft · by Supasit.A
          </div>
        </div>
      </div>`;
  }

  let html2canvasPromise = null;
  function _loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve();
    if (html2canvasPromise) return html2canvasPromise;
    html2canvasPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = AppConfig.HTML2CANVAS_CDN;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('โหลดตัวสร้างรูปภาพ (html2canvas) ไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ต'));
      document.head.appendChild(script);
    });
    return html2canvasPromise;
  }

  async function captureEmailBannerImage(container) {
    await _loadHtml2Canvas();
    const canvas = await window.html2canvas(container.firstElementChild, { backgroundColor: '#ffffff', scale: 2 });
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('สร้างรูปภาพไม่สำเร็จ'))), 'image/png');
    });
  }

  // ---- Settings modal ----

  function setGeminiKeyStatus(hasKey) {
    const el = $('geminiKeyStatus');
    if (!el) return;
    el.textContent = hasKey ? '✅ ตั้งค่า API key แล้ว' : 'ยังไม่ได้ตั้งค่า API key';
    el.className = hasKey ? 'text-sm text-emerald-600' : 'text-sm text-slate-400';
  }

  return {
    applyTheme,
    toast,
    openModal,
    closeModal,
    renderMonthHeader,
    renderYearOptions,
    renderMonthOptions,
    renderSectionOptions,
    renderEmployeeOptions,
    renderSectionsSidebar,
    renderTable,
    renderSectionsManageList,
    fillEmployeeForm,
    fillManualEntryForm,
    renderOcrImageQueue,
    renderOcrReviewList,
    setOcrReviewVisible,
    setGeminiKeyStatus,
    renderEmailBanner,
    captureEmailBannerImage,
  };
})();
