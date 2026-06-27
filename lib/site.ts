// Central site configuration. If the production domain differs, change `url`
// here only — metadata, sitemap, robots and JSON-LD all read from this.
export const siteConfig = {
  name: "KI Consult",
  url: "https://kiconsult.no",
  title: "AI-kundeservice på norsk – telefon, chat & web | KI Consult",
  description:
    "Norskutviklet AI-agent som svarer kunder på telefon, chat og web døgnet rundt. Naturlig norsk stemme, BankID & Vipps, GDPR og hostet i Norge. Prøv gratis demo.",
  phone: "+47 934 38 816",
  email: "hei@kiconsult.no",
  locality: "Oslo",
  country: "NO",
  keywords: [
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
    "virtuell resepsjonist",
    "AI resepsjonist",
    "BankID",
    "Vipps",
  ],
} as const;
