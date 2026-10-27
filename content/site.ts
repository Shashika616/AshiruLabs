/**
 * Everything the site claims, in one place.
 *
 * Nothing here is invented: no clients, metrics or testimonials. Where a fact
 * has not been supplied yet it is marked PLACEHOLDER and lives only in this
 * file, so filling it in is a one-line change.
 */

export const SITE = {
  name: "AshiruLabs",
  /** PLACEHOLDER: the production domain. Used for canonical URLs and the sitemap. */
  url: "https://ashirulabs.com",
  /** The address every contact button and link opens. */
  email: "info@ashirulabs.com",
  country: "Sri Lanka",
  timeZone: "Asia/Colombo",
  description:
    "AshiruLabs is a software product company in Sri Lanka. We build and run our own products, like TieHere, and we build yours the same way.",
};

export const NAV = [
  { href: "#studio", label: "Studio" },
  { href: "#tiehere", label: "TieHere" },
  { href: "#services", label: "Services" },
  { href: "#process", label: "Process" },
];

/** One per section, in page order. The scene puts a landing under each. */
export const STATION_NAMES = ["Home", "Studio", "TieHere", "Services", "Process", "Contact"];

export const DISCIPLINES = [
  {
    title: "Our products",
    body: "We conceive, design, build and operate software under our own name. Owning a product end to end is how we learned what a codebase needs to survive its second year.",
    detail: "TieHere is the first one out.",
  },
  {
    title: "Your product",
    body: "We design and build software for founders and companies, from the first commit to the version people rely on every day, and we stay for what comes after launch.",
    detail: "The same standard, end to end.",
  },
];

export const TIEHERE = {
  /** Temporary: the TieHere site's preview deployment, until tiehere.com is live. */
  url: "https://tiehere-web.vercel.app",
  line: "Connect with who's here.",
  body: "Professionals near you, meeting in person, around something specific. Nobody here is anonymous. TieHere is not another feed. It is a small number of real meetings you actually show up to.",
  intents: ["Coffee", "Meal", "Networking", "Mentorship", "Outing", "Ride share", "Dating"],
  /** Copied from the TieHere site. "Verified" describes credentials, never people. */
  trust: [
    { level: "0", name: "Looking around", unlocks: "Browse what is happening nearby. Locations stay redacted." },
    { level: "1", name: "A real account", unlocks: "Host, request, and be seen." },
    { level: "2", name: "Identity checked", unlocks: "SOS, trusted contacts and the safety gate switch on." },
    { level: "3", name: "Workplace checked", unlocks: "Meetups that ask for a confirmed employer." },
  ],
};

export const SERVICES = [
  {
    title: "Mobile apps",
    body: "iOS and Android from one codebase, or native where the product needs it. Built for the store review, the slow network and the old phone.",
    tags: ["iOS", "Android", "Cross-platform"],
  },
  {
    title: "Web platforms",
    body: "Fast, accessible web products and the dashboards behind them. Server-rendered where it matters, measured where it counts.",
    tags: ["Web apps", "Dashboards", "Marketing sites"],
  },
  {
    title: "Product design",
    body: "Flows, interfaces and design systems, shaped with the people who will use them before a line of production code is written.",
    tags: ["UX", "Interface", "Design systems"],
  },
  {
    title: "Backend and cloud",
    body: "APIs, data, authentication and infrastructure, designed so the second year costs less than the first.",
    tags: ["APIs", "Data", "Infrastructure"],
  },
];

export const PROCESS = [
  { title: "Survey", body: "Who it is for, what it has to do, and what it must never do. We write it down before we draw anything." },
  { title: "Plan", body: "Scope, milestones and the smallest version worth putting in front of people." },
  { title: "Build", body: "Short increments you can open and use as they land, not a reveal at the end." },
  { title: "Ship", body: "Release, store review, monitoring. Launch is a step, not the summit." },
  { title: "Maintain", body: "Fixes, upgrades and the next feature. We keep climbing with you." },
];
