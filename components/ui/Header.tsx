"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NAV, SITE } from "@/content/site";
import { Mark } from "./Marks";

/** Every in-page destination the header can mark as current, in page order. */
const TRACKED = [...NAV.map((n) => n.href), "#contact"];

export default function Header() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // The section on screen: the last one whose top has passed the middle of the viewport.
  // Read once per frame at most, and only when the answer changes does React re-render.
  useEffect(() => {
    const els = TRACKED.map((h) => document.querySelector<HTMLElement>(h));
    let raf = 0;
    let current: string | null = null;
    const read = () => {
      raf = 0;
      // Climb progress along the bar's lower edge, and a denser bar once the page is moving.
      const h = headerRef.current;
      if (h) {
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        h.style.setProperty("--progress", (window.scrollY / max).toFixed(4));
        h.toggleAttribute("data-compact", window.scrollY > 24);
      }
      const line = window.innerHeight * 0.5;
      let next: string | null = null;
      els.forEach((el, i) => {
        if (el && el.getBoundingClientRect().top <= line) next = TRACKED[i];
      });
      if (next !== current) {
        current = next;
        setActive(next);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // The active marker glides to the current link: measured, then moved with a transform.
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const place = () => {
      const link = active ? nav.querySelector<HTMLElement>(`a[href="${active}"]`) : null;
      nav.toggleAttribute("data-active", !!link);
      if (!link) return;
      nav.style.setProperty("--px", `${link.offsetLeft}px`);
      nav.style.setProperty("--pw", `${link.offsetWidth}px`);
    };
    place();
    window.addEventListener("resize", place, { passive: true });
    document.fonts?.ready.then(place).catch(() => {});
    return () => window.removeEventListener("resize", place);
  }, [active]);

  const hover = (e: React.PointerEvent<HTMLAnchorElement>) => {
    const nav = navRef.current;
    if (!nav || e.pointerType !== "mouse") return;
    nav.style.setProperty("--hx", `${e.currentTarget.offsetLeft}px`);
    nav.style.setProperty("--hw", `${e.currentTarget.offsetWidth}px`);
    nav.setAttribute("data-hover", "");
  };
  const unhover = () => navRef.current?.removeAttribute("data-hover");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.documentElement.classList.add("menu-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("menu-open");
    };
  }, [open]);

  return (
    <header ref={headerRef} className="header" data-open={open}>
      <a href="#top" className="brand" aria-label={`${SITE.name}, back to top`} onClick={() => setOpen(false)}>
        <Mark size={26} />
        <span className="brand-word">
          Ashiru<span>Labs</span>
        </span>
      </a>

      <nav ref={navRef} className="nav" aria-label="Primary" onPointerLeave={unhover}>
        <span className="nav-hover" aria-hidden="true" />
        <span className="nav-pill" aria-hidden="true" />
        {NAV.map((n) => (
          <a key={n.href} href={n.href} aria-current={active === n.href ? "true" : undefined} onPointerEnter={hover}>
            {n.label}
          </a>
        ))}
      </nav>

      <a
        href="#contact"
        className="btn btn-sm btn-solid header-cta"
        aria-current={active === "#contact" ? "true" : undefined}
      >
        Start a project
        <svg className="arrow" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <path d="M2 8H13M8.5 3.5L13 8L8.5 12.5" />
        </svg>
      </a>

      <span className="header-progress" aria-hidden="true" />

      <button
        type="button"
        className="menu-toggle"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path className="menu-l1" d="M3 8H21" />
          <path className="menu-l2" d="M3 16H21" />
        </svg>
      </button>

      <div id="mobile-menu" className="mobile-menu" hidden={!open}>
        <nav aria-label="Mobile">
          {NAV.map((n, i) => (
            <a
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              aria-current={active === n.href ? "true" : undefined}
              style={{ ["--i" as string]: i }}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <a href="#contact" className="btn" onClick={() => setOpen(false)}>
          Start a project
        </a>
      </div>
    </header>
  );
}
