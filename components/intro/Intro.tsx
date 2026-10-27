"use client";

import { useEffect, useRef } from "react";
import { finishIntro, finishSplash, introActive, releaseScroll } from "@/lib/intro";

/**
 * The landing before the site: a Magic Keyboard in the site's anime-glass style, and a real
 * one. Type on your own keyboard or tap the keys on screen: anything can be typed and
 * cleared, and the site opens only when the display reads exactly AshiruLabs. Scrolling,
 * swiping or Skip let the keyboard type it for you, one visible key press at a time.
 *
 * The markup is rendered on the server and shown by an inline script in <head> before first
 * paint on every load, so the site never flashes and is never blocked if scripts fail.
 * Key presses are written straight to the DOM; nothing here re-renders while typing.
 */

const WORD = "AshiruLabs";
/** Typing steps: one per letter, then Return. */
const STEPS = WORD.length + 1;
/** Interval between queued key presses, so a fast scroll still shows every key going down. */
const PACE = 85;

type Key = { k: string; label: string; sub?: string; w?: number; cls?: string; spacer?: boolean };

const k = (ch: string): Key => ({ k: ch.toLowerCase(), label: ch });

/* A compact keyboard, platform-neutral. Widths are in key units; every row sums to 14.5. */
const ROWS: Key[][] = [
  [
    { k: "esc", label: "esc", w: 1.5, cls: "mod" },
    ...Array.from({ length: 12 }, (_, i) => ({ k: `f${i + 1}`, label: `F${i + 1}`, cls: "fn" })),
    { k: "power", label: "", cls: "power" },
  ],
  [
    { k: "`", label: "`", sub: "~" },
    ..."1234567890".split("").map((n, i) => ({ k: n, label: n, sub: "!@#$%^&*()"[i] })),
    { k: "-", label: "-", sub: "_" },
    { k: "=", label: "=", sub: "+" },
    { k: "delete", label: "backspace", w: 1.5, cls: "mod right" },
  ],
  [
    { k: "tab", label: "tab", w: 1.5, cls: "mod" },
    ..."QWERTYUIOP".split("").map(k),
    { k: "[", label: "[", sub: "{" },
    { k: "]", label: "]", sub: "}" },
    { k: "\\", label: "\\", sub: "|" },
  ],
  [
    { k: "caps", label: "caps lock", w: 1.8, cls: "mod" },
    ..."ASDFGHJKL".split("").map(k),
    { k: ";", label: ";", sub: ":" },
    { k: "'", label: "'", sub: '"' },
    { k: "return", label: "enter", w: 1.7, cls: "mod right" },
  ],
  [
    { k: "shift-l", label: "shift", w: 2.3, cls: "mod" },
    ..."ZXCVBNM".split("").map(k),
    { k: ",", label: ",", sub: "<" },
    { k: ".", label: ".", sub: ">" },
    { k: "/", label: "/", sub: "?" },
    { k: "shift-r", label: "shift", w: 2.2, cls: "mod right" },
  ],
  [
    { k: "fn", label: "fn", cls: "mod" },
    { k: "ctrl-l", label: "ctrl", w: 1.25, cls: "mod" },
    { k: "alt-l", label: "alt", w: 1.25, cls: "mod" },
    { k: "space", label: "", w: 5.5 },
    { k: "alt-r", label: "alt", w: 1.25, cls: "mod right" },
    { k: "ctrl-r", label: "ctrl", w: 1.25, cls: "mod right" },
  ],
];

/* The phone keyboard: the same keys, in the layout a thumb expects. Rows sum to 10. */
const PHONE_ROWS: Key[][] = [
  "QWERTYUIOP".split("").map(k),
  [{ k: "_l", label: "", w: 0.5, spacer: true }, ..."ASDFGHJKL".split("").map(k), { k: "_r", label: "", w: 0.5, spacer: true }],
  [
    { k: "shift-l", label: "shift", w: 1.5, cls: "mod" },
    ..."ZXCVBNM".split("").map(k),
    { k: "delete", label: "delete", w: 1.5, cls: "mod right" },
  ],
  [
    { k: "num", label: "123", w: 1.25, cls: "mod" },
    { k: "space", label: "space", w: 5.5 },
    { k: ".", label: "." },
    { k: "return", label: "return", w: 2.25, cls: "mod right" },
  ],
];

function Arrows() {
  return (
    <div className="kb-arrows">
      <span className="kb-key kb-arrow" data-k="left">
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M6.5 2 3 5l3.5 3" />
        </svg>
      </span>
      <span className="kb-updown">
        <span className="kb-key kb-arrow half" data-k="up">
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 6.5 5 3l3 3.5" />
          </svg>
        </span>
        <span className="kb-key kb-arrow half" data-k="down">
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 3.5 5 7l3-3.5" />
          </svg>
        </span>
      </span>
      <span className="kb-key kb-arrow" data-k="right">
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M3.5 2 7 5 3.5 8" />
        </svg>
      </span>
    </div>
  );
}

