import { el, mount } from '../lib/ui.js';
import { navigate } from '../router.js';
import { iconEl } from '../lib/icons.js';
import { getCurrentUser, markTutorialSeen } from '../lib/auth.js';

const SLIDES = [
  {
    icon: 'home',
    title: 'Three things you can do',
    body: 'From Home you can register a New Farmer, look up an Existing Farmer, or go straight to Buy Produce to record a purchase.',
  },
  {
    icon: 'honeyJar',
    title: 'Buy Produce works offline',
    body: 'No internet? You can still type in a farmer’s FRN and record the purchase. It saves on your phone and uploads automatically once you’re back online.',
  },
  {
    icon: 'search',
    title: 'Some things need internet',
    body: 'Searching for a farmer or viewing their purchase history only works while online, since it looks up records not yet saved on this phone.',
  },
  {
    icon: 'check',
    title: 'Watch the sync badge',
    body: 'The badge at the top of every screen shows Synced, Not Synced, or Offline — so you always know whether your work has reached the server yet.',
  },
];

const SWIPE_THRESHOLD = 40;

/**
 * Renders as a full-viewport modal (position: fixed, its own backdrop)
 * rather than into the normal screen flow - this deliberately covers the
 * header entirely (no back/home/sync-badge visible during the tutorial),
 * since it's a one-time first-run overlay, not a regular screen.
 */
export function renderTutorial(root) {
  let index = 0;

  const iconBox = el('div', { class: 'confirm-icon' });
  const titleEl = el('h1', { style: 'text-align:center' });
  const bodyEl = el('p', { class: 'welcome', style: 'text-align:center' });
  const dots = el('div', { class: 'tutorial-dots' });
  const nextBtn = el('button', { type: 'button', class: 'btn btn-maroon' });

  function goTo(newIndex) {
    index = Math.max(0, Math.min(SLIDES.length - 1, newIndex));
    renderSlide();
  }

  function renderSlide() {
    const slide = SLIDES[index];
    iconBox.replaceChildren(iconEl(slide.icon));
    titleEl.textContent = slide.title;
    bodyEl.textContent = slide.body;
    dots.replaceChildren(
      ...SLIDES.map((_, i) =>
        el('button', {
          type: 'button',
          class: 'tutorial-dot' + (i === index ? ' active' : ''),
          'aria-label': 'Go to slide ' + (i + 1),
          onClick: () => goTo(i),
        })
      )
    );
    nextBtn.textContent = index === SLIDES.length - 1 ? 'Get Started' : 'Next';
  }

  function finish() {
    const user = getCurrentUser();
    if (user) markTutorialSeen(user.uid);
    navigate('#/home');
  }

  nextBtn.addEventListener('click', () => {
    if (index < SLIDES.length - 1) {
      goTo(index + 1);
    } else {
      finish();
    }
  });

  const modal = el('div', { class: 'tutorial-modal' }, [
    iconBox,
    titleEl,
    bodyEl,
    dots,
    el('hr', { class: 'hr' }),
    nextBtn,
    el('button', { type: 'button', class: 'btn btn-secondary', onClick: finish }, 'Skip'),
  ]);

  let touchStartX = null;
  modal.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  });
  modal.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;
    goTo(deltaX < 0 ? index + 1 : index - 1);
  });

  renderSlide();

  mount(root, el('div', { class: 'tutorial-overlay' }, [modal]));
}
