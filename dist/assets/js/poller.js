// Exponential backoff with jitter, pausing while the tab is hidden.
export function nextDelay(base, max, failures, rand = Math.random) {
  if (failures <= 0) return base;
  const cap = Math.min(max, base * 2 ** failures);
  return Math.round(cap * (0.5 + 0.5 * rand()));
}

export function createPoller({
  task, base, max = 30000, onOk = () => {}, onFail = () => {},
  timers = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (h) => clearTimeout(h) }, rand = Math.random,
  isHidden = () => document.hidden,
}) {
  let failures = 0;
  let handle = null;
  let running = false;
  let inflight = false;

  const clearTimer = () => {
    if (handle !== null) timers.clearTimeout(handle);
    handle = null;
  };
  const schedule = (ms) => {
    clearTimer();
    if (running && !isHidden()) handle = timers.setTimeout(tick, ms);
  };

  async function tick() {
    handle = null;
    if (!running || isHidden() || inflight) return;
    inflight = true;
    try {
      const value = await task();
      failures = 0;
      onOk(value);
    } catch (err) {
      failures += 1;
      onFail(err, failures);
    } finally {
      inflight = false;
    }
    schedule(nextDelay(base, max, failures, rand));
  }

  return {
    start() { running = true; return tick(); },
    stop() { running = false; clearTimer(); },
    // call from visibilitychange
    visibility() {
      if (!running) return;
      if (isHidden()) clearTimer();
      else if (handle === null && !inflight) tick();
    },
    get failures() { return failures; },
    get pending() { return handle !== null; },
  };
}
