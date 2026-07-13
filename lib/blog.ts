// Blogginnhold for KI Consult.
//
// Slik legger du til et nytt SEO-optimalisert innlegg:
//   1. Legg et nytt objekt øverst i `posts`-arrayet under (nyeste først).
//   2. Fyll ut `slug`, `title`, `description` og `keywords` - dette er
//      hovedsignalene til Google og svarmotorer (ChatGPT, Perplexity, m.fl.).
//   3. Skriv brødteksten som en liste av `Block`-elementer. Bruk `h2`/`h3`
//      for struktur (blir automatisk innholdsfortegnelse), `p` for avsnitt.
//   4. Legg gjerne til en `faq` - den blir til FAQPage-schema for rike treff.
//
// I `p`-, `h2`-, `h3`- og liste-tekst kan du bruke **fet skrift** og
// [lenketekst](/url) for intern lenking. Bruk bindestrek (-), ikke tankestrek.

export type Block =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string; cite?: string }
  | { type: "callout"; title?: string; text: string }
  | { type: "stats"; items: { value: string; label: string }[] }
  | { type: "table"; headers: string[]; rows: string[][] };

export interface BlogPost {
  /** URL-slug: /blog/<slug>. Kun små bokstaver, tall og bindestrek. */
  slug: string;
  /** SEO-tittel og H1. Hold den under ~60 tegn der det er mulig. */
  title: string;
  /** Meta-beskrivelse. 140-160 tegn, med hovedsøkeordet tidlig. */
  description: string;
  /** Nøkkelord for denne artikkelen (utfyller de globale). */
  keywords: string[];
  /** Kort ingress vist i oversikten og som artikkelens intro-uttrekk. */
  excerpt: string;
  /** ISO-dato (YYYY-MM-DD). */
  datePublished: string;
  /** ISO-dato for siste oppdatering. */
  dateModified: string;
  /** Vises som kategori-etikett (eyebrow). */
  category: string;
  author: string;
  body: Block[];
  faq?: { q: string; a: string }[];
}

