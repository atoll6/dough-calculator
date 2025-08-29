// Dough Calculator – main app logic
// ------------------------------------------------------------
// This file computes ingredient amounts, handles the stepper UI,
// persists state, and manages two modals (Totals + Poolish warning).
// The refactor below keeps behavior identical while improving
// readability, reducing repetition, and adding targeted comments.
// ------------------------------------------------------------

// Small, focused helpers up top
const $ = (id) => document.getElementById(id);
const setInt = (id, v) => { const el = $(id); if (el) el.value = String(Math.round(Number(v || 0))); };
const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
const defaultDate = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };
const defaultTimeStr = () => { const d = new Date(); const h = (d.getHours() + 1) % 24; return `${pad2(h)}:00`; };
const parseLocalDateTime = (dateStr, timeStr) => (dateStr && timeStr ? new Date(`${dateStr}T${timeStr}`) : new Date());
const addHours = (date, hours) => new Date(date.getTime() + hours * 3600000);
const fmtDateTime = (d) => {
  const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${weekdays[d.getDay()]}, ${pad2(d.getDate())}-${months[d.getMonth()]}-${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

// Domain constants
const CONFIG = {
  poolishCandidates: [300, 200, 100], // preferred poolish flour/water sizes (g)
  idyPct: 0.015, // 1.5% instant dry yeast (of poolish flour)
  honeyPct: 0.015, // 1.5% honey (of poolish flour)
  yeastFactor: {
    instant_dry: 1,
    fresh: 3, // fresh yeast ~3x instant dry
  },
};

// Small DOM/value helpers
const getInt = (id, fallback = 0) => {
  const v = ((($(id)) || {}).value);
  const n = parseInt(v == null || v === '' ? String(fallback) : v);
  return Number.isNaN(n) ? fallback : n;
};
const getFloat = (id, fallback = 0) => {
  const v = ((($(id)) || {}).value);
  const n = parseFloat(v == null || v === '' ? String(fallback) : v);
  return Number.isNaN(n) ? fallback : n;
};
// Modal helpers
const openModalById = (id, focusSelector) => {
  const m = $(id); if (!m) return;
  m.hidden = false; m.classList.add('open');
  if (focusSelector) { const el = m.querySelector(focusSelector); if (el) el.focus(); }
  // Prevent background scroll when modal is open
  document.body.classList.add('modal-open');
};
const closeModalById = (id) => { const m = $(id); if (!m) return; m.classList.remove('open'); m.hidden = true; if (!document.querySelector('.modal.open')) document.body.classList.remove('modal-open'); };
// Poolish modal focus management
const setPoolishFocusReturn = () => {
  const focusEl = document.activeElement;
  if (focusEl && focusEl !== document.body) {
    try { window.__poolishFocusReturnEl = focusEl; } catch { /* noop */ }
  }
};
const restorePoolishFocus = () => {
  const el = (typeof window !== 'undefined') ? window.__poolishFocusReturnEl : null;
  if (el && document.body.contains(el)) {
    try { el.focus(); } catch { /* noop */ }
  }
  try { window.__poolishFocusReturnEl = null; } catch { /* noop */ }
};
// Poolish warning UI spans
const updatePoolishWarnSpans = (pf, pw) => {
  const wf = $('warnPoolishFlour'); const ww = $('warnPoolishWater');
  if (wf) wf.textContent = String(Math.round(pf));
  if (ww) ww.textContent = String(Math.round(pw));
};
const poolishExceedsTotals = (pf, pw, flourWeight, waterWeight) => isPoolishLocked() && (pf > flourWeight || pw > waterWeight);

// Poolish helpers
const choosePoolishCandidate = (flourWeight, waterWeight) => {
  for (let i = 0; i < CONFIG.poolishCandidates.length; i++) {
    const opt = CONFIG.poolishCandidates[i];
    if (opt <= flourWeight && opt <= waterWeight) return opt;
  }
  return 0;
};
const getYeastFactor = (yeastType) => CONFIG.yeastFactor[yeastType] ?? CONFIG.yeastFactor.instant_dry;

// Poolish lock (persisted in localStorage)
const poolishKey = (k) => `doughcalc_${k}`;
const isPoolishLocked = () => localStorage.getItem(poolishKey('poolishLocked')) === 'true';
const lockPoolish = (flour, water) => {
  localStorage.setItem(poolishKey('poolishLocked'), 'true');
  localStorage.setItem(poolishKey('lockedPoolishFlour'), String(parseInt(flour || 0)));
  localStorage.setItem(poolishKey('lockedPoolishWater'), String(parseInt(water || flour || 0)));
};
const unlockPoolish = () => {
  localStorage.removeItem(poolishKey('poolishLocked'));
  localStorage.removeItem(poolishKey('lockedPoolishFlour'));
  localStorage.removeItem(poolishKey('lockedPoolishWater'));
};
const getLockedPoolishFlour = () => parseInt(localStorage.getItem(poolishKey('lockedPoolishFlour')) || '0');
const getLockedPoolishWater = () => {
  const f = getLockedPoolishFlour();
  const w = parseInt(localStorage.getItem(poolishKey('lockedPoolishWater')) || String(f));
  return Number.isNaN(w) ? f : w;
};

// State persistence ----------------------------------------------------------
function saveFormState() {
  document.querySelectorAll('input').forEach((el) => {
    if (!el.id) return;
    if (el.type === 'checkbox') localStorage.setItem(poolishKey(el.id), String(el.checked));
    else localStorage.setItem(poolishKey(el.id), el.value);
  });
  document.querySelectorAll('select').forEach((el) => {
    if (!el.id) return; localStorage.setItem(poolishKey(el.id), el.value);
  });
}
function restoreFormState() {
  document.querySelectorAll('input').forEach((el) => {
    if (!el.id) return; const v = localStorage.getItem(poolishKey(el.id));
    if (v === null) return;
    if (el.type === 'checkbox') el.checked = (v === 'true'); else el.value = v;
  });
  document.querySelectorAll('select').forEach((el) => {
    if (!el.id) return; const v = localStorage.getItem(poolishKey(el.id)); if (v !== null) el.value = v;
  });
}

function setDateTimeDefaults() {
  const dateEl = $('inputDate');
  const timeEl = $('inputTime');
  if (dateEl && !dateEl.disabled && !dateEl.readOnly && !localStorage.getItem(poolishKey('inputDate'))) dateEl.value = defaultDate();
  if (timeEl && !timeEl.disabled && !timeEl.readOnly && !localStorage.getItem(poolishKey('inputTime'))) timeEl.value = defaultTimeStr();
  if (dateEl) dateEl.min = defaultDate();
}

// Core calculation -----------------------------------------------------------
function refresh_data() {
  // Read primary inputs
  const portionSize = getInt('inputPortionSize', 0);
  const portions = getInt('inputPortions', 0);
  const hydration = getInt('inputHydration', 0);
  const saltPct = getFloat('inputSalt', 0);

  const totalDoughWeight = Math.round(portions * portionSize);
  const h = hydration / 100;
  const s = saltPct / 100; // percent of flour

  // Initial estimate (no additives) for candidate selection
  let flourWeight = totalDoughWeight / (1 + h + s);
  let waterWeight = h * flourWeight;
  let saltWeight = s * flourWeight;

  const dateStr = ($('inputDate') || {}).value || '';
  const timeStr = ($('inputTime') || {}).value || '';
  const eatDateTime = parseLocalDateTime(dateStr, timeStr);

  // Step 2 timing
  const step2Start = addHours(eatDateTime, -2);
  const step2Earliest = addHours(eatDateTime, -3);
  const step2Label = $('labelStep2DateTime');
  if (step2Label) step2Label.innerHTML = `Recommended time to start: between <b>${fmtDateTime(step2Earliest)}</b> and <b>${fmtDateTime(step2Start)}</b>`;

  // Poolish start timing
  const latestStart = fmtDateTime(addHours(eatDateTime, -(17 + 3)));
  const earliestStart = fmtDateTime(addHours(eatDateTime, -(25 + 3)));
  const startLabel = $('labelDateTimeToStart');
  if (startLabel) startLabel.innerHTML = `Recommended time to start: Between <b>${earliestStart}</b> and <b>${latestStart}</b>`;

  // Batch warning
  const portionWarn = $('portion-warning');
  if (portionWarn) portionWarn.style.display = portions > 12 ? 'block' : 'none';

  // Poolish decision
  let poolishFlour = 0;
  let poolishWater = 0;
  const yeastType = (($('inputYeastType') || {}).value) || 'instant_dry';
  const idyPct = CONFIG.idyPct;
  const honeyPct = CONFIG.honeyPct;
  const yeastFactor = getYeastFactor(yeastType);

  if (isPoolishLocked()) {
    poolishFlour = getLockedPoolishFlour();
    poolishWater = getLockedPoolishWater();
    const addHoneyL = poolishFlour * honeyPct;
    const addYeastL = poolishFlour * idyPct * yeastFactor;
    flourWeight = (totalDoughWeight - (addHoneyL + addYeastL)) / (1 + h + s);
    waterWeight = h * flourWeight;
    saltWeight = s * flourWeight;
  } else {
    // Pick a candidate based on initial estimate, then correct after additives
    poolishFlour = choosePoolishCandidate(flourWeight, waterWeight);
    poolishWater = poolishFlour;
    let addHoney = poolishFlour * honeyPct;
    let addYeast = poolishFlour * idyPct * yeastFactor;
    flourWeight = (totalDoughWeight - (addHoney + addYeast)) / (1 + h + s);
    waterWeight = h * flourWeight;
    saltWeight = s * flourWeight;
    const corrected = choosePoolishCandidate(flourWeight, waterWeight);
    if (corrected !== poolishFlour) {
      poolishFlour = corrected;
      poolishWater = corrected;
      addHoney = poolishFlour * honeyPct;
      addYeast = poolishFlour * idyPct * yeastFactor;
      flourWeight = (totalDoughWeight - (addHoney + addYeast)) / (1 + h + s);
      waterWeight = h * flourWeight;
      saltWeight = s * flourWeight;
    }
  }

  const poolishHoney = poolishFlour * honeyPct;
  const poolishYeast = poolishFlour * idyPct * yeastFactor;

  // Remaining ingredients
  const remainingFlour = Math.max(0, Math.round(flourWeight - poolishFlour));
  const remainingWater = Math.max(0, Math.round(waterWeight - poolishWater));
  const remainingSalt = Math.round(saltWeight);

  // Write UI
  setInt('inputPoolishFlour', poolishFlour);
  setInt('inputPoolishWater', poolishWater);
  setInt('inputPoolishYeast', poolishYeast);
  setInt('inputPoolishHoney', poolishHoney);

  setInt('inputTotalDoughWeight', totalDoughWeight);
  setInt('inputFlour', flourWeight);
  setInt('inputWater', waterWeight);
  setInt('inputSaltAmount', saltWeight);

  setInt('inputRemainingFlour', remainingFlour);
  setInt('inputRemainingWater', remainingWater);
  setInt('inputRemainingSalt', remainingSalt);

  // Poolish modal warning
  const poolishTooBig = poolishExceedsTotals(poolishFlour, poolishWater, flourWeight, waterWeight);
  updatePoolishWarnSpans(poolishFlour, poolishWater);
  // Only open if user is on or past step 2 and condition is true
  const pages = Array.from(document.querySelectorAll('.page'));
  const onStep = pages.findIndex((p) => p.classList.contains('active')) + 1;
  if (poolishTooBig && onStep >= 2) {
    setPoolishFocusReturn();
    openModalById('poolishModal', '#unlockPoolishBtn');
  } else {
    closeModalById('poolishModal');
  }
}

// Input wiring & event handlers ---------------------------------------------
function wireInputListeners() {
  const sync = () => { refresh_data(); saveFormState(); try { if (typeof updateNavButtons === 'function') updateNavButtons(); } catch { /* noop */ } };

  const step1 = $('poolish-step1');
  const step2 = $('poolish-step2');
  const step3 = $('poolish-step3');
  const onPoolishStepChanged = () => {
    const allChecked = (!!step1 && step1.checked) && (!!step2 && step2.checked) && (!!step3 && step3.checked);
    if (allChecked) {
      const pf = parseInt(($('inputPoolishFlour') || {}).value || '0');
      const pw = parseInt(($('inputPoolishWater') || {}).value || String(pf));
      lockPoolish(pf, pw);
    } else {
      unlockPoolish();
    }
    refresh_data();
    saveFormState();
    try { if (typeof updateNavButtons === 'function') updateNavButtons(); } catch { /* noop */ }
  };
  if (step1) step1.addEventListener('change', onPoolishStepChanged);
  if (step2) step2.addEventListener('change', onPoolishStepChanged);
  if (step3) step3.addEventListener('change', onPoolishStepChanged);

  // Modal buttons
  const unlockBtn = $('unlockPoolishBtn');
  const backToPlanBtn = $('backToPlanBtn');
  const closePoolishModal = () => { closeModalById('poolishModal'); restorePoolishFocus(); };
  if (unlockBtn) unlockBtn.addEventListener('click', () => {
    unlockPoolish();
  if (step1) step1.checked = false;
  if (step2) step2.checked = false;
  if (step3) step3.checked = false;
    closePoolishModal();
    refresh_data();
    saveFormState();
    try { if (typeof updateNavButtons === 'function') updateNavButtons(); } catch { /* noop */ }
  });
  if (backToPlanBtn) backToPlanBtn.addEventListener('click', () => {
  // Navigate to plan page (step 1)
  if (typeof window.gotoStep === 'function') window.gotoStep(1); else { localStorage.setItem(poolishKey('currentStep'), '1'); location.hash = '#step-1'; }
    closePoolishModal();
  });

  document.querySelectorAll('input').forEach((el) => {
    // Poolish checkboxes have their own handler to manage the lock
    if (el.id === 'poolish-step1' || el.id === 'poolish-step2' || el.id === 'poolish-step3') return;
    el.addEventListener('input', sync);
    el.addEventListener('change', sync);
  });
  document.querySelectorAll('select').forEach((el) => el.addEventListener('change', sync));
}

function ensurePoolishLockConsistency() {
  const step1 = $('poolish-step1');
  const step2 = $('poolish-step2');
  const step3 = $('poolish-step3');
  const c1 = !!step1 && step1.checked;
  const c2 = !!step2 && step2.checked;
  const c3 = !!step3 && step3.checked;
  const all = c1 && c2 && c3;
  if (!isPoolishLocked() && all) {
    const pf = parseInt(($('inputPoolishFlour') || {}).value || '0');
    const pw = parseInt(($('inputPoolishWater') || {}).value || String(pf));
    lockPoolish(pf, pw);
  } else if (isPoolishLocked() && !all) {
    unlockPoolish();
  }
}

// Wizard (stepper) ----------------------------------------------------------
function setupWizard() {
  const pages = Array.from(document.querySelectorAll('.page'));
  const totalSteps = pages.length;
  const stepper = $('stepper');
  const prevBtn = $('prevStepBtn');
  const nextBtn = $('nextStepBtn');
  const navError = $('nav-error');

  const num = (id) => parseFloat((($(id)) || {}).value || '');
  const val = (id) => (($(id)) || {}).value || '';

  const showErrors = (containerId, errors) => {
    const el = $(containerId); if (!el) return;
    if (!errors || !errors.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.innerHTML = `<ul>${errors.map((e) => `<li>${e}</li>`).join('')}</ul>`; el.style.display = 'block';
  };

  // Validates the current step. When `show` is true, surfaces messages.
  function validateStep(step, show) {
    if (navError) navError.textContent = '';
    if (step === 1) {
      const errs = [];
      if (!val('inputDate')) errs.push('Please select a date.');
      if (!val('inputTime')) errs.push('Please select a time.');
      const portions = num('inputPortions'); if (!(portions >= 1)) errs.push('Portions must be at least 1.');
      const psize = num('inputPortionSize'); if (!(psize > 0)) errs.push('Portion size must be greater than 0.');
      const hyd = num('inputHydration'); if (!(hyd >= 50 && hyd <= 85)) errs.push('Hydration should be between 50% and 85%.');
      const salt = num('inputSalt'); if (!(salt >= 1 && salt <= 4)) errs.push('Salt should be between 1% and 4%.');
      if (show) showErrors('page-1-errors', errs);
      return errs.length === 0;
    }
    if (step === 2) {
      const cb1 = $('poolish-step1'); const cb2 = $('poolish-step2'); const cb3 = $('poolish-step3');
      const cbsOk = (!!cb1 && cb1.checked) && (!!cb2 && cb2.checked) && (!!cb3 && cb3.checked);
      if (!cbsOk && show && navError) navError.textContent = 'Please complete the poolish steps before continuing.';
      // Compute poolish-too-large condition
      const pf = getInt('inputPoolishFlour');
      const pw = getInt('inputPoolishWater', pf);
      const twf = getInt('inputFlour');
      const tww = getInt('inputWater');
      const tooBig = poolishExceedsTotals(pf, pw, twf, tww);
      if (show && tooBig) {
        updatePoolishWarnSpans(pf, pw);
        openModalById('poolishModal');
      }
      return cbsOk && !tooBig;
    }
    if (step === 3) {
      const fm = $('step2'); const ok = !!fm && fm.checked;
      if (!ok && show && navError) navError.textContent = 'Please confirm the final mix step before continuing.';
      return ok;
    }
    if (step === 4) {
      const boxes = Array.from(document.querySelectorAll("#page-4 input[type='checkbox']"));
      const allChecked = boxes.length > 0 && boxes.every((cb) => cb.checked);
      if (!allChecked && show && navError) navError.textContent = 'Please complete the final steps before finishing.';
      return allChecked;
    }
    return true;
  }

  function maxReachableStep() {
    if (!validateStep(1, false)) return 1;
    if (!validateStep(2, false)) return 2;
    if (!validateStep(3, false)) return 3;
    return 4;
  }

  const getStoredStep = () => {
    const fromHash = (location.hash.match(/#step-(\d+)/) || [])[1];
    if (fromHash) return Math.max(1, Math.min(totalSteps, parseInt(fromHash)));
    const saved = parseInt(localStorage.getItem(poolishKey('currentStep')) || '1');
    return Math.max(1, Math.min(totalSteps, saved));
  };
  const storeStep = (step) => { localStorage.setItem(poolishKey('currentStep'), String(step)); location.hash = `#step-${step}`; };
  const updateStepper = (step) => {
    if (!stepper) return;
    const items = Array.from(stepper.querySelectorAll('li'));
    const allowed = maxReachableStep();
    items.forEach((li, i) => {
      const idx = i + 1;
      li.classList.toggle('active', idx === step);
      li.classList.toggle('done', idx < step);
      li.classList.toggle('locked', idx > allowed);
      li.setAttribute('aria-current', idx === step ? 'step' : 'false');
    });
  };
  // Shows the given step and refreshes UI derived from step context
  const showStep = (step) => {
    pages.forEach((p, i) => { const idx = i + 1; if (idx === step) p.classList.add('active'); else p.classList.remove('active'); });
    updateStepper(step);
    if (prevBtn) prevBtn.disabled = step === 1;
    if (nextBtn) nextBtn.textContent = (step === totalSteps) ? 'Finish' : 'Next';
    // Recompute any UI that depends on current step (e.g., poolish modal gating)
    try { refresh_data(); } catch {}
    updateNavButtons();
  };
  const setStep = (step) => { const s = Math.max(1, Math.min(totalSteps, step)); storeStep(s); showStep(s); };
  // Expose navigation globally so other handlers (e.g., modal buttons) can jump steps
  window.gotoStep = setStep;
  const currentStep = () => { const active = pages.findIndex((p) => p.classList.contains('active')); return active >= 0 ? active + 1 : 1; };
  var updateNavButtons = () => { const s = currentStep(); const can = validateStep(s, false); if (nextBtn) { nextBtn.disabled = !can; nextBtn.classList.toggle('is-disabled', !can); } };

  if (prevBtn) prevBtn.addEventListener('click', () => setStep(currentStep() - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => {
    const s = currentStep();
    if (s < totalSteps) {
      if (!validateStep(s, true)) { updateNavButtons(); return; }
      setStep(s + 1);
    } else {
      if (!validateStep(s, true)) { updateNavButtons(); return; }
      resetAll();
    }
  });
  if (stepper) stepper.addEventListener('click', (e) => {
    const li = e.target.closest('li'); if (!li) return; const idx = parseInt(li.getAttribute('data-step')); if (Number.isNaN(idx)) return; if (idx <= maxReachableStep()) setStep(idx);
  });
  window.addEventListener('hashchange', () => setStep(getStoredStep()));

  // Initialize
  pages.forEach((p) => p.classList.remove('active'));
  showStep(Math.min(getStoredStep(), maxReachableStep()));
  updateNavButtons();

  // Expose for inputs sync
  window.updateNavButtons = updateNavButtons;
}

// Reset workflow -------------------------------------------------------------
function resetAll() {
  const setIf = (id, v) => { const el = $(id); if (el && !el.disabled && !el.readOnly) el.value = v; };
  setIf('inputPortions', '2');
  setIf('inputPortionSize', '280');
  setIf('inputHydration', '70');
  setIf('inputSalt', '3');
  document.querySelectorAll("input[type='checkbox']").forEach((cb) => (cb.checked = false));
  Object.keys(localStorage).forEach((k) => { if (k.startsWith('doughcalc_')) localStorage.removeItem(k); });
  setDateTimeDefaults();
  const yt = $('inputYeastType'); if (yt && !yt.disabled) yt.value = 'instant_dry';
  refresh_data();
  if (typeof window.gotoStep === 'function') window.gotoStep(1); else { localStorage.setItem(poolishKey('currentStep'), '1'); location.hash = '#step-1'; }
}

// Modal wiring ---------------------------------------------------------------
function setupModal() {
  const totalsModal = $('totalsModal');
  const openTotalsBtn = $('openTotalsBtn');
  const closeTotalsBtn = $('closeTotalsBtn');
  const closeTotalsBtn2 = $('closeTotalsBtn2');
  const poolishModal = $('poolishModal');
  let lastFocusedBeforeModal = null;
  // Focus trap within a given modal
  const trapFocus = (container) => {
    if (!container) return () => {};
    const selector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(container.querySelectorAll(selector)).filter((el) => {
      if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true' || el.tabIndex === -1) return false;
      const rects = el.getClientRects();
      return (el.offsetWidth + el.offsetHeight) > 0 || rects.length > 0;
    });
    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const els = focusables(); if (!els.length) return;
      const first = els[0]; const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    container.addEventListener('keydown', onKeyDown);
    return () => container.removeEventListener('keydown', onKeyDown);
  };
  let releaseTrap = () => {};
  const openModal = () => {
    if (!totalsModal) return;
    lastFocusedBeforeModal = document.activeElement;
    totalsModal.hidden = false; totalsModal.classList.add('open');
    (closeTotalsBtn || closeTotalsBtn2)?.focus();
    document.body.classList.add('modal-open');
    releaseTrap = trapFocus(totalsModal);
  };
  const closeModal = () => {
    if (!totalsModal) return;
    totalsModal.classList.remove('open'); totalsModal.hidden = true;
    if (lastFocusedBeforeModal && document.body.contains(lastFocusedBeforeModal)) lastFocusedBeforeModal.focus();
    lastFocusedBeforeModal = null;
    releaseTrap();
    if (!document.querySelector('.modal.open')) document.body.classList.remove('modal-open');
  };
  if (openTotalsBtn) openTotalsBtn.addEventListener('click', openModal);
  if (closeTotalsBtn) closeTotalsBtn.addEventListener('click', closeModal);
  if (closeTotalsBtn2) closeTotalsBtn2.addEventListener('click', closeModal);
  if (totalsModal) totalsModal.addEventListener('click', (e) => { if (e.target && e.target.getAttribute('data-close') === 'true') closeModal(); });
  document.addEventListener('keydown', (e) => { 
    if (e.key === 'Escape') {
      if (totalsModal && !totalsModal.hidden) closeModal();
      if (poolishModal && !poolishModal.hidden) closeModalById('poolishModal');
    }
  });
  if (poolishModal) poolishModal.addEventListener('click', (e) => { if (e.target && e.target.getAttribute('data-close') === 'true') closeModalById('poolishModal'); });
  // Trap focus inside poolish modal when opened via refresh_data/validation
  let poolishReleaseTrap = null;
  const poolishObserver = new MutationObserver(() => {
    if (!poolishModal) return;
    const isOpen = poolishModal.classList.contains('open') && !poolishModal.hidden;
    if (isOpen && !poolishReleaseTrap) {
      poolishReleaseTrap = trapFocus(poolishModal);
    } else if (!isOpen && poolishReleaseTrap) {
      poolishReleaseTrap();
      poolishReleaseTrap = null;
    }
  });
  if (poolishModal) poolishObserver.observe(poolishModal, { attributes: true, attributeFilter: ['class', 'hidden'] });
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  setDateTimeDefaults();
  restoreFormState();
  wireInputListeners();
  ensurePoolishLockConsistency();
  // Reset button
  const resetBtn = $('resetFormBtn'); if (resetBtn) resetBtn.addEventListener('click', () => resetAll());

  // Initialize wizard first so step context exists, then refresh and wire modals
  setupWizard();
  refresh_data();
  setupModal();
});