/** What a key types, plain and shifted, for clicks and taps on the on-screen keyboard. */
function charsOf(key: Key): Record<string, string> {
  if (key.cls?.includes("mod") || key.cls === "fn" || key.cls === "power" || key.spacer) return {};
  if (key.k === "space") return { "data-ch": " ", "data-sh": " " };
  if (/^[a-z]$/.test(key.k)) return { "data-ch": key.k, "data-sh": key.k.toUpperCase() };
  return { "data-ch": key.label, "data-sh": key.sub ?? key.label };
}

function Keys({ rows, phone = false }: { rows: Key[][]; phone?: boolean }) {
  return (
    <div className={`kb ${phone ? "kb-phone" : "kb-desktop"}`} aria-hidden="true">
      <div className="kb-case">
        {rows.map((row, r) => (
          <div key={r} className={`kb-row${r === 0 && !phone ? " kb-row-fn" : ""}`}>
            {row.map((key, i) =>
              key.spacer ? (
                <span key={key.k} className="kb-gap" style={{ ["--w" as string]: key.w }} />
              ) : (
                <span
                  key={key.k}
                  className={`kb-key${key.cls ? ` ${key.cls.split(" ").map((c) => `is-${c}`).join(" ")}` : ""}`}
                  data-k={key.k}
                  {...charsOf(key)}
                  style={{ ...(key.w ? { ["--w" as string]: key.w } : {}), ["--d" as string]: `${r * 55 + i * 14}ms` }}
                >
                  {key.sub && !key.cls?.includes("mod") ? <span className="kb-sub">{key.sub}</span> : null}
                  {key.k === "power" ? (
                    <svg className="kb-power" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M8 2.2v5.3" />
                      <path d="M4.6 4.4a5 5 0 1 0 6.8 0" />
                    </svg>
                  ) : (
                    <span className="kb-label">{key.label}</span>
                  )}
                </span>
              ),
            )}
            {!phone && r === rows.length - 1 ? <Arrows /> : null}
          </div>
        ))}
      </div>
      <div className="kb-reflection" />
    </div>
  );
}

/** Physical key codes to on-screen keys, so the keyboard mirrors the one under your hands. */
const CODE_TO_KEY: Record<string, string> = {
  Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Space: "space", Enter: "return",
  NumpadEnter: "return", Backspace: "delete", Tab: "tab", CapsLock: "caps", ShiftLeft: "shift-l",
  ShiftRight: "shift-r", ControlLeft: "ctrl-l", ControlRight: "ctrl-r", AltLeft: "alt-l",
  AltRight: "alt-r", Escape: "esc",
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
};
const keyIdFor = (code: string) => {
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code.toLowerCase();
  return CODE_TO_KEY[code];
};
const MAX = 14;

