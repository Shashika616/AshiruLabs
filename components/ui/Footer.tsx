import { NAV, SERVICES, SITE, TIEHERE } from "@/content/site";
import LocalClock from "./LocalClock";
import { Mark, TieHereMark } from "./Marks";

/**
 * The sign-off: a sheet of glass that rises over the pinned summit.
 *
 * The summit section pins (sticky) and the page reserves a screen of travel after it; the
 * footer takes that height back as a negative margin, so it slides up over the summit rather
 * than following it. Pure CSS: no scroll handler, nothing per frame. The giant wordmark and the
 * columns rise in through the page's existing reveal observer.
 */

function ArrowOut() {
  return (
    <svg className="foot-arrow" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M4 12L12 4M5.5 4H12V10.5" />
    </svg>
  );
}

export default function Footer() {
  const mail = `mailto:${SITE.email}?subject=${encodeURIComponent("A project for AshiruLabs")}`;
  const year = new Date().getFullYear();

  return (
    <footer className="foot" aria-labelledby="foot-title">
      <div className="foot-sheet">
        <div className="foot-top">
          <div className="foot-intro">
            <h2 id="foot-title" className="sr-only">
              AshiruLabs
            </h2>
            <p className="foot-mark" aria-hidden="true">
              <span className="foot-mark-row" data-reveal="rise">
                <Mark size={64} className="foot-mark-icon" />
                <span>
                  Ashiru<span className="foot-mark-labs">Labs</span>
                </span>
              </span>
            </p>
            <p className="foot-line" data-reveal style={{ ["--d" as string]: 1 }}>
              Software products, built one measured step at a time, in {SITE.country}.
            </p>
            <div className="foot-ctas" data-reveal style={{ ["--d" as string]: 2 }}>
              <a href={mail} className="btn btn-solid">
                Start a project
                <svg className="arrow" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path d="M2 8H13M8.5 3.5L13 8L8.5 12.5" />
                </svg>
              </a>
              <a href={mail} className="foot-mail">
                {SITE.email}
              </a>
            </div>
          </div>

          <div className="foot-place" data-reveal style={{ ["--d" as string]: 2 }}>
            <span className="foot-label">Studio time</span>
            <span className="foot-clock">
              <LocalClock timeZone={SITE.timeZone} />
            </span>
            <span className="foot-place-name">{SITE.country} · UTC+05:30</span>
          </div>
        </div>

        <div className="foot-cols">
          <nav className="foot-col" aria-label="Studio" data-reveal="rise" style={{ ["--d" as string]: 0 }}>
            <p className="foot-label">Studio</p>
            <ul>
              {NAV.map((n) => (
                <li key={n.href}>
                  <a href={n.href} className="foot-link">
                    {n.label}
                  </a>
                </li>
              ))}
              <li>
                <a href="#contact" className="foot-link">
                  Contact
                </a>
              </li>
            </ul>
          </nav>

          <div className="foot-col" data-reveal="rise" style={{ ["--d" as string]: 1 }}>
            <p className="foot-label">Products</p>
            <a href={TIEHERE.url} target="_blank" rel="noopener" className="foot-product">
              <TieHereMark size={30} />
              <span className="foot-product-text">
                <span className="foot-product-name">
                  TieHere <ArrowOut />
                </span>
                <span>{TIEHERE.line}</span>
              </span>
            </a>
          </div>

          <nav className="foot-col" aria-label="Services" data-reveal="rise" style={{ ["--d" as string]: 2 }}>
            <p className="foot-label">Services</p>
            <ul>
              {SERVICES.map((s) => (
                <li key={s.title}>
                  <a href="#services" className="foot-link">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="foot-col" data-reveal="rise" style={{ ["--d" as string]: 3 }}>
            <p className="foot-label">Contact</p>
            <ul>
              <li>
                <a href={mail} className="foot-link">
                  {SITE.email}
                </a>
              </li>
              <li className="foot-muted">Based in {SITE.country}</li>
            </ul>
          </div>
        </div>

        <div className="foot-base">
          <span>&copy; {year} AshiruLabs. All rights reserved.</span>
          <a href="#top" className="foot-top-link">
            Back to the base
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
