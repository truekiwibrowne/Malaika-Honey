import { el, mount } from '../lib/ui.js';
import { navigate } from '../router.js';
import { getFarmerByFrn, savePurchase } from '../lib/db.js';
import { PRODUCTS, GRADES, PAYMENT_METHODS, formatUgx } from '../lib/constants.js';

function choiceGroup(options, getLabel, getId, onSelect) {
  const group = el('div', { class: 'choice-group' });
  options.forEach((opt) => {
    const id = getId(opt);
    const label = getLabel(opt);
    const chip = el(
      'button',
      {
        type: 'button',
        class: 'choice-chip',
        onClick: () => {
          group.querySelectorAll('.choice-chip').forEach((c) => c.classList.remove('selected'));
          chip.classList.add('selected');
          onSelect(id);
        },
      },
      label
    );
    group.appendChild(chip);
  });
  return group;
}

export async function renderBuyProduce(root, { frn }) {
  mount(root, el('p', { class: 'hint' }, 'Loading farmer…'));

  const farmer = await getFarmerByFrn(frn);
  if (!farmer) {
    mount(
      root,
      el('a', { href: '#/find-farmer', class: 'back-btn' }, '← Back'),
      el('div', { class: 'empty-state' }, 'Farmer ' + frn + ' was not found on this device.')
    );
    return;
  }

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

  const productGroup = choiceGroup(PRODUCTS, (p) => p.label, (p) => p.id, (id) => (state.product = id));
  const gradeGroup = choiceGroup(GRADES, (g) => g, (g) => g, (id) => (state.grade = id));
  const paymentGroup = choiceGroup(
    PAYMENT_METHODS,
    (p) => p.label,
    (p) => p.id,
    (id) => (state.paymentMethod = id)
  );

  const saveBtn = el('button', { type: 'submit', class: 'btn btn-green' }, '✔ Save');

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
          const purchaseId = await savePurchase({
            frn: farmer.frn,
            product: state.product,
            weightKg,
            grade: state.grade,
            pricePerKgUgx,
            totalUgx,
            paymentMethod: state.paymentMethod,
            receiptNo: receiptInput.value.trim(),
          });
          navigate('#/buy/' + farmer.frn + '/success/' + purchaseId);
        } catch (err) {
          console.error(err);
          errorBox.textContent = 'Could not save this purchase. ' + (err.message || 'Please try again.');
          errorBox.hidden = false;
          saveBtn.disabled = false;
          saveBtn.textContent = '✔ Save';
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
    el('a', { href: '#/farmer/' + farmer.frn, class: 'back-btn' }, '← Back'),
    el('h1', {}, 'Buy Produce'),
    el('p', { class: 'welcome' }, farmer.fullName + ' · ' + farmer.frn),
    form
  );
}

export function renderBuyProduceSuccess(root, { frn }) {
  mount(
    root,
    el('div', { class: 'confirm-icon' }, '✔'),
    el('h1', { style: 'text-align:center' }, 'Purchase Saved'),
    el('p', { class: 'welcome', style: 'text-align:center' }, 'What would you like to do next?'),
    el('hr', { class: 'hr' }),
    el('a', { href: '#/buy/' + frn, class: 'btn btn-yellow' }, [el('span', { class: 'icon' }, '🍯'), 'Record another purchase']),
    el('a', { href: '#/find-farmer?intent=buy', class: 'btn btn-blue' }, [el('span', { class: 'icon' }, '👤'), 'Find another farmer']),
    el('a', { href: '#/home', class: 'btn btn-secondary' }, [el('span', { class: 'icon' }, '🏠'), 'Return Home'])
  );
}
