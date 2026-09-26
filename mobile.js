// Keep the focused field above the iOS visual viewport's keyboard/accessory.
// Pinch zoom remains available; do not counteract a user's zoom or manual scroll.
export function inputViewport({ height, offsetTop = 0, layoutHeight, scale = 1, top, bottom, accessoryHeight = 60 }) {
  if (Math.abs(scale - 1) > 0.05) return { bottomInset: 0, scroll: 0 };
  const lower = offsetTop + height - accessoryHeight - 16;
  const upper = offsetTop + 16;
  return { bottomInset: Math.max(0, layoutHeight - offsetTop - height), scroll: bottom > lower ? bottom - lower : top < upper ? top - upper : 0 };
}
export function installMobileInputs() {
  const bar = document.getElementById('input-accessory');
  const small = matchMedia('(max-width: 540px)');
  const editable = el => el?.matches('input:not([type=checkbox]):not([type=file]):not([type=hidden]), textarea, select') && !el.disabled;
  let pending;
  function fields() { return [...(document.activeElement?.closest('form')?.querySelectorAll('input,textarea,select') ?? [])].filter(editable); }
  function sync(ensureVisible = false) {
    const active = document.activeElement;
    const viewport = window.visualViewport;
    const visible = small.matches && editable(active) && Math.abs((viewport?.scale ?? 1) - 1) < .05;
    bar.hidden = !visible;
    document.body.classList.toggle('editing-input', Boolean(visible));
    if (!visible) return;
    const rect = active.getBoundingClientRect();
    const result = inputViewport({ height: viewport?.height ?? innerHeight, offsetTop: viewport?.offsetTop ?? 0, layoutHeight: innerHeight, scale: viewport?.scale ?? 1, top: rect.top, bottom: rect.bottom, accessoryHeight: bar.getBoundingClientRect().height });
    bar.style.bottom = `${result.bottomInset}px`;
    const entries = fields(), index = entries.indexOf(active);
    bar.querySelector('[data-input-action=previous]').disabled = index <= 0;
    bar.querySelector('[data-input-action=next]').disabled = index < 0 || index >= entries.length - 1;
    if (ensureVisible && result.scroll) window.scrollBy({ top: result.scroll, behavior: 'instant' });
  }
  function schedule(ensureVisible = false) { cancelAnimationFrame(pending); pending = requestAnimationFrame(() => sync(ensureVisible)); }
  bar.addEventListener('pointerdown', e => e.preventDefault());
  bar.addEventListener('click', e => {
    const action = e.target.closest('[data-input-action]')?.dataset.inputAction;
    if (!action) return;
    const active = document.activeElement;
    if (action === 'done') {
      const form = active?.closest('form'); active?.blur(); sync();
      // Leave saving explicit; only reveal the form's normal submit button.
      requestAnimationFrame(() => form?.querySelector('button[type=submit]')?.scrollIntoView({ block: 'nearest' }));
    } else {
      const entries = fields(), index = entries.indexOf(active);
      entries[index + (action === 'next' ? 1 : -1)]?.focus({ preventScroll: true }); schedule(true);
    }
  });
  document.addEventListener('focusin', () => schedule(true));
  document.addEventListener('focusout', () => schedule());
  window.visualViewport?.addEventListener('resize', () => schedule(true));
  window.visualViewport?.addEventListener('scroll', () => schedule());
  window.addEventListener('resize', () => schedule(true));
  document.addEventListener('keydown', e => {
    if (small.matches && e.key === 'Enter' && editable(e.target) && e.target.tagName === 'INPUT') {
      e.preventDefault(); const entries = fields(), index = entries.indexOf(e.target);
      if (index < entries.length - 1) entries[index + 1].focus(); else e.target.blur();
    }
  });
  return function refresh() {
    document.querySelectorAll('form').forEach(form => {
      const entries = [...form.querySelectorAll('input,textarea,select')].filter(editable);
      entries.forEach((el, i) => { el.enterKeyHint = i === entries.length - 1 ? 'done' : 'next'; });
    });
    schedule();
  };
}
