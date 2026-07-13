import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getAllPosts, readingTimeMinutes, formatDate } from "@/lib/blog";
import { siteConfig } from "@/lib/site";

const mono = "var(--font-space-mono), monospace";

export const metadata: Metadata = {
  title: "Blogg om KI-resepsjonist og AI-kundeservice",
  description:
    "Guider og innsikt om KI-resepsjonister, AI-kundeservice og automatisering for norske bedrifter. Lær hvordan du sparer penger og aldri mister en henvendelse.",
  alternates: { canonical: "/blog" },
  openGraph: {
    type: "website",
    locale: "nb_NO",
    url: `${siteConfig.url}/blog`,
    siteName: siteConfig.name,
    title: "Blogg om KI-resepsjonist og AI-kundeservice | KI Consult",
    description:
      "Guider og innsikt om KI-resepsjonister, AI-kundeservice og automatisering for norske bedrifter.",
  },
};

export default function BlogIndex() {
  const allPosts = getAllPosts();

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: `${siteConfig.name} Blogg`,
      url: `${siteConfig.url}/blog`,
      inLanguage: "nb-NO",
      publisher: {
        "@type": "Organization",
        name: siteConfig.name,
        url: siteConfig.url,
        logo: `${siteConfig.url}/icon.png`,
      },
      blogPost: allPosts.map((post) => ({
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        url: `${siteConfig.url}/blog/${post.slug}`,
        datePublished: post.datePublished,
        dateModified: post.dateModified,
        author: { "@type": "Organization", name: post.author },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Hjem", item: siteConfig.url },
        { "@type": "ListItem", position: 2, name: "Blogg", item: `${siteConfig.url}/blog` },
      ],
    },
  ];

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SiteHeader />

      {/* HERO */}
      <section
        style={{
          background: "#0B2118",
          backgroundImage:
            "radial-gradient(1100px 520px at 72% -8%, rgba(21,192,124,0.20), transparent 62%)",
          color: "#EFEDE2",
        }}
      >
        <div
          className="section-inner"
          style={{ maxWidth: 820, margin: "0 auto", padding: "72px 32px 64px" }}
        >
          <div
            style={{
              fontFamily: mono,
              fontSize: 13,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#3FE0A0",
              fontWeight: 700,
            }}
          >
            Blogg
          </div>
          <h1
            style={{
              fontSize: "clamp(34px,4.6vw,58px)",
              lineHeight: 1.04,
              letterSpacing: "-0.035em",
              fontWeight: 800,
              margin: "18px 0 0",
              textWrap: "balance",
            }}
          >
            Innsikt om KI-resepsjonist og AI-kundeservice
          </h1>
          <p
            style={{
              fontSize: 19,
              lineHeight: 1.5,
              color: "#AFC0B5",
              margin: "20px 0 0",
              maxWidth: "56ch",
            }}
          >
            Praktiske guider om hvordan norske bedrifter bruker AI til å svare kundene
            raskere, spare penger og aldri miste en henvendelse.
          </p>
        </div>
      </section>

      {/* POST LIST */}
      <section className="section-pad" style={{ background: "#F3EFE4", padding: "72px 0 96px" }}>
        <div
          className="section-inner"
          style={{ maxWidth: 820, margin: "0 auto", padding: "0 32px" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {allPosts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="blog-card"
                style={{
                  display: "block",
                  background: "#FBFAF4",
                  border: "1px solid #E2DCCB",
                  borderRadius: 18,
                  padding: 30,
                  textDecoration: "none",
                  color: "#16190F",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    fontFamily: mono,
                    fontSize: 12.5,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#15A06A",
                    fontWeight: 700,
                  }}
                >
                  <span>{post.category}</span>
                  <span style={{ color: "#C9C3B2" }}>·</span>
                  <span style={{ color: "#8A8B7C" }}>{readingTimeMinutes(post)} min lesing</span>
                </div>
                <h2
                  style={{
                    fontSize: "clamp(23px,2.6vw,30px)",
                    lineHeight: 1.15,
                    letterSpacing: "-0.02em",
                    fontWeight: 800,
                    margin: "14px 0 10px",
                    textWrap: "balance",
                  }}
                >
                  {post.title}
                </h2>
                <p style={{ fontSize: 16.5, lineHeight: 1.55, color: "#4A4D40", margin: 0 }}>
                  {post.excerpt}
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 18,
                    fontSize: 14,
                    color: "#8A8B7C",
                  }}
                >
                  <span>{formatDate(post.datePublished)}</span>
                  <span style={{ color: "#15A06A", fontWeight: 700 }}>Les mer →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