export default function Intro() {
  const root = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || !introActive()) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Desktop and phone keyboards share key ids; presses light whichever one is on screen.
    const phone = window.matchMedia("(max-width: 899px)");
    const keyOf = (id: string) =>
      el.querySelector<HTMLElement>(`${phone.matches ? ".kb-phone" : ".kb-desktop"} [data-k="${CSS.escape(id)}"]`);

    /* One buffer, edited by everything: real typing, on-screen keys, scroll, swipe and skip. */
    let text = "";
    let wanted = 0; // scroll/skip target, in steps of the word (STEPS = word + Return)
    let pos = 0;
    let driving = false; // true while scroll or skip is steering the buffer toward the word
    let timer = 0;
    let opened = false;
    let touched = false;
    let shiftLatch = false;
    let caps = false;

    const onTrack = () => WORD.startsWith(text);

    const spark = (key: HTMLElement) => {
      if (still) return;
      const s = document.createElement("span");
      s.className = "kb-spark";
      key.appendChild(s);
      s.addEventListener("animationend", () => s.remove(), { once: true });
    };
    const down = (id: string | undefined) => {
      const key = id ? keyOf(id) : null;
      if (!key) return null;
      key.classList.remove("is-down");
      void key.offsetWidth;
      key.classList.add("is-down");
      spark(key);
      return key;
    };
    const up = (id: string | undefined) => (id ? keyOf(id)?.classList.remove("is-down") : undefined);
    const tap = (id: string, hold = 150) => {
      down(id);
      window.setTimeout(() => up(id), hold);
    };

    const paint = () => {
      const track = onTrack();
      el.dataset.track = String(track);
      el.dataset.typed = String(text.length);
      // Characters off the word dim, so the way back is obvious.
      Array.from(word.current?.children ?? []).forEach((c, i) => {
        if (!c.classList.contains("is-leaving")) c.classList.toggle("is-wrong", text[i] !== WORD[i]);
      });
    };

    const insert = (ch: string) => {
      if (opened) return;
      if (text.length >= MAX) return shake();
      text += ch;
      const span = document.createElement("span");
      span.className = "intro-char";
      span.textContent = ch === " " ? "\u00a0" : ch;
      word.current?.appendChild(span);
      paint();
      if (text === WORD) window.setTimeout(() => text === WORD && open(), still ? 0 : 280);
    };
    const erase = () => {
      if (opened || !text) return;
      text = text.slice(0, -1);
      const spans = Array.from(word.current?.children ?? []).filter((c) => !c.classList.contains("is-leaving"));
      const last = spans[spans.length - 1] as HTMLElement | undefined;
      if (last) {
        last.classList.add("is-leaving");
        window.setTimeout(() => last.remove(), still ? 0 : 160);
      }
      paint();
    };

    const shake = () => {
      el.classList.remove("is-wrong");
      void el.offsetWidth;
      el.classList.add("is-wrong");
    };

    const open = () => {
      if (opened) return;
      opened = true;
      tap("return", 260);
      el.classList.add("is-opening");
      window.clearTimeout(timer);
      detach();
      // The site opens now, under the fading intro, so its camera and headline are already
      // moving as the keyboard falls away; the overlay is removed once it has faded.
      finishIntro();
      // A trackpad keeps sending scroll momentum after the last swipe. Swallow it until it
      // dies, so the hero is never scrolled before it is seen; then let the page scroll.
      let lastFlick = performance.now();
      const swallow = (e: Event) => {
        lastFlick = performance.now();
        e.preventDefault();
      };
      window.addEventListener("wheel", swallow, { passive: false });
      window.addEventListener("touchmove", swallow, { passive: false });
      const started = performance.now();
      const settle = () => {
        // Hold for a grace period whatever happens, then wait for half a second of stillness.
        const t = performance.now() - started;
        const quiet = performance.now() - lastFlick > 500;
        if ((quiet && t > 1600) || t > 4000) {
          window.removeEventListener("wheel", swallow);
          window.removeEventListener("touchmove", swallow);
          releaseScroll();
        } else window.setTimeout(settle, 120);
      };
      window.setTimeout(() => {
        el.remove();
        settle();
      }, still ? 150 : 1150);
    };

    const markTouched = () => {
      if (touched) return;
      touched = true;
      el.classList.add("is-touched");
    };

    /* scroll, swipe and skip steer the buffer to the word, one visible key press per beat */
    const step = () => {
      timer = 0;
      if (opened || !driving) return;
      const goal = Math.min(wanted, WORD.length);
      if (!onTrack() || text.length > goal) {
        tap("delete");
        erase();
      } else if (text.length < goal) {
        const ch = WORD[text.length];
        if (ch !== ch.toLowerCase()) tap("shift-l", 220);
        tap(ch.toLowerCase());
        insert(ch);
      } else if (wanted >= STEPS && text === WORD) {
        return open();
      } else {
        driving = false;
        return;
      }
      timer = window.setTimeout(step, still ? 0 : PACE);
    };
    const steer = (to: number) => {
      if (opened) return;
      markTouched();
      pos = Math.min(STEPS, Math.max(0, to));
      wanted = Math.floor(pos + 1e-6);
      driving = true;
      if (!timer) step();
    };

    /* real typing: whatever is typed goes in; the site opens only on the exact word */
    // After a hand edit, scrolling picks up from wherever the word now stands.
    const resync = () => {
      pos = onTrack() ? text.length : 0;
    };
    const typed = (ch: string) => {
      markTouched();
      driving = false;
      window.clearTimeout(timer);
      timer = 0;
      insert(ch);
      resync();
    };
    const handErase = () => {
      markTouched();
      driving = false;
      window.clearTimeout(timer);
      timer = 0;
      erase();
      resync();
    };
    const enter = () => {
      if (text === WORD) open();
      else shake();
    };

    /* the splash plays first; any input during it skips straight to the keyboard */
    let splashing = true;
    const endSplash = () => {
      if (!splashing) return;
      splashing = false;
      el.classList.add("is-ready");
      finishSplash();
    };
    const splashTimer = window.setTimeout(endSplash, still ? 600 : 2350);
    const skipSplash = () => {
      if (!splashing) return false;
      window.clearTimeout(splashTimer);
      endSplash();
      return true;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (skipSplash()) return;
      if (opened || e.ctrlKey || e.metaKey) {
        down(keyIdFor(e.code));
        return;
      }
      const id = keyIdFor(e.code);
      if (id && !e.repeat) down(id);
      if (e.key === "Escape") return steer(STEPS);
      if (e.key === "Enter") {
        e.preventDefault();
        return enter();
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        return handErase();
      }
      if (e.key.length === 1 && !e.altKey) {
        e.preventDefault();
        typed(e.key);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => up(keyIdFor(e.code));

    /* the on-screen keys: tap to type; shift is one-shot, caps lock latches */
    let pressed: { key: HTMLElement; x: number; y: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      if (skipSplash()) return;
      const key = (e.target as HTMLElement).closest<HTMLElement>(".kb-key");
      if (!key || opened) return;
      key.classList.add("is-down");
      spark(key);
      pressed = { key, x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!pressed) return;
      const { key, x, y } = pressed;
      pressed = null;
      const id = key.dataset.k ?? "";
      if (id !== "caps") key.classList.remove("is-down");
      // A swipe that started on a key is a scroll, not a press.
      if (Math.hypot(e.clientX - x, e.clientY - y) > 10) return;
      markTouched();
      if (id === "shift-l" || id === "shift-r") {
        shiftLatch = !shiftLatch;
        for (const s of ["shift-l", "shift-r"]) keyOf(s)?.classList.toggle("is-latched", shiftLatch);
        return;
      }
      if (id === "caps") {
        caps = !caps;
        key.classList.toggle("is-latched", caps);
        key.classList.remove("is-down");
        return;
      }
      if (id === "delete") return handErase();
      if (id === "return") return enter();
      if (id === "esc") return steer(STEPS);
      const plain = key.dataset.ch;
      if (plain === undefined) return;
      const shifted = shiftLatch !== (caps && /^[a-z]$/.test(plain));
      typed(shifted ? (key.dataset.sh ?? plain) : plain);
      if (shiftLatch) {
        shiftLatch = false;
        for (const s of ["shift-l", "shift-r"]) keyOf(s)?.classList.remove("is-latched");
      }
    };
    const onPointerCancel = () => {
      pressed?.key.classList.remove("is-down");
      pressed = null;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (skipSplash()) return;
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
      steer(pos + px / 110);
    };
    let ty = 0;
    const onTouchStart = (e: TouchEvent) => {
      ty = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (skipSplash()) return;
      const y = e.touches[0].clientY;
      steer(pos + (ty - y) / 46);
      ty = y;
    };
    // Skipping still finishes the word: the keyboard types the rest itself, then presses Return.
    const onSkip = (e: Event) => {
      if (splashing) return;
      if ((e.target as HTMLElement).closest("[data-skip]")) steer(STEPS);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    el.addEventListener("click", onSkip);
    const detach = () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      el.removeEventListener("click", onSkip);
    };
    paint();

    return () => {
      detach();
      window.clearTimeout(timer);
      window.clearTimeout(splashTimer);
    };
  }, []);

  return (
    <div ref={root} className="intro" role="dialog" aria-modal="true" aria-label="Welcome to AshiruLabs" data-typed="0">
      <div className="splash" aria-hidden="true">
        <div className="splash-lockup">
          <svg className="splash-mark" viewBox="0 0 32 32" fill="none">
            <path className="splash-steps" d="M3 28H10V21H17V14H24V7H29" />
            <circle className="splash-head" cx="25.5" cy="3.4" r="2.4" />
          </svg>
          <span className="splash-name">
            <span className="splash-word">
              Ashiru<span>Labs</span>
            </span>
            <span className="splash-rule" />
          </span>
        </div>
      </div>

      <div className="intro-bg" aria-hidden="true">
        <span className="intro-pool intro-pool-a" />
        <span className="intro-pool intro-pool-b" />
        <span className="intro-pool intro-pool-c" />
      </div>

      <div className="intro-stage">
        <div className="intro-screen">
          <span className="intro-word" aria-hidden="true">
            <span ref={word} className="intro-typed" />
            <span className="intro-caret" />
          </span>
          <span className="sr-only">AshiruLabs</span>
        </div>
        <p className="intro-hint" aria-hidden="true">
          <svg viewBox="0 0 16 24" width="14" height="21" aria-hidden="true">
            <rect x="1" y="1" width="14" height="22" rx="7" />
            <path className="intro-hint-wheel" d="M8 6v4" />
          </svg>
          Scroll, or type AshiruLabs
        </p>
        <Keys rows={ROWS} />
        <Keys rows={PHONE_ROWS} phone />
      </div>

      <div className="intro-foot">
        <button type="button" className="intro-skip" data-skip>
          Skip intro
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path d="M2 8H13M8.5 3.5L13 8L8.5 12.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