/** Gjør en overskrift om til en stabil anker-id (støtter æ/ø/å). */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Estimert lesetid i minutter (~200 ord/min norsk lesehastighet). */
export function readingTimeMinutes(post: BlogPost): number {
  const words = post.body
    .map((b) => {
      switch (b.type) {
        case "p":
        case "h2":
        case "h3":
        case "quote":
        case "callout":
          return b.text;
        case "ul":
        case "ol":
          return b.items.join(" ");
        case "table":
          return [...b.headers, ...b.rows.flat()].join(" ");
        case "stats":
          return b.items.map((i) => `${i.value} ${i.label}`).join(" ");
      }
    })
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Innholdsfortegnelse fra H2-overskriftene. */
export function tableOfContents(post: BlogPost): { id: string; text: string }[] {
  return post.body
    .filter((b): b is Extract<Block, { type: "h2" }> => b.type === "h2")
    .map((b) => ({ id: slugifyHeading(b.text), text: b.text.replace(/\*\*/g, "") }));
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nb-NO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export const posts: BlogPost[] = [
  {
    slug: "ki-resepsjonist-2026-spare-penger",
    title: "Hvorfor din bedrift bør bruke en KI-resepsjonist i 2026",
    description:
      "En KI-resepsjonist svarer telefon, chat og web 24/7 på norsk. Se hvorfor 2026 er vendepunktet - og et konkret regneeksempel på hvor mye bedriften din kan spare.",
    keywords: [
      "KI-resepsjonist 2026",
      "AI-resepsjonist",
      "spare penger kundeservice",
      "virtuell resepsjonist",
      "automatisert kundeservice",
      "AI sentralbord",
      "kostnad resepsjonist",
    ],
    excerpt:
      "Ubesvarte henvendelser koster norske bedrifter kunder hver eneste dag. Slik gjør en KI-resepsjonist bedriften tilgjengelig døgnet rundt - og kutter kostnadene samtidig.",
    datePublished: "2026-07-13",
    dateModified: "2026-07-13",
    category: "KI & kundeservice",
    author: "KI Consult-redaksjonen",
    body: [
      {
        type: "p",
        text: "De fleste norske bedrifter mister kunder de aldri får vite om. En kunde ringer utenom åpningstid, får ikke svar på chatten innen et par minutter, eller havner i telefonkø - og går videre til nestemann. I 2026 er dette ikke lenger et problem du må leve med. En **KI-resepsjonist** svarer telefon, chat og webhenvendelser automatisk, på naturlig norsk, 24 timer i døgnet - til en brøkdel av kostnaden for en ekstra ansatt.",
      },
      {
        type: "p",
        text: "I denne artikkelen ser vi på hvorfor 2026 er året KI-resepsjonisten går fra å være et konkurransefortrinn til å bli en forventning, og vi regner konkret på hvor mye bedriften din kan spare.",
      },
      { type: "h2", text: "Hva er en KI-resepsjonist?" },
      {
        type: "p",
        text: "En KI-resepsjonist (også kalt AI-resepsjonist eller virtuell resepsjonist) er en digital medarbeider drevet av kunstig intelligens. Den tar imot samtaler, svarer på vanlige spørsmål, booker og endrer timer, og setter over til en ansatt når saken faktisk krever et menneske. I motsetning til en telefonsvarer eller et enkelt tastevalg-menysystem forstår den hva kunden faktisk spør om, og løser saken der og da. Vil du se hvordan det fungerer, kan du [snakke med en norsk AI-agent direkte i nettleseren](/#demo).",
      },
      { type: "h2", text: "Derfor er 2026 vendepunktet" },
      {
        type: "p",
        text: "Teknologien har modnet raskt de siste årene. Tre ting skjer samtidig i 2026 og gjør KI-resepsjonisten til et åpenbart valg for norske bedrifter:",
      },
      {
        type: "ul",
        items: [
          "**Naturlig norsk tale i sanntid.** Moderne taleagenter svarer på under 300 millisekunder med naturlig norsk stemme - ikke en robotaktig, oversatt utenlandsk modell. Kunden merker knapt forskjell.",
          "**Kundene forventer svar umiddelbart.** Under fem minutters responstid er blitt normen. Bedrifter som svarer først, vinner kunden - og en KI-resepsjonist svarer alltid på første forsøk.",
          "**GDPR og BankID er løst.** Data hostes i Norge, og sikker identifisering med BankID og Vipps er innebygd. Terskelen for å ta i bruk teknologien er borte.",
        ],
      },
      { type: "h2", text: "5 grunner til at din bedrift bør bruke en KI-resepsjonist" },
      { type: "h3", text: "1. Du mister aldri en henvendelse igjen" },
      {
        type: "p",
        text: "Rundt **6 av 10** kunder ringer aldri tilbake hvis de ikke når deg første gang - de ringer konkurrenten. En KI-resepsjonist svarer alltid, også på kvelder, i helger og i lunsjen, slik at hver henvendelse blir fanget opp og fulgt opp.",
      },
      { type: "h3", text: "2. De ansatte slipper repetitivt arbeid" },
      {
        type: "p",
        text: "En stor andel av henvendelsene er de samme spørsmålene om og om igjen: åpningstider, priser, booking, ordrestatus. Når KI-resepsjonisten tar disse, frigjøres de ansatte til arbeidet som faktisk krever et menneske.",
      },
      { type: "h3", text: "3. Skalerer uten nyansettelser" },
      {
        type: "p",
        text: "Doble henvendelsesmengden, og en menneskelig resepsjon må ansette flere. En KI-resepsjonist håndterer hundre samtaler like enkelt som én, uten ekstra kostnad per samtale.",
      },
      { type: "h3", text: "4. Konsistent kvalitet og full oversikt" },
      {
        type: "p",
        text: "Agenten svarer likt hver gang, glemmer aldri en detalj og logger alt. Du følger samtaler, konvertering og vanlige spørsmål i et dashbord - innsikt du sjelden får fra et tradisjonelt sentralbord.",
      },
      { type: "h3", text: "5. Rask å komme i gang med" },
      {
        type: "p",
        text: "Oppsettet tar rundt 7 dager og krever ingen utvikler. Agenten lærer av dokumentene og FAQ-en deres, og dere godkjenner svarene før den går live.",
      },
      { type: "h2", text: "Hvordan en KI-resepsjonist sparer bedriften din penger" },
      {
        type: "p",
        text: "Besparelsen kommer fra to hold samtidig: **lavere kostnader** på å håndtere henvendelser, og **høyere omsetning** fra henvendelser du tidligere mistet. La oss se på kostnadssiden først.",
      },
      {
        type: "table",
        headers: ["", "Menneskelig resepsjonist", "KI-resepsjonist"],
        rows: [
          ["Årlig kostnad", "~585 000 kr", "fra ~90 000 kr"],
          ["Tilgjengelighet", "8 t/dag, hverdager", "24/7, hele året"],
          ["Sykefravær og ferie", "Ja - krever vikar", "Aldri fravær"],
          ["Samtaler samtidig", "1 av gangen", "Ubegrenset"],
          ["Skalering", "Ny ansettelse", "Ingen ekstra kostnad"],
        ],
      },
      {
        type: "p",
        text: "En resepsjonist i Norge koster typisk 450 000 kr i årslønn, og med arbeidsgiveravgift, pensjon og andre sosiale kostnader lander den reelle kostnaden ofte rundt 585 000 kr i året - for én person som dekker vanlig arbeidstid. En KI-resepsjonist dekker hele døgnet fra rundt 90 000 kr i året.",
      },
      { type: "h2", text: "Regneeksempel: så mye kan du spare" },
      {
        type: "p",
        text: "Se for deg en bedrift som i dag har én resepsjonist til å ta telefonen på dagtid, og som vurderer å ansette en person til for å dekke mer av døgnet og topper i pågang. Alternativet er en KI-resepsjonist på en mellomstor plan:",
      },
      {
        type: "stats",
        items: [
          { value: "585 000 kr", label: "Årlig kostnad for én ekstra ansatt" },
          { value: "90 000 kr", label: "Årlig kostnad for KI-resepsjonist" },
          { value: "~495 000 kr", label: "Potensiell besparelse per år" },
        ],
      },
      {
        type: "p",
        text: "I tillegg kommer de tapte henvendelsene du nå fanger opp. Hvis bedriften i snitt taper bare to kunder i uken på ubesvarte anrop, og hver kunde er verdt 5 000 kr, er det over **500 000 kr i året** i tapt omsetning som en KI-resepsjonist kan hjelpe deg å hente inn.",
      },
      {
        type: "callout",
        title: "Merk",
        text: "Tallene over er illustrative og vil variere med bransje, volum og hvordan løsningen settes opp. De viser størrelsesorden, ikke en garanti. Vil du ha et estimat for din bedrift, [book en gratis demo](/#book) så regner vi på det sammen.",
      },
      { type: "h2", text: "Mer enn kostnadskutt: økt omsetning" },
      {
        type: "p",
        text: "Det er lett å tenke på en KI-resepsjonist bare som en måte å kutte kostnader på, men den største gevinsten for mange er på topplinjen. Når du svarer raskt og alltid, konverterer flere henvendelser til kunder. Kvelds- og helgehenvendelser som før forsvant, blir nå til bookinger og salg. For mange bedrifter betaler løsningen for seg selv på det ene alene.",
      },
      { type: "h2", text: "Slik kommer du i gang" },
      {
        type: "ol",
        items: [
          "**Kartlegg henvendelsene dine.** Hvor mange anrop, chatter og skjemaer får dere, og hvor mange går ubesvart?",
          "**Prøv en agent gratis.** Test en norsk AI-agent i nettleseren og kjenn på kvaliteten før du bestemmer deg.",
          "**Sett opp og gå live på 7 dager.** Agenten lærer av innholdet deres, dere godkjenner svarene, og så er den i drift.",
        ],
      },
      {
        type: "p",
        text: "En KI-resepsjonist er ikke lenger et eksperiment for de teknologitunge selskapene - i 2026 er det en praktisk måte å svare kundene bedre og bruke mindre penger på det. Vil du se hva det betyr for din bedrift, kan du [snakke med agenten nå](/#demo) eller [booke en live-demo](/#book).",
      },
    ],
    faq: [
      {
        q: "Hvor mye koster en KI-resepsjonist?",
        a: "Prisen avhenger av volum, men starter typisk rundt 2 500 kr i måneden for mindre bedrifter, mot rundt 585 000 kr i året for en menneskelig resepsjonist som kun dekker vanlig arbeidstid. Chat er ofte inkludert, og du betaler for taleminutter.",
      },
      {
        q: "Erstatter en KI-resepsjonist de ansatte?",
        a: "Nei, den avlaster dem. KI-resepsjonisten tar de repetitive henvendelsene og er tilgjengelig døgnet rundt, mens de ansatte kobles inn når en sak faktisk krever et menneske. Resultatet er lavere kostnad per henvendelse og bedre tilgjengelighet.",
      },
      {
        q: "Hvor raskt kan bedriften min komme i gang?",
        a: "Vanligvis rundt 7 dager fra signert avtale. Agenten lærer av dokumentene og FAQ-en deres, og dere godkjenner svarene før den går live. Det kreves ingen utvikler.",
      },
      {
        q: "Snakker KI-resepsjonisten ordentlig norsk?",
        a: "Ja. Den er bygget for norsk med naturlig stemme som svarer på under 300 millisekunder - ikke en oversatt utenlandsk modell. Data hostes i Norge og er GDPR-kompatibelt.",
      },
    ],
  },
];

export function getAllPosts(): BlogPost[] {
  return [...posts].sort(
    (a, b) => new Date(b.datePublished).getTime() - new Date(a.datePublished).getTime(),
  );
}

export function getPost(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}
