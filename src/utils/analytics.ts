// Tacet Forge: analytics are disabled. The fork never loads the Umami script (the
// injector and the vercel.json proxy rewrites were removed), so `window.umami` is
// never defined and these calls are no-ops. They stay so call sites don't change.

export function trackEvent(eventName: string, data?: Record<string, unknown>) {
  window.umami?.track(eventName, data);
}

/** Kept for API compatibility; with no analytics script it sends nothing. */
export function trackEventWhenReady(eventName: string, data?: Record<string, unknown>) {
  window.umami?.track(eventName, data);
}
