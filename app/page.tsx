import ClimbStage from "@/components/motion/ClimbStage";
import StageSkeleton from "@/components/motion/StageSkeleton";
import Intro from "@/components/intro/Intro";
import Reveal from "@/components/motion/Reveal";
import SmoothScroll from "@/components/motion/SmoothScroll";
import Cursor from "@/components/ui/Cursor";
import Footer from "@/components/ui/Footer";
import Header from "@/components/ui/Header";
import { TieHereMark } from "@/components/ui/Marks";
import { DISCIPLINES, PROCESS, SERVICES, SITE, STATION_NAMES, TIEHERE } from "@/content/site";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg className="arrow" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      {diagonal ? <path d="M4 12L12 4M5.5 4H12V10.5" /> : <path d="M2 8H13M8.5 3.5L13 8L8.5 12.5" />}
    </svg>
  );
}

/** The flight between two sections: the climb is the content here, marked by the name it leads to. */
function Gap({ to, align }: { to: number; align: "start" | "end" }) {
  return (
    <div className="gap" data-align={align} aria-hidden="true">
      <div className="gap-mark">
        <span className="gap-tick" />
        <span className="gap-name">{STATION_NAMES[to]}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const mail = `mailto:${SITE.email}?subject=${encodeURIComponent("A project for AshiruLabs")}`;
  return (
    <>
      <a href="#studio" className="skip">
        Skip to content
      </a>
      <Intro />
      <ClimbStage />
      <StageSkeleton />
      <Header />

      <main id="top">
        <section className="hero" data-station="0" data-side="1" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title" className="display">
              <span className="line">
                <span>Every step,</span>
              </span>
              <span className="line line-2">
                <span>
                  shipped<span className="accent">.</span>
                </span>
              </span>
            </h1>
            <p className="lede hero-lede">
              AshiruLabs is a software product company in {SITE.country}. We build and run our own products, and{" "}
              <strong className="hl">we build yours the same way</strong>: one measured step at a time, from first
              commit to the version people rely on.
            </p>
            <div className="ctas hero-ctas">
              <a href="#contact" className="btn btn-solid">
                Start a project
              </a>
              <a href="#tiehere" className="btn">
                See TieHere
              </a>
            </div>
          </div>

          <div className="hero-foot">
            <a href="#tiehere" className="shipping">
              <TieHereMark size={30} />
              <span className="shipping-text">
                <span className="shipping-label">Now shipping</span>
                <span>TieHere. {TIEHERE.line}</span>
              </span>
              <Arrow />
            </a>
          </div>
        </section>

        <Gap to={1} align="start" />

        <section id="studio" className="station" data-station="1" data-side="1" aria-labelledby="studio-title">
          <div className="station-inner">
            <h2 id="studio-title" className="h2" data-reveal="wipe">
              Two kinds of work.
              <br />
              One standard.
            </h2>
            <div className="ledger">
              {DISCIPLINES.map((d, i) => (
                <article key={d.title} className="ledger-row" data-reveal style={{ ["--d" as string]: i + 1 }}>
                  <h3 className="h3">{d.title}</h3>
                  <p>{d.body}</p>
                  <p className="ledger-detail">{d.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <Gap to={2} align="end" />

        <section
          id="tiehere"
          className="station station-right tiehere"
          data-station="2"
          data-side="-1"
          aria-labelledby="tiehere-title"
        >
          <div className="station-inner">
            <div className="th-lockup" data-reveal>
              <TieHereMark size={52} />
              <span className="th-word">TieHere</span>
            </div>
            <h2 id="tiehere-title" className="h2" data-reveal="wipe">
              {TIEHERE.line}
            </h2>
            <p className="lede" data-reveal style={{ ["--d" as string]: 1 }}>
              {TIEHERE.body}
            </p>

            <ul className="th-intents" aria-label="Seven reasons to meet" data-reveal style={{ ["--d" as string]: 2 }}>
              {TIEHERE.intents.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>

            <div className="ladder">
              <h3 className="ladder-title">Trust is a ladder, too.</h3>
              <ol className="ladder-rungs">
                {TIEHERE.trust.map((r, i) => (
                  <li key={r.level} className="rung" data-reveal="rise" style={{ ["--d" as string]: i, ["--r" as string]: i }}>
                    <span className="rung-bar" />
                    <span className="rung-level tabular">L{r.level}</span>
                    <span className="rung-name">{r.name}</span>
                    <span className="rung-unlocks">{r.unlocks}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="th-foot" data-reveal>
              <a href={TIEHERE.url} className="btn" target="_blank" rel="noopener">
                Visit TieHere
                <Arrow diagonal />
              </a>
              <p>A product of AshiruLabs.</p>
            </div>
          </div>
        </section>

        <Gap to={3} align="start" />

        <section id="services" className="station" data-station="3" data-side="1" aria-labelledby="services-title">
          <div className="station-inner">
            <h2 id="services-title" className="h2" data-reveal="wipe">
              Your product,
              <br />
              built like it&rsquo;s ours.
            </h2>
            <p className="lede" data-reveal style={{ ["--d" as string]: 1 }}>
              AshiruLabs builds client software with <strong className="hl">the same product discipline</strong> behind
              its own products. No hand-off to a second bench, no prototype left for someone else to finish.
            </p>
            <ul className="services">
              {SERVICES.map((s, i) => (
                <li key={s.title} className="service" data-reveal style={{ ["--d" as string]: i }}>
                  <h3 className="h3">{s.title}</h3>
                  <p>{s.body}</p>
                  <ul className="tags" aria-label={`${s.title} includes`}>
                    {s.tags.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Gap to={4} align="end" />

        <section
          id="process"
          className="station station-right"
          data-station="4"
          data-side="-1"
          aria-labelledby="process-title"
        >
          <div className="station-inner">
            <h2 id="process-title" className="h2" data-reveal="wipe">
              How a build climbs.
            </h2>
            <p className="lede" data-reveal style={{ ["--d" as string]: 1 }}>
              Five steps, read from the bottom up. Each one is <strong className="hl">finished before the next is taken</strong>.
            </p>
            <ol className="process">
              {PROCESS.map((p, i) => (
                <li key={p.title} className="process-step" data-reveal="rise" style={{ ["--d" as string]: i, ["--i" as string]: i }}>
                  <span className="process-n tabular">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="h3">{p.title}</h3>
                    <p>{p.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <Gap to={5} align="start" />

        <section id="contact" className="summit" data-station="5" data-side="0" aria-labelledby="contact-title">
          <div className="summit-inner">
            <h2 id="contact-title" className="display summit-title" data-reveal="wipe">
              Your product is
              <br />
              the next step<span className="accent">.</span>
            </h2>
            <p className="lede" data-reveal style={{ ["--d" as string]: 1 }}>
              Tell us where it stands today and where it needs to go. We will reply with <strong className="hl">an honest first step</strong>.
            </p>
            <div className="ctas" data-reveal style={{ ["--d" as string]: 2 }}>
              <a href={mail} className="btn btn-solid">
                Start a project
                <Arrow />
              </a>
              <a href={mail} className="btn btn-quiet">
                {SITE.email}
              </a>
            </div>
          </div>
        </section>
        {/* A screen of travel after the summit: it stays pinned while the footer rises over it. */}
        <div className="summit-travel" aria-hidden="true" />
      </main>

      <Footer />

      <Cursor />
      <SmoothScroll />
      <Reveal />
    </>
  );
}
