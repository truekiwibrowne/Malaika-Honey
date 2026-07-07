import { el, mount } from '../lib/ui.js';
import { navigate } from '../router.js';
import { getFarmerByFrnFromCache, savePurchase, searchFarmers } from '../lib/db.js';
import { formatUgx } from '../lib/constants.js';
import { getProducts, getGrades, getPaymentMethods } from '../lib/referenceData.js';
import { iconEl } from '../lib/icons.js';

function resetSaveBtnLabel(btn) {
  btn.replaceChildren(iconEl('check'), document.createTextNode(' Save'));
}

function choiceGroup(options, onSelect) {
  const group = el('div', { class: 'choice-group' });
  options.forEach((opt) => {
    const chip = el(
      'button',
      {
        type: 'button',
        class: 'choice-chip',
        onClick: () => {
          group.querySelectorAll('.choice-chip').forEach((c) => c.classList.remove('selected'));
          chip.classList.add('selected');
          onSelect(opt.id);
        },
      },
      opt.label
    );
    group.appendChild(chip);
  });
  return group;
}

/**
 * The actual purchase form, shared by both entry points: the confirmed-
 * farmer route (/buy/:frn, reached from a Farmer Profile) and the
 * standalone entry point (/buy, Section below) which may not have a
 * confirmed farmer yet (offline FRN entry). `farmerName` is null when the
 * FRN hasn't been verified against this device's local data - the
 * purchase still saves (see db.js savePurchase), just flagged for
 * reconciliation later.
 */
