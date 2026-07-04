// Content for the KI Consult landing page.
// Mirrors the data exposed by the original design's renderVals().

/** Days for the money-back guarantee (original prop `gDays`, default 30). */
export const gDays = 30;

/** Whether to show the scarcity note in the offer panel (original prop `showScarcity`). */
export const showScarcity = true;

export interface ValueItem {
  label: string;
  value: string;
}

export const valueStack: ValueItem[] = [
  { label: "AI-telefoni med naturlig norsk stemme (under 300 ms)", value: "Verdi 12 000 kr/mnd" },
  { label: "AI-chatbot på nett - ubegrenset, alltid gratis", value: "Verdi 6 000 kr/mnd" },
  { label: "Taleagent-widget direkte på nettsiden", value: "Verdi 4 000 kr/mnd" },
  { label: "Dedikert norsk telefonnummer inkludert", value: "Verdi 1 500 kr/mnd" },
  { label: "BankID & Vipps-identifisering", value: "Verdi 3 500 kr/mnd" },
  { label: "Sømløs overlevering til menneske", value: "Verdi 2 500 kr/mnd" },
  { label: "Integrasjoner: CRM, Zendesk, HubSpot m.fl.", value: "Verdi 5 000 kr/mnd" },
  { label: "Selvbetjent plattform & analyse-dashbord", value: "Verdi 2 500 kr/mnd" },
];

export const bonuses: ValueItem[] = [
  { label: "Gratis oppsett av FAQ-agent (verdi 7 500 kr)", value: "GRATIS" },
  { label: "Onboarding live på 7 dager - garantert", value: "GRATIS" },
];

export interface Step {
  n: string;
  title: string;
  desc: string;
}

export const steps: Step[] = [
  { n: "01", title: "Koble til", desc: "Vi kobler agenten til nettsiden, telefonnummeret og systemene dine. Ingen utvikler nødvendig." },
  { n: "02", title: "Lær den opp", desc: "Agenten lærer av dokumentene, FAQ-en og tonen deres. Du godkjenner svarene før den går live." },
  { n: "03", title: "Gå live", desc: "På 7 dager svarer agenten kunder døgnet rundt - på telefon, chat og web. Du følger alt i dashbordet." },
];

export interface Feature {
  n: string;
  title: string;
  desc: string;
}

export const features: Feature[] = [
  { n: "AI", title: "AI-chatbot 24/7", desc: "Forstår kontekst, utfører handlinger og kobler til CRM. Svarer på norsk hele døgnet. Gratis i alle planer." },
  { n: "☎", title: "AI-telefoni", desc: "Fjern telefonkø. Naturlige samtaler som løser saker umiddelbart - innkommende og utgående." },
  { n: "◎", title: "Tale-widget på web", desc: "La besøkende snakke direkte med nettsiden i stedet for å skrive." },
  { n: "ID", title: "BankID & Vipps", desc: "Sikker identifisering med Norges mest brukte løsninger - raskt og GDPR-trygt." },
  { n: "⇄", title: "Integrasjoner", desc: "Koble til eksisterende systemer og bygg avanserte automatiske arbeidsflyter." },
  { n: "→", title: "Overlevering til menneske", desc: "Human-in-the-loop: sømløs overgang fra AI til en ansatt når det trengs." },
];

export interface Industry {
  title: string;
  desc: string;
}

export const industries: Industry[] = [
  { title: "Service & vedlikehold", desc: "Timebestilling, serviceanmodninger og vedlikehold håndteres automatisk." },
  { title: "Bank & finans", desc: "Saldo, transaksjoner og lånespørsmål automatisk - døgnet rundt." },
  { title: "Forsikring", desc: "Effektiviser skademelding, polisespørsmål og kundeoppfølging." },
  { title: "Energi & strøm", desc: "Måleravlesning, fakturaspørsmål og strømbrudd håndteres automatisk." },
  { title: "Helse & klinikk", desc: "Timebestilling, reseptfornyelse og pasienthenvendelser." },
  { title: "E-handel & nettbutikk", desc: "Ordrestatus, retur og produktspørsmål - automatisk." },
  { title: "Telekom & bredbånd", desc: "Support for mobil, bredbånd, TV og fasttelefon døgnet rundt." },
  { title: "Reiseliv & hotell", desc: "Rombestilling, endringer og gjestehenvendelser automatisk." },
];

export interface PricingPlan {
  name: string;
  minutes: string;
  setup: string;
  monthly?: string;
  monthlyPrefix?: string;
  /** Highlight as the recommended plan. */
  featured?: boolean;
  badge?: string;
  cta: string;
  features: string[];
}

const baseFeatures = [
  "Chat — fri bruk (fair use)",
  "Norsk telefonnummer",
  "Tale-widget på web",
  "Human handoff dashboard",
  "Selvbetjeningsplattform",
];

/** Customer-facing pricing. Overage billed at 5 kr/min on all plans. */
export const pricingPlans: PricingPlan[] = [
  {
    name: "Starter",
    minutes: "500 taleminutter/mnd",
    setup: "3 500 kr",
    monthly: "2 500 kr",
    cta: "Kom i gang",
    features: baseFeatures,
  },
  {
    name: "Vekst",
    minutes: "1 500 taleminutter/mnd",
    setup: "6 500 kr",
    monthly: "7 500 kr",
    featured: true,
    badge: "Mest populær",
    cta: "Velg Vekst",
    features: baseFeatures,
  },
  {
    name: "Pro",
    minutes: "2 500 taleminutter/mnd",
    setup: "11 500 kr",
    monthly: "12 500 kr",
    cta: "Velg Pro",
    features: baseFeatures,
  },
  {
    name: "Enterprise",
    minutes: "6 000+ taleminutter/mnd",
    setup: "Custom",
    cta: "Kontakt oss",
    features: baseFeatures,
  },
];

export interface Faq {
  q: string;
  a: string;
}

export const faqs: Faq[] = [
  { q: "Hva er en KI-resepsjonist?", a: "En KI-resepsjonist er en digital medarbeider drevet av kunstig intelligens som svarer på telefon, chat og webhenvendelser - akkurat som en menneskelig resepsjonist, men tilgjengelig 24/7. Den booker timer, svarer på spørsmål og setter over til en ansatt når det trengs." },
  { q: "Kan en KI-resepsjonist erstatte sentralbordet vårt?", a: "For de fleste bedrifter, ja. KI-resepsjonisten tar imot alle innkommende samtaler, ruter dem riktig, svarer på vanlige spørsmål og booker avtaler automatisk. Ansatte kobles kun inn når samtalen faktisk krever et menneske." },
  { q: "Snakker agenten ordentlig norsk?", a: "Ja. Den er bygget for norsk - både bokmål og dialekter - med naturlig stemme som svarer på under 300 ms. Ikke en oversatt utenlandsk modell." },
  { q: "Hvor lagres dataene?", a: "Alt hostes i Norge og er fullt GDPR-kompatibelt. Du eier dine data, og vi deler dem aldri." },
  { q: "Hvor lang tid tar oppsettet?", a: "Live på 7 dager fra signert avtale. Enkle FAQ-agenter kan settes opp gratis og raskere." },
  { q: "Hva om agenten ikke kan svare?", a: "Da overleveres samtalen sømløst til en av dine ansatte - med full kontekst, så kunden slipper å gjenta seg." },
  { q: "Er det bindingstid?", a: "Nei. Ingen binding, 60 dagers oppsigelse, og 30 dagers pengene-tilbake hvis du ikke finner verdi." },
];
