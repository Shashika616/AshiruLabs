/**
 * The intro gate. An inline script in <head> marks every load html.intro-active before
 * first paint, so the site never flashes underneath the keyboard. Everything that should
 * wait for the site to open listens here.
 */
const DONE = "al:intro-done";
const SCROLL = "al:scroll-ready";
const SPLASH = "al:splash-done";
let splashDone = false;

/** The splash has handed over to the keyboard: heavy loading may start without hurting it. */
export function finishSplash() {
  splashDone = true;
  window.dispatchEvent(new Event(SPLASH));
}

/** Runs `fn` once the splash is over: now, if there is no intro or it already ended. */
export function whenSplashDone(fn: () => void) {
  if (splashDone || !introActive()) {
    fn();
    return () => {};
  }
  const once = () => fn();
  window.addEventListener(SPLASH, once, { once: true });
  return () => window.removeEventListener(SPLASH, once);
}

export function introActive() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("intro-active");
}

/** The site opens: the hero and camera start moving. Scrolling stays locked until releaseScroll. */
export function finishIntro() {
  const html = document.documentElement;
  html.classList.remove("intro-active");
  html.classList.add("intro-seen", "intro-closing");
  window.scrollTo(0, 0);
  window.dispatchEvent(new Event(DONE));
}

/** The intro has gone and the last of its scroll momentum has died: the page may scroll. */
export function releaseScroll() {
  const html = document.documentElement;
  window.scrollTo(0, 0);
  html.classList.remove("intro-closing");
  window.dispatchEvent(new Event(SCROLL));
}

/** Runs `fn` once the page may scroll: now, if there was no intro. */
export function whenScrollReady(fn: () => void) {
  const html = document.documentElement;
  if (!html.classList.contains("intro-active") && !html.classList.contains("intro-closing")) {
    fn();
    return () => {};
  }
  const once = () => fn();
  window.addEventListener(SCROLL, once, { once: true });
  return () => window.removeEventListener(SCROLL, once);
}

/** Runs `fn` once the site is open: now, if there is no intro this visit. */
export function whenSiteOpen(fn: () => void) {
  if (!introActive()) {
    fn();
    return () => {};
  }
  const once = () => fn();
  window.addEventListener(DONE, once, { once: true });
  return () => window.removeEventListener(DONE, once);
}
