(() => {
  'use strict';

  const delay = 6000;
  const targets = '#feature-toggle,#feature-panel,#music-player,#scene-title,#scene-clock,#scene-focus,#zen-exit,#video-status';
  const controls = 'button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"]),[contenteditable]:not([contenteditable="false"])';
  const textTypes = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'time', 'datetime-local', 'month', 'week', 'range']);
  const originalInert = new Map();
  const pressedPointers = new Set();
  let timeout;
  let hidden = false;
  let changingInert = false;
  let inputMethod = 'pointer';

  function schedule() {
    clearTimeout(timeout);
    if (!document.hidden && !hidden) timeout = setTimeout(checkIdle, delay);
  }

  function wake() {
    if (hidden) {
      hidden = false;
      changingInert = true;
      document.body.classList.remove('ui-idle');
      originalInert.forEach((wasInert, element) => { element.inert = wasInert; });
      originalInert.clear();
      changingInert = false;
    }
    schedule();
  }

  function focusedInteraction() {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.getClientRects().length) return false;
    if (getComputedStyle(active).visibility !== 'visible') return false;
    if (active.isContentEditable || active instanceof HTMLTextAreaElement) return true;
    if (active instanceof HTMLInputElement && textTypes.has(active.type)) return true;
    return inputMethod === 'keyboard' && active.matches(controls);
  }

  function checkIdle() {
    if (document.hidden) return;
    if (pressedPointers.size || focusedInteraction()) {
      schedule();
      return;
    }
    hidden = true;
    changingInert = true;
    // Preserve pre-existing inert state, including controls restricted by the app.
    document.querySelectorAll(targets).forEach(element => {
      originalInert.set(element, element.inert);
      element.inert = true;
    });
    document.body.classList.add('ui-idle');
    changingInert = false;
  }

  function pointerActivity(event) {
    inputMethod = event.pointerType === 'touch' ? 'touch' : 'pointer';
    if (event.type === 'pointerdown') pressedPointers.add(event.pointerId);
    wake();
  }

  const passiveCapture = { passive: true, capture: true };
  document.addEventListener('pointermove', pointerActivity, passiveCapture);
  document.addEventListener('pointerdown', pointerActivity, passiveCapture);
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => {
    document.addEventListener(type, event => {
      pressedPointers.delete(event.pointerId);
      if (!hidden) schedule();
    }, passiveCapture);
  });
  document.addEventListener('wheel', () => {
    inputMethod = 'pointer';
    wake();
  }, passiveCapture);
  document.addEventListener('touchstart', () => {
    inputMethod = 'touch';
    wake();
  }, passiveCapture);
  document.addEventListener('keydown', () => {
    inputMethod = 'keyboard';
    wake();
  }, true);
  document.addEventListener('input', () => {
    if (!changingInert && !hidden) wake();
  }, true);
  // Inert may remove focus while hiding. Focus changes alone must not reveal the UI.
  ['focusin', 'focusout'].forEach(type => {
    document.addEventListener(type, () => {
      if (!changingInert && !hidden) schedule();
    }, true);
  });
  document.addEventListener('visibilitychange', () => {
    pressedPointers.clear();
    if (document.hidden) clearTimeout(timeout);
    else wake();
  });
  window.addEventListener('blur', () => {
    pressedPointers.clear();
  });
  window.addEventListener('focus', wake);
  window.addEventListener('pageshow', wake);

  window.studyIdle = { delay, wake, get isHidden() { return hidden; } };
  schedule();
})();
