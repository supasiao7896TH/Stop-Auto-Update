import { AppConfig } from './app-config.js';
import { DebugModule } from './debug.js';
import { StateStore } from './state-store.js';
import { StorageEngine } from './storage-engine.js';
import { GeminiAiBridge } from './gemini-ai-bridge.js';
import { UiRenderer } from './ui-renderer.js';
import { uid } from './utils.js';

export const AppCore = (() => {
  'use strict';

  const { STORES } = AppConfig;

  // Transient UI-only state for the OCR import modal (not persisted).
  let ocrImages = [];
  let ocrReviewRows = [];
  let pendingExcelFile = null;

  // ================= Init =================

  async function init() {
    try {
      _initTheme();
      await _loadAllData();
      UiRenderer.renderMonthHeader();
      _renderAllViews();
      _bindEvents();
      const hasKey = await GeminiAiBridge.hasApiKey();
      UiRenderer.setGeminiKeyStatus(hasKey);
    } catch (err) {
      DebugModule.log('error', 'AppCore.init', err);
      UiRenderer.toast('เริ่มต้นแอปไม่สำเร็จ ลองรีเฟรชหน้าใหม่', 'error');
    }
  }

  async function _loadAllData() {
    const [sections, employees, taskEntries] = await Promise.all([
      StorageEngine.getAll(STORES.SECTIONS),
      StorageEngine.getAll(STORES.EMPLOYEES),
      StorageEngine.getAll(STORES.TASK_ENTRIES),
    ]);
    StateStore.set('sections', sections);
    StateStore.set('employees', employees);
    StateStore.set('taskEntries', taskEntries);
  }

  function _renderAllViews() {
    const s = _snapshot();
    UiRenderer.renderSectionsSidebar(s.sections, s.filterSectionId);
    UiRenderer.renderYearOptions(document.getElementById('filterYearSelect'), s.filterYear);
    UiRenderer.renderTable(s);
  }

  function _snapshot() {
    return {
      sections: StateStore.get('sections'),
      employees: StateStore.get('employees'),
      taskEntries: StateStore.get('taskEntries'),
      filterYear: StateStore.get('filterYear'),
      filterSectionId: StateStore.get('filterSectionId'),
    };
  }

  // ================= Theme =================

  function _initTheme() {
    const saved = localStorage.getItem(AppConfig.THEME_STORAGE_KEY);
    const theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    UiRenderer.applyTheme(theme);
  }

  function _toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    const next = isDark ? 'light' : 'dark';
    localStorage.setItem(AppConfig.THEME_STORAGE_KEY, next);
    UiRenderer.applyTheme(next);
  }

  // ================= Task entry upsert (shared by manual/OCR/Excel) =================

  async function _upsertTaskEntry(employeeId, year, month, count) {
    const list = StateStore.get('taskEntries');
    const idx = list.findIndex((t) => t.employeeId === employeeId && t.year === year && t.month === month);
    const draft = idx >= 0 ? { ...list[idx], count } : { employeeId, year, month, count };
    const next = list.slice();
    if (idx >= 0) next[idx] = draft;
    else next.push(draft);

    await StateStore.optimisticUpdate('taskEntries', next, () => StorageEngine.put(STORES.TASK_ENTRIES, draft));
  }

  // ================= Employee CRUD =================

  async function _handleEmployeeFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('employeeId').value || uid();
    const firstName = document.getElementById('employeeFirstName').value.trim();
    const lastName = document.getElementById('employeeLastName').value.trim();
    const sectionId = document.getElementById('employeeSection').value || null;
    const no = Number(document.getElementById('employeeNo').value) || StateStore.get('employees').length + 1;

    if (!firstName) {
      UiRenderer.toast('กรุณากรอกชื่อพนักงาน', 'warn');
      return;
    }

    const employee = { id, no, firstName, lastName, sectionId };
    const list = StateStore.get('employees');
    const idx = list.findIndex((e2) => e2.id === id);
    const next = list.slice();
    if (idx >= 0) next[idx] = employee;
    else next.push(employee);

    try {
      await StateStore.optimisticUpdate('employees', next, () => StorageEngine.put(STORES.EMPLOYEES, employee));
      UiRenderer.closeModal('modalEmployee');
      _renderAllViews();
      UiRenderer.toast('บันทึกข้อมูลพนักงานแล้ว', 'success');
    } catch (err) {
      DebugModule.log('error', 'AppCore.handleEmployeeFormSubmit', err);
      UiRenderer.toast('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง', 'error');
    }
  }

  async function _handleDeleteEmployee() {
    const id = document.getElementById('employeeId').value;
    if (!id) return;
    if (!confirm('ลบพนักงานคนนี้และประวัติจำนวนงานทั้งหมดของเขา?')) return;

    const employees = StateStore.get('employees').filter((e) => e.id !== id);
    const taskEntries = StateStore.get('taskEntries').filter((t) => t.employeeId !== id);
    const removedEntries = StateStore.get('taskEntries').filter((t) => t.employeeId === id);

    try {
      await StateStore.optimisticUpdate('employees', employees, () => StorageEngine.remove(STORES.EMPLOYEES, id));
      await StateStore.optimisticUpdate('taskEntries', taskEntries, async () => {
        for (const entry of removedEntries) await StorageEngine.remove(STORES.TASK_ENTRIES, entry.id);
      });
      UiRenderer.closeModal('modalEmployee');
      _renderAllViews();
      UiRenderer.toast('ลบพนักงานแล้ว', 'success');
    } catch (err) {
      DebugModule.log('error', 'AppCore.handleDeleteEmployee', err);
      UiRenderer.toast('ลบไม่สำเร็จ ลองใหม่อีกครั้ง', 'error');
    }
  }

  function _openEmployeeModal(employee) {
    UiRenderer.renderSectionOptions(document.getElementById('employeeSection'), StateStore.get('sections'), employee?.sectionId ?? null);
    UiRenderer.fillEmployeeForm(employee);
    UiRenderer.openModal('modalEmployee');
  }

  // ================= Sections CRUD =================

  async function _handleAddSection(e) {
    e.preventDefault();
    const input = document.getElementById('newSectionName');
    const name = input.value.trim();
    if (!name) return;
    const section = { id: uid(), name, order: StateStore.get('sections').length };
    const next = [...StateStore.get('sections'), section];

    try {
      await StateStore.optimisticUpdate('sections', next, () => StorageEngine.put(STORES.SECTIONS, section));
      input.value = '';
      UiRenderer.renderSectionsManageList(StateStore.get('sections'));
      _renderAllViews();
    } catch (err) {
      DebugModule.log('error', 'AppCore.handleAddSection', err);
      UiRenderer.toast('เพิ่มแผนกไม่สำเร็จ', 'error');
    }
  }

  async function _handleDeleteSection(sectionId) {
    if (!confirm('ลบแผนกนี้? พนักงานในแผนกจะไม่ถูกลบ แต่จะไม่มีแผนกกำกับ')) return;
    const next = StateStore.get('sections').filter((s) => s.id !== sectionId);
    try {
      await StateStore.optimisticUpdate('sections', next, () => StorageEngine.remove(STORES.SECTIONS, sectionId));
      UiRenderer.renderSectionsManageList(StateStore.get('sections'));
      _renderAllViews();
    } catch (err) {
      DebugModule.log('error', 'AppCore.handleDeleteSection', err);
      UiRenderer.toast('ลบแผนกไม่สำเร็จ', 'error');
    }
  }

  // ================= Manual entry =================

  function _openManualEntryModal({ employeeId, year, month, count } = {}) {
    const employees = StateStore.get('employees');
    UiRenderer.renderEmployeeOptions(document.getElementById('manualEntryEmployee'), employees, employeeId);
    UiRenderer.renderMonthOptions(document.getElementById('manualEntryMonth'), month || new Date().getMonth() + 1);
    UiRenderer.fillManualEntryForm({
      employeeId,
      year: year || StateStore.get('filterYear'),
      month,
      count,
    });
    UiRenderer.openModal('modalManualEntry');
  }

  async function _handleManualEntrySubmit(e) {
    e.preventDefault();
    const employeeId = document.getElementById('manualEntryEmployee').value;
    const year = Number(document.getElementById('manualEntryYear').value);
    const month = Number(document.getElementById('manualEntryMonth').value);
    const count = Number(document.getElementById('manualEntryCount').value);

    if (!employeeId || !year || !month || Number.isNaN(count) || count < 0) {
      UiRenderer.toast('กรอกข้อมูลให้ครบและถูกต้อง', 'warn');
      return;
    }

    try {
      await _upsertTaskEntry(employeeId, year, month, count);
      UiRenderer.closeModal('modalManualEntry');
      _renderAllViews();
      UiRenderer.toast('บันทึกจำนวนงานแล้ว', 'success');
    } catch (err) {
      DebugModule.log('error', 'AppCore.handleManualEntrySubmit', err);
      UiRenderer.toast('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง', 'error');
    }
  }

  // ================= Excel (.xls) seed import =================

  function _guessYearFromFilename(filename) {
    const m = filename.match(/(20\d{2})/);
    return m ? Number(m[1]) : StateStore.get('filterYear');
  }

  function _handleExcelFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    pendingExcelFile = file;
    document.getElementById('excelImportFileInfo').textContent = file.name;
    document.getElementById('excelImportYear').value = _guessYearFromFilename(file.name);
    UiRenderer.openModal('modalExcelImport');
  }

  async function _handleExcelImportConfirm(e) {
    e.preventDefault();
    if (!pendingExcelFile) return;
    const year = Number(document.getElementById('excelImportYear').value) || StateStore.get('filterYear');
    const btn = document.getElementById('btnExcelImportConfirm');
    btn.disabled = true;
    btn.textContent = 'กำลังนำเข้า...';

    try {
      const parsed = await StorageEngine.parseXlsFile(pendingExcelFile, year);
      await _mergeParsedExcelData(parsed);
      UiRenderer.closeModal('modalExcelImport');
      _renderAllViews();
      UiRenderer.toast(
        `นำเข้าแล้ว: ${parsed.sectionNames.length} แผนก, ${parsed.employees.length} พนักงาน, ${parsed.taskEntries.length} รายการ`,
        'success'
      );
    } catch (err) {
      DebugModule.log('error', 'AppCore.handleExcelImportConfirm', err);
      UiRenderer.toast(err.message || 'นำเข้าไฟล์ Excel ไม่สำเร็จ', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'นำเข้าข้อมูล';
      pendingExcelFile = null;
      document.getElementById('btnImportExcelFile').value = '';
    }
  }

  async function _mergeParsedExcelData(parsed) {
    const existingSections = StateStore.get('sections');
    const nameToId = new Map(existingSections.map((s) => [s.name, s.id]));
    const newSections = [];
    parsed.sectionNames.forEach((name) => {
      if (!nameToId.has(name)) {
        const section = { id: uid(), name, order: nameToId.size };
        nameToId.set(name, section.id);
        newSections.push(section);
      }
    });

    const newEmployees = parsed.employees.map((e) => ({
      id: e.id,
      no: e.no,
      firstName: e.firstName,
      lastName: e.lastName,
      sectionId: e.sectionName ? nameToId.get(e.sectionName) ?? null : null,
    }));
    const newTaskEntries = parsed.taskEntries.map((t) => ({ ...t }));

    if (newSections.length) {
      await StateStore.optimisticUpdate('sections', [...existingSections, ...newSections], () =>
        StorageEngine.bulkPut(STORES.SECTIONS, newSections)
      );
    }
    await StateStore.optimisticUpdate('employees', [...StateStore.get('employees'), ...newEmployees], () =>
      StorageEngine.bulkPut(STORES.EMPLOYEES, newEmployees)
    );
    await StateStore.optimisticUpdate('taskEntries', [...StateStore.get('taskEntries'), ...newTaskEntries], () =>
      StorageEngine.bulkPut(STORES.TASK_ENTRIES, newTaskEntries)
    );
  }

  // ================= OCR import (multi-image → tally → review → save) =================

  function _openOcrModal() {
    ocrImages = [];
    ocrReviewRows = [];
    UiRenderer.renderMonthOptions(document.getElementById('ocrMonth'), new Date().getMonth() + 1);
    document.getElementById('ocrYear').value = StateStore.get('filterYear');
    UiRenderer.renderOcrImageQueue(ocrImages);
    UiRenderer.setOcrReviewVisible(false);
    UiRenderer.openModal('modalOcrImport');
  }

  function _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function _addOcrImageFiles(files) {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const base64 = await _fileToBase64(file);
      ocrImages.push({ base64, mimeType: file.type });
    }
    UiRenderer.renderOcrImageQueue(ocrImages);
  }

  function _handleOcrPaste(e) {
    const items = [...(e.clipboardData?.items || [])].filter((it) => it.type.startsWith('image/'));
    if (!items.length) return;
    e.preventDefault();
    _addOcrImageFiles(items.map((it) => it.getAsFile()));
  }

  function _handleOcrDrop(e) {
    e.preventDefault();
    if (e.dataTransfer?.files?.length) _addOcrImageFiles([...e.dataTransfer.files]);
  }

  function _removeOcrImage(idx) {
    ocrImages.splice(idx, 1);
    UiRenderer.renderOcrImageQueue(ocrImages);
  }

  async function _handleOcrAnalyze() {
    if (!ocrImages.length) {
      UiRenderer.toast('กรุณาเพิ่มภาพอย่างน้อย 1 ภาพก่อน', 'warn');
      return;
    }
    const apiKey = await GeminiAiBridge.getDecryptedApiKey();
    if (!apiKey) {
      UiRenderer.toast('กรุณาตั้งค่า Gemini API key ที่ปุ่ม ⚙ ก่อน', 'warn');
      return;
    }

    const btn = document.getElementById('btnOcrAnalyze');
    btn.disabled = true;
    btn.textContent = 'กำลังวิเคราะห์ภาพ...';

    try {
      const employees = StateStore.get('employees');
      const rawRows = await GeminiAiBridge.extractObservationRows(apiKey, ocrImages, employees);
      const tallied = GeminiAiBridge.tallyObservations(rawRows);

      ocrReviewRows = tallied.map((row) => {
        const match = GeminiAiBridge.matchEmployeeByName(row.name, employees);
        return {
          sourceName: row.name,
          count: row.count,
          employeeId: match?.employee.id ?? null,
          matchType: match?.matchType ?? null,
        };
      });

      UiRenderer.renderOcrReviewList(ocrReviewRows, employees);
      UiRenderer.setOcrReviewVisible(true);
    } catch (err) {
      DebugModule.log('error', 'AppCore.handleOcrAnalyze', err);
      UiRenderer.toast(err.message || 'วิเคราะห์ภาพไม่สำเร็จ', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🔍 วิเคราะห์ทุกภาพ';
    }
  }

  function _handleOcrReviewChange(e) {
    const idx = e.target.dataset.reviewIdx;
    if (idx === undefined) return;
    if (e.target.classList.contains('ocr-review-emp-select')) {
      ocrReviewRows[idx].employeeId = e.target.value || null;
    } else if (e.target.classList.contains('ocr-review-count-input')) {
      ocrReviewRows[idx].count = Number(e.target.value) || 0;
    }
  }

  async function _handleOcrSaveAll() {
    const year = Number(document.getElementById('ocrYear').value);
    const month = Number(document.getElementById('ocrMonth').value);
    const rowsToSave = ocrReviewRows.filter((r) => r.employeeId && r.count > 0);

    if (!rowsToSave.length) {
      UiRenderer.toast('ไม่มีรายการที่จับคู่พนักงานไว้ ให้เลือกพนักงานในรายการก่อน', 'warn');
      return;
    }

    try {
      for (const row of rowsToSave) {
        await _upsertTaskEntry(row.employeeId, year, month, row.count);
      }
      UiRenderer.closeModal('modalOcrImport');
      _renderAllViews();
      UiRenderer.toast(`บันทึกแล้ว ${rowsToSave.length} รายการ`, 'success');
    } catch (err) {
      DebugModule.log('error', 'AppCore.handleOcrSaveAll', err);
      UiRenderer.toast('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง', 'error');
    }
  }

  // ================= Export / Import JSON backup =================

  function _handleExportJson() {
    const data = {
      exportedAt: new Date().toISOString(),
      sections: StateStore.get('sections'),
      employees: StateStore.get('employees'),
      taskEntries: StateStore.get('taskEntries'),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stop-auto-update-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function _handleImportJsonFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data.sections) || !Array.isArray(data.employees) || !Array.isArray(data.taskEntries)) {
        throw new Error('ไฟล์ backup ไม่ถูกต้อง (โครงสร้างข้อมูลไม่ตรง)');
      }
      if (!confirm('การนำเข้าจะแทนที่ข้อมูลปัจจุบันทั้งหมด ต้องการดำเนินการต่อหรือไม่?')) return;

      await Promise.all([StorageEngine.clear(STORES.SECTIONS), StorageEngine.clear(STORES.EMPLOYEES), StorageEngine.clear(STORES.TASK_ENTRIES)]);
      await Promise.all([
        StorageEngine.bulkPut(STORES.SECTIONS, data.sections),
        StorageEngine.bulkPut(STORES.EMPLOYEES, data.employees),
        StorageEngine.bulkPut(STORES.TASK_ENTRIES, data.taskEntries),
      ]);
      await _loadAllData();
      _renderAllViews();
      UiRenderer.toast('นำเข้าข้อมูล backup สำเร็จ', 'success');
    } catch (err) {
      DebugModule.log('error', 'AppCore.handleImportJsonFile', err);
      UiRenderer.toast(err.message || 'นำเข้าไฟล์ไม่สำเร็จ', 'error');
    } finally {
      e.target.value = '';
    }
  }

  // ================= Email banner (copy summary image to clipboard) =================

  function _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function _handleCopyEmailBanner() {
    const btn = document.getElementById('btnCopyEmailBanner');
    btn.disabled = true;
    const originalLabel = btn.innerHTML;
    btn.textContent = 'กำลังสร้างรูป...';

    try {
      const container = document.getElementById('emailBannerContainer');
      UiRenderer.renderEmailBanner(container, {
        sections: StateStore.get('sections'),
        employees: StateStore.get('employees'),
        taskEntries: StateStore.get('taskEntries'),
        year: StateStore.get('filterYear'),
      });
      const blob = await UiRenderer.captureEmailBannerImage(container);

      try {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        UiRenderer.toast('คัดลอกรูปสรุปแล้ว ไปวางในอีเมลได้เลย (Ctrl+V)', 'success');
      } catch (clipboardErr) {
        DebugModule.log('warn', 'AppCore.handleCopyEmailBanner.clipboard', clipboardErr);
        _downloadBlob(blob, `stop-summary-${StateStore.get('filterYear')}.png`);
        UiRenderer.toast('คัดลอกเข้า clipboard ไม่ได้ ดาวน์โหลดเป็นไฟล์ภาพให้แทน — ลากเข้าอีเมลได้เลย', 'warn');
      }
    } catch (err) {
      DebugModule.log('error', 'AppCore.handleCopyEmailBanner', err);
      UiRenderer.toast(err.message || 'สร้างรูปสรุปไม่สำเร็จ', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalLabel;
    }
  }

  // ================= Gemini API key settings =================

  async function _handleSaveGeminiKey(e) {
    e.preventDefault();
    const input = document.getElementById('geminiApiKeyInput');
    const value = input.value.trim();
    if (!value) {
      UiRenderer.toast('กรุณากรอก API key', 'warn');
      return;
    }
    try {
      await GeminiAiBridge.encryptAndStoreApiKey(value);
      input.value = '';
      UiRenderer.setGeminiKeyStatus(true);
      UiRenderer.toast('บันทึก API key แล้ว (เข้ารหัสไว้ในเครื่องนี้)', 'success');
    } catch (err) {
      DebugModule.log('error', 'AppCore.handleSaveGeminiKey', err);
      UiRenderer.toast('บันทึก API key ไม่สำเร็จ', 'error');
    }
  }

  async function _handleClearGeminiKey() {
    if (!confirm('ลบ Gemini API key ที่บันทึกไว้ในเครื่องนี้?')) return;
    await GeminiAiBridge.clearApiKey();
    UiRenderer.setGeminiKeyStatus(false);
    UiRenderer.toast('ลบ API key แล้ว', 'success');
  }

  // ================= Event binding =================

  function _bindEvents() {
    document.getElementById('themeToggleBtn').addEventListener('click', _toggleTheme);

    document.getElementById('btnSettings').addEventListener('click', async () => {
      UiRenderer.setGeminiKeyStatus(await GeminiAiBridge.hasApiKey());
      UiRenderer.openModal('modalSettings');
    });
    document.getElementById('geminiSettingsForm').addEventListener('submit', _handleSaveGeminiKey);
    document.getElementById('btnClearGeminiKey').addEventListener('click', _handleClearGeminiKey);

    document.getElementById('btnAddEmployee').addEventListener('click', () => _openEmployeeModal(null));
    document.getElementById('employeeForm').addEventListener('submit', _handleEmployeeFormSubmit);
    document.getElementById('btnDeleteEmployee').addEventListener('click', _handleDeleteEmployee);

    document.getElementById('btnManageSections').addEventListener('click', () => {
      UiRenderer.renderSectionsManageList(StateStore.get('sections'));
      UiRenderer.openModal('modalSections');
    });
    document.getElementById('newSectionForm').addEventListener('submit', _handleAddSection);
    document.getElementById('sectionsManageList').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-delete-section-id]');
      if (btn) _handleDeleteSection(btn.dataset.deleteSectionId);
    });

    document.getElementById('btnManualEntry').addEventListener('click', () => _openManualEntryModal());
    document.getElementById('manualEntryForm').addEventListener('submit', _handleManualEntrySubmit);

    document.getElementById('btnImportExcelTrigger').addEventListener('click', () => document.getElementById('btnImportExcelFile').click());
    document.getElementById('btnImportExcelFile').addEventListener('change', _handleExcelFileSelected);
    document.getElementById('excelImportForm').addEventListener('submit', _handleExcelImportConfirm);

    document.getElementById('btnExportJson').addEventListener('click', _handleExportJson);
    document.getElementById('btnImportJsonTrigger').addEventListener('click', () => document.getElementById('btnImportJsonFile').click());
    document.getElementById('btnImportJsonFile').addEventListener('change', _handleImportJsonFile);
    document.getElementById('btnCopyEmailBanner').addEventListener('click', _handleCopyEmailBanner);

    document.getElementById('btnImportAi').addEventListener('click', _openOcrModal);
    const dropzone = document.getElementById('ocrDropzone');
    document.getElementById('btnOcrChooseFile').addEventListener('click', () => document.getElementById('ocrFileInput').click());
    dropzone.addEventListener('paste', _handleOcrPaste);
    dropzone.addEventListener('dragover', (e) => e.preventDefault());
    dropzone.addEventListener('drop', _handleOcrDrop);
    document.getElementById('ocrFileInput').addEventListener('change', (e) => _addOcrImageFiles([...e.target.files]));
    document.getElementById('ocrImageQueue').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-image-idx]');
      if (btn) _removeOcrImage(Number(btn.dataset.removeImageIdx));
    });
    document.getElementById('btnOcrAnalyze').addEventListener('click', _handleOcrAnalyze);
    document.getElementById('ocrReviewList').addEventListener('change', _handleOcrReviewChange);
    document.getElementById('ocrReviewList').addEventListener('input', _handleOcrReviewChange);
    document.getElementById('btnOcrSaveAll').addEventListener('click', _handleOcrSaveAll);

    document.getElementById('filterYearSelect').addEventListener('change', (e) => {
      StateStore.set('filterYear', Number(e.target.value));
      UiRenderer.renderTable(_snapshot());
    });
    document.getElementById('sectionListContainer').addEventListener('click', (e) => {
      const btn = e.target.closest('.section-nav-item');
      if (!btn) return;
      StateStore.set('filterSectionId', btn.dataset.sectionId || null);
      _renderAllViews();
    });

    document.getElementById('taskTableBody').addEventListener('click', (e) => {
      const monthBtn = e.target.closest('.month-cell-btn');
      if (monthBtn) {
        const employeeId = monthBtn.dataset.empId;
        const month = Number(monthBtn.dataset.month);
        const year = StateStore.get('filterYear');
        const existing = StateStore.get('taskEntries').find((t) => t.employeeId === employeeId && t.year === year && t.month === month);
        _openManualEntryModal({ employeeId, year, month, count: existing?.count });
        return;
      }
      const editBtn = e.target.closest('.edit-emp-btn');
      if (editBtn) {
        const employee = StateStore.get('employees').find((emp) => emp.id === editBtn.dataset.editEmpId);
        if (employee) _openEmployeeModal(employee);
      }
    });

    document.querySelectorAll('[data-modal-close]').forEach((btn) => {
      btn.addEventListener('click', () => UiRenderer.closeModal(btn.closest('.modal-overlay').id));
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach((m) => UiRenderer.closeModal(m.id));
    });
  }

  return { init };
})();
