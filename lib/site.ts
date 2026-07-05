// Central site configuration. If the production domain differs, change `url`
// here only — metadata, sitemap, robots and JSON-LD all read from this.
export const siteConfig = {
  name: "KI Consult",
  // www is the canonical serving host — the apex domain 308-redirects to it,
  // and Google indexes the site under www.
  url: "https://www.kiconsult.no",
  title: "KI-resepsjonist på norsk – AI-kundeservice for telefon, chat & web | KI Consult",
  description:
    "Norskutviklet KI-resepsjonist som svarer telefonen, chatten og webhenvendelsene dine 24/7. Naturlig norsk stemme, BankID & Vipps, GDPR og hostet i Norge. Prøv gratis demo.",
  phone: "+47 934 38 816",
  email: "hei@kiconsult.no",
  locality: "Oslo",
  country: "NO",
  keywords: [
    "KI resepsjonist",
    "KI-resepsjonist",
    "AI resepsjonist",
    "virtuell resepsjonist",
    "digital resepsjonist",
    "AI sentralbord",
    "KI sentralbord",
    "AI svartjeneste",
    "AI telefonsvarer",
    "AI kundeservice",
    "KI kundeservice",
    "AI-agent",
    "KI-agent",
    "AI telefoni",
    "AI chatbot norsk",
    "automatisert kundeservice",
    "norsk AI stemme",
    "kundeservice automatisering",
    "taleagent",
    "BankID",
    "Vipps",
  ],
} as const;
