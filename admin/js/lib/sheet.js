import { loadLib } from './loader.js';
import { localIso } from './stats.js';

/**
 * Spreadsheet in and out: Excel (.xlsx) via SheetJS, and CSV.
 *
 * A column is { header, value: (row) => any, width?, type? }. type 'number'
 * keeps a value numeric in Excel (so totals can be summed); everything else
 * is written as text. Text matters for phone numbers and FRNs - left to
 * Excel's guessing, 0772123456 becomes 772123456 and MH000012 stays fine but
 * a numeric receipt number loses its leading zeros.
 */

function cellValue(col, row) {
  const v = col.value(row);
  // Blank stays blank - a missing GPS reading must never export as 0,0.
  if (v === null || v === undefined || v === '') return '';
  if (col.type === 'number') return Number.isFinite(Number(v)) ? Number(v) : '';
  return String(v);
}

/**
 * CSV cells starting with = + - @ are executed as formulas when the file is
 * opened in Excel ("CSV injection") - a farmer name typed as =HYPERLINK(...)
 * would become a live link on a manager's machine. Such cells get a leading
 * apostrophe, which Excel hides. Numbers (incl. negative) and phone numbers
 * like +256... are left alone: they are data, not formulas.
 */
function csvSafe(value) {
  const s = String(value);
  if (/^[=@\t\r]/.test(s)) return "'" + s;
  if (/^[+-]/.test(s) && !/^[+-]?[\d\s().]+$/.test(s)) return "'" + s;
  return s;
}

function csvEscape(value) {
  const s = csvSafe(value);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function stamp() {
  return localIso(new Date());
}

/**
 * Downloads one or more sheets. `sheets` is [{ name, columns, rows }].
 * CSV can only hold one table, so format 'csv' writes the first sheet.
 */
export async function downloadSheets(sheets, baseName, format = 'xlsx') {
  if (format === 'csv') {
    const { columns, rows } = sheets[0];
    const lines = [columns.map((c) => csvEscape(c.header)).join(',')];
    for (const row of rows) lines.push(columns.map((c) => csvEscape(cellValue(c, row))).join(','));
    // BOM so Excel opens UTF-8 names (e.g. accented characters) correctly.
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), baseName + '.csv');
    return;
  }

  const XLSX = await loadLib('xlsx');
  const wb = XLSX.utils.book_new();
  for (const { name, columns, rows, notes } of sheets) {
    const aoa = notes
      ? notes.map((line) => [line])
      : [columns.map((c) => c.header), ...rows.map((row) => columns.map((c) => cellValue(c, row)))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (!notes) {
      ws['!cols'] = columns.map((c) => ({ wch: c.width || Math.max(10, c.header.length + 2) }));
      // Force text cells to stay text even if they look numeric.
      const range = XLSX.utils.decode_range(ws['!ref']);
      columns.forEach((c, ci) => {
        if (c.type === 'number') return;
        for (let r = 1; r <= range.e.r; r++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c: ci })];
          if (cell) { cell.t = 's'; cell.v = String(cell.v); }
        }
      });
      ws['!autofilter'] = { ref: ws['!ref'] };
    } else {
      ws['!cols'] = [{ wch: 110 }];
    }
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, baseName + '.xlsx', { compression: true });
}

// --------------------------------------------------------------- reading

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Reads the first sheet of an .xlsx/.xls/.csv file into
 * { headers: string[], rows: [{ __row, [header]: string }] }.
 *
 * Every cell comes back as a trimmed string; Excel dates become
 * 'YYYY-MM-DD'. `__row` is the spreadsheet row number (header = row 1), so
 * the import preview can say "row 14" and staff can find it in their file.
 */
export async function readSheet(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error('That file is larger than 10 MB. Split it into smaller files.');
  const XLSX = await loadLib('xlsx');
  const data = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
  const wb = isCsv
    ? XLSX.read(new TextDecoder('utf-8').decode(data), { type: 'string', raw: true })
    : XLSX.read(data, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('That file has no sheets.');

  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
  if (!aoa.length) throw new Error('That file is empty.');

  const headers = aoa[0].map((h) => String(h).trim());
  const rows = [];
  for (let i = 1; i < aoa.length; i++) {
    const cells = aoa[i];
    if (!cells.some((c) => String(c).trim() !== '')) continue;
    const row = { __row: i + 1 };
    headers.forEach((h, ci) => {
      if (!h) return;
      const c = cells[ci];
      // +12h: SheetJS may hand back a date as UTC or local midnight
      // depending on the file; nudging to midday makes either land on the
      // right calendar day in any timezone.
      row[h] = c instanceof Date ? localIso(new Date(c.getTime() + 12 * 36e5)) : String(c ?? '').trim();
    });
    rows.push(row);
  }
  return { headers, rows, sheetName: wb.SheetNames[0] };
}