async function renderPurchaseForm(root, { frn, farmerName }) {
  mount(root, el('p', { class: 'hint' }, 'Loading form…'));

  const [products, grades, paymentMethods] = await Promise.all([getProducts(), getGrades(), getPaymentMethods()]);

  const state = { product: null, grade: null, paymentMethod: null };

  const errorBox = el('div', { class: 'field-error', hidden: true });

  const weightInput = el('input', { type: 'number', step: '0.1', min: '0', placeholder: 'e.g. 24.5' });
  const priceInput = el('input', { type: 'number', step: '1', min: '0', placeholder: 'e.g. 8500' });
  const receiptInput = el('input', { type: 'text', placeholder: 'Receipt book no.' });

  const totalAmount = el('div', { class: 'amount' }, formatUgx(0));

  function recalcTotal() {
    const w = parseFloat(weightInput.value) || 0;
    const p = parseFloat(priceInput.value) || 0;
    totalAmount.textContent = formatUgx(w * p);
  }
  weightInput.addEventListener('input', recalcTotal);
  priceInput.addEventListener('input', recalcTotal);

  const productGroup = choiceGroup(products, (id) => (state.product = id));
  const gradeGroup = choiceGroup(grades, (id) => (state.grade = id));
  const paymentGroup = choiceGroup(paymentMethods, (id) => (state.paymentMethod = id));

  const saveBtn = el('button', { type: 'submit', class: 'btn btn-green' });
  resetSaveBtnLabel(saveBtn);

  const form = el(
    'form',
    {
      onSubmit: async (e) => {
        e.preventDefault();
        const weightKg = parseFloat(weightInput.value);
        const pricePerKgUgx = parseFloat(priceInput.value);

        if (!state.product || !weightKg || weightKg <= 0 || !state.grade || !pricePerKgUgx || !state.paymentMethod) {
          errorBox.textContent = 'Please select a product, grade, payment method, and enter weight and price.';
          errorBox.hidden = false;
          return;
        }
        errorBox.hidden = true;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';

        try {
          const totalUgx = weightKg * pricePerKgUgx;
          const { purchaseId } = await savePurchase({
            frn,
            product: state.product,
            weightKg,
            grade: state.grade,
            pricePerKgUgx,
            totalUgx,
            paymentMethod: state.paymentMethod,
            receiptNo: receiptInput.value.trim(),
          });
          navigate('#/buy/' + frn + '/success/' + purchaseId);
        } catch (err) {
          console.error(err);
          errorBox.textContent = 'Could not save this purchase. ' + (err.message || 'Please try again.');
          errorBox.hidden = false;
          saveBtn.disabled = false;
          resetSaveBtnLabel(saveBtn);
        }
      },
    },
    [
      el('div', { class: 'field' }, [el('label', {}, 'Product'), productGroup]),
      el('div', { class: 'field' }, [el('label', {}, 'Weight (kg)'), weightInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Grade'), gradeGroup]),
      el('div', { class: 'field' }, [el('label', {}, 'Price per kg (UGX)'), priceInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Payment'), paymentGroup]),
      el('div', { class: 'field' }, [el('label', {}, 'Receipt No.'), receiptInput]),
      el('div', { class: 'total-display' }, [el('div', { class: 'label' }, 'Total'), totalAmount]),
      errorBox,
      saveBtn,
    ]
  );

  mount(
    root,
    el('h1', {}, 'Buy Produce'),
    farmerName
      ? el('p', { class: 'welcome' }, farmerName + ' · ' + frn)
      : el('p', { class: 'welcome', style: 'color:var(--color-yellow-dark)' }, 'FRN ' + frn + ' · not found on this device — will be checked once online'),
    form
  );
}

/**
 * Reached either from a Farmer Profile (farmer already confirmed) or from
 * the standalone entry point below, once an FRN has been chosen/typed.
 * Either way this is the single place that actually shows the purchase
 * form - if the farmer can't be confirmed on this device (typo, or
 * genuinely offline and never seen before), the form still opens, saving
 * with `frnUnverified` for later reconciliation rather than blocking (see
 * db.js savePurchase).
 */
export async function renderBuyProduce(root, { frn }) {
  mount(root, el('p', { class: 'hint' }, 'Loading farmer…'));

  const farmer = await getFarmerByFrnFromCache(frn.trim().toUpperCase());
  await renderPurchaseForm(root, {
    frn: frn.trim().toUpperCase(),
    farmerName: farmer ? farmer.fullName : null,
  });
}

/**
 * Standalone Buy Produce entry point (Home button) - offline-capable:
 * staff enter an FRN, get a live-search picker while online, or can just
 * type it directly and continue when offline (no list will populate, but
 * the purchase form still opens - see db.js savePurchase for how an
 * unconfirmed FRN is handled).
 */
let debounceTimer = null;

export function renderBuyProduceEntry(root) {
  const resultsBox = el('div', { class: 'field', style: 'gap:10px' });
  const continueBtn = el('button', { type: 'button', class: 'btn btn-outline', hidden: true }, 'Continue with this FRN');

  const frnInput = el('input', {
    type: 'text',
    placeholder: 'Farmer Registration Number or name',
    autofocus: true,
    autocapitalize: 'off',
    onInput: (e) => {
      clearTimeout(debounceTimer);
      const value = e.target.value;
      continueBtn.hidden = value.trim().length < 4;
      debounceTimer = setTimeout(() => runSearch(value), 300);
    },
  });

  async function runSearch(value) {
    if (!value || value.trim().length < 2) {
      resultsBox.replaceChildren();
      return;
    }
    resultsBox.replaceChildren(el('p', { class: 'hint' }, 'Searching…'));
    try {
      const farmers = await searchFarmers(value);
      if (!farmers.length) {
        resultsBox.replaceChildren(
          el('div', { class: 'empty-state' }, 'No match on this device yet. If you are offline, you can still continue with the FRN above.')
        );
        return;
      }
      resultsBox.replaceChildren(
        ...farmers.map((f) =>
          el(
            'button',
            {
              type: 'button',
              class: 'result-item',
              onClick: () => navigate('#/buy/' + f.frn),
            },
            [el('span', { class: 'name' }, f.fullName), el('span', { class: 'sub' }, f.village + ' · ' + f.frn)]
          )
        )
      );
    } catch (err) {
      console.error(err);
      resultsBox.replaceChildren(
        el('div', { class: 'empty-state' }, 'Search failed. If you are offline, you can still continue with the FRN above.')
      );
    }
  }

  continueBtn.addEventListener('click', () => {
    const frn = frnInput.value.trim().toUpperCase();
    if (!frn) return;
    navigate('#/buy/' + frn);
  });

  mount(
    root,
    el('div', { class: 'centered-screen' }, [
      el('h1', {}, 'Buy Produce'),
      el('p', { class: 'welcome' }, 'Enter the farmer’s FRN, name or phone.'),
      el('div', { class: 'field' }, [frnInput]),
      continueBtn,
      resultsBox,
    ])
  );

  frnInput.focus();
}

export function renderBuyProduceSuccess(root, { frn }) {
  mount(
    root,
    el('div', { class: 'centered-screen' }, [
      el('div', { class: 'confirm-icon' }, [iconEl('check')]),
      el('h1', { style: 'text-align:center' }, 'Purchase Saved'),
      el('p', { class: 'welcome', style: 'text-align:center' }, 'What would you like to do next?'),
      el('hr', { class: 'hr' }),
      el('a', { href: '#/buy/' + frn, class: 'btn btn-yellow' }, [iconEl('honeyJar'), 'Record another purchase']),
      el('a', { href: '#/buy', class: 'btn btn-blue' }, [iconEl('person'), 'Find another farmer']),
      el('a', { href: '#/home', class: 'btn btn-secondary' }, [iconEl('home'), 'Return Home']),
    ])
  );
}
