// Shared helpers used by multiple modules.

export function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function fullName(employee) {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

export function uid() {
  return crypto.randomUUID();
}
