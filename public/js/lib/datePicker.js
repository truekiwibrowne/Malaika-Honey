import { el } from './ui.js';
import { iconEl } from './icons.js';

/**
 * Replaces the native `<input type="date">` for schema-driven date fields
 * (currently Date of Birth - see referenceData.js newFarmerFields).
 *
 * The native control was the problem this solves: on Android it renders as
 * scrolling wheels, so reaching a birth year 40+ years back means spinning
 * through hundreds of months one at a time. This control instead lets
 * staff either **type** the date straight in (DD/MM/YYYY, numeric keypad)
 * or pick it in three taps - year, then month, then day - with years shown
 * as a paged grid rather than a wheel.
 *
 * Values are stored and returned as ISO `YYYY-MM-DD`, exactly what the
 * native input produced, so nothing downstream (db.js createFarmer,
 * Farmer Profile/Card) needed to change.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// Monday-first, matching how calendars are normally read in Uganda.
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const YEARS_PER_PAGE = 24;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toIso(year, month, day) {
  return year + '-' + pad2(month) + '-' + pad2(day);
}

/** ISO `YYYY-MM-DD` -> `{ year, month, day }`, or null if not a real date. */
export function parseIso(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** ISO `YYYY-MM-DD` -> `DD/MM/YYYY` for display, or '' if unparseable. */
export function isoToDisplay(iso) {
  const parts = parseIso(iso);
  return parts ? pad2(parts.day) + '/' + pad2(parts.month) + '/' + parts.year : '';
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/** Day-of-week of the 1st, as a Monday-first column index (0-6). */
function firstWeekdayIndex(year, month) {
  return (new Date(year, month - 1, 1).getDay() + 6) % 7;
}

function formatDigits(digits) {
  const d = digits.slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return d.slice(0, 2) + '/' + d.slice(2);
  return d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
}

/**
 * Typed `DD/MM/YYYY` -> ISO, or null. Deliberately strict about the date
 * actually existing (rejects 31/02/1990) rather than letting JS's Date
 * silently roll it over to 03/03/1990, which would save a date the staff
 * member never typed.
 */
function parseTyped(text) {
  const digits = String(text || '').replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return toIso(year, month, day);
}

/**
 * Full-screen year/month/day picker. Resolves with an ISO date string, or
 * null if cancelled. Modeled on the same overlay pattern as the QR scanner
 * (see qrScanner.js) so the two full-screen interactions feel alike.
 */
function openDatePicker({ value, minYear, maxYear, maxIso }) {
  return new Promise((resolve) => {
    const selected = parseIso(value);
    let year = selected ? selected.year : null;
    let month = selected ? selected.month : null;
    // Land the year grid on the page holding the current value, or else on
    // the most recent page - staff page back from today rather than
    // scrolling a wheel.
    let pageEndYear = selected ? selected.year : maxYear;

    const body = el('div', { class: 'date-picker-body' });
    const crumb = el('div', { class: 'date-picker-crumb' });
    const modal = el('div', { class: 'date-picker-modal' }, [
      el('div', { class: 'date-picker-header' }, [el('h2', {}, 'Select date'), crumb]),
      body,
      el('button', { type: 'button', class: 'btn btn-secondary', onClick: () => finish(null) }, 'Cancel'),
    ]);
    const overlay = el('div', { class: 'date-picker-overlay', onClick: (e) => { if (e.target === overlay) finish(null); } }, [modal]);

    function finish(result) {
      overlay.remove();
      resolve(result);
    }

    function crumbButton(label, onClick) {
      return el('button', { type: 'button', class: 'date-picker-crumb-btn', onClick }, label);
    }

    function renderCrumb(step) {
      const parts = [];
      if (step !== 'year') parts.push(crumbButton(String(year), () => renderYears()));
      if (step === 'day') parts.push(crumbButton(MONTHS[month - 1], () => renderMonths()));
      crumb.replaceChildren(...parts);
    }

    function renderYears() {
      renderCrumb('year');
      const end = Math.min(pageEndYear, maxYear);
      const start = Math.max(end - YEARS_PER_PAGE + 1, minYear);
      const grid = el('div', { class: 'date-picker-grid date-picker-grid-year' });
      for (let y = end; y >= start; y--) {
        grid.appendChild(
          el('button', { type: 'button', class: 'date-picker-cell' + (y === year ? ' selected' : ''), onClick: () => { year = y; renderMonths(); } }, String(y))
        );
      }
      body.replaceChildren(
        el('div', { class: 'date-picker-pager' }, [
          el('button', {
            type: 'button',
            class: 'date-picker-page-btn',
            'aria-label': 'Earlier years',
            disabled: start <= minYear,
            onClick: () => { pageEndYear = start - 1; renderYears(); },
          }, [iconEl('back')]),
          el('span', {}, start + ' – ' + end),
          el('button', {
            type: 'button',
            class: 'date-picker-page-btn',
            'aria-label': 'Later years',
            disabled: end >= maxYear,
            onClick: () => { pageEndYear = Math.min(end + YEARS_PER_PAGE, maxYear); renderYears(); },
          }, [iconEl('forward')]),
        ]),
        grid
      );
    }

    function renderMonths() {
      renderCrumb('month');
      const grid = el('div', { class: 'date-picker-grid date-picker-grid-month' });
      MONTHS.forEach((name, index) => {
        const monthNumber = index + 1;
        const beyondMax = maxIso && toIso(year, monthNumber, 1) > maxIso;
        grid.appendChild(
          el('button', {
            type: 'button',
            class: 'date-picker-cell' + (monthNumber === month ? ' selected' : ''),
            disabled: beyondMax,
            onClick: () => { month = monthNumber; renderDays(); },
          }, name.slice(0, 3))
        );
      });
      body.replaceChildren(grid);
    }

    function renderDays() {
      renderCrumb('day');
      const grid = el('div', { class: 'date-picker-grid date-picker-grid-day' });
      WEEKDAYS.forEach((label) => grid.appendChild(el('div', { class: 'date-picker-weekday' }, label)));
      for (let blank = 0; blank < firstWeekdayIndex(year, month); blank++) {
        grid.appendChild(el('div', {}));
      }
      for (let day = 1; day <= daysInMonth(year, month); day++) {
        const iso = toIso(year, month, day);
        grid.appendChild(
          el('button', {
            type: 'button',
            class: 'date-picker-cell' + (selected && iso === value ? ' selected' : ''),
            disabled: maxIso && iso > maxIso,
            onClick: () => finish(iso),
          }, String(day))
        );
      }
      body.replaceChildren(grid);
    }

    if (year && month) renderDays();
    else renderYears();

    document.body.appendChild(overlay);
  });
}

/**
 * Builds the field control. Returns the wrapper node plus getValue/setValue
 * so callers (farmerForm.js) can read the ISO value at submit time and
 * prefill it when editing an existing farmer.
 *
 * `onChange` fires with the ISO value (or '' when cleared/invalid) so a
 * caller can keep its own state object in sync as the user types.
 */
export function dateField({ value = '', onChange = () => {}, maxToday = true } = {}) {
  const today = new Date();
  const maxYear = today.getFullYear();
  const minYear = maxYear - 120;
  const maxIso = maxToday ? toIso(maxYear, today.getMonth() + 1, today.getDate()) : null;

  let iso = parseIso(value) ? value : '';

  const input = el('input', {
    type: 'text',
    inputmode: 'numeric',
    autocomplete: 'off',
    placeholder: 'DD/MM/YYYY',
    maxlength: 10,
    value: isoToDisplay(iso),
  });
  const error = el('div', { class: 'date-field-error', hidden: true });

  function setIso(next, { updateInput = true } = {}) {
    iso = next || '';
    if (updateInput) input.value = isoToDisplay(iso);
    onChange(iso);
  }

  function validateTyped() {
    const text = input.value.trim();
    if (!text) {
      error.hidden = true;
      setIso('', { updateInput: false });
      return;
    }
    const parsed = parseTyped(text);
    if (!parsed) {
      error.textContent = 'Enter the date as DD/MM/YYYY.';
      error.hidden = false;
      setIso('', { updateInput: false });
      return;
    }
    if (maxIso && parsed > maxIso) {
      error.textContent = 'That date is in the future.';
      error.hidden = false;
      setIso('', { updateInput: false });
      return;
    }
    error.hidden = true;
    setIso(parsed, { updateInput: false });
  }

  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '');
    input.value = formatDigits(digits);
    // Only complain once they've typed a full date - warning mid-entry
    // ("15/0...") would flag every partially-typed date as an error.
    if (digits.length === 8 || digits.length === 0) validateTyped();
    else error.hidden = true;
  });
  input.addEventListener('blur', validateTyped);

  const pickBtn = el(
    'button',
    {
      type: 'button',
      class: 'date-field-btn',
      'aria-label': 'Open calendar',
      onClick: async () => {
        const picked = await openDatePicker({ value: iso, minYear, maxYear, maxIso });
        if (picked) {
          error.hidden = true;
          setIso(picked);
        }
      },
    },
    [iconEl('calendar')]
  );

  const node = el('div', { class: 'date-field' }, [el('div', { class: 'date-field-row' }, [input, pickBtn]), error]);

  return {
    node,
    getValue: () => iso,
    setValue: (next) => {
      error.hidden = true;
      setIso(parseIso(next) ? next : '');
    },
  };
}
