import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import {
  getAllPosts,
  getPost,
  readingTimeMinutes,
  tableOfContents,
  slugifyHeading,
  formatDate,
  type Block,
} from "@/lib/blog";
import { siteConfig } from "@/lib/site";

const mono = "var(--font-space-mono), monospace";

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};

  const url = `${siteConfig.url}/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      locale: "nb_NO",
      url,
      siteName: siteConfig.name,
      title: post.title,
      description: post.description,
      publishedTime: post.datePublished,
      modifiedTime: post.dateModified,
      authors: [post.author],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

/** Enkel inline-parser: **fet** og [lenketekst](/url). */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      nodes.push(<strong key={key++}>{match[1]}</strong>);
    } else {
      const href = match[3];
      const internal = href.startsWith("/") || href.startsWith("#");
      nodes.push(
        <a
          key={key++}
          href={href}
          style={{ color: "#15A06A", fontWeight: 600, textDecoration: "none" }}
          {...(internal ? {} : { target: "_blank", rel: "noopener noreferrer" })}
        >
          {match[2]}
        </a>,
      );
    }
    last = regex.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderBlock(block: Block, i: number): ReactNode {
  switch (block.type) {
    case "p":
      return (
        <p key={i} style={{ fontSize: 18, lineHeight: 1.72, color: "#33362B", margin: "0 0 22px" }}>
          {renderInline(block.text)}
        </p>
      );
    case "h2":
      return (
        <h2
          key={i}
          id={slugifyHeading(block.text)}
          style={{
            fontSize: "clamp(25px,3vw,34px)",
            lineHeight: 1.18,
            letterSpacing: "-0.025em",
            fontWeight: 800,
            margin: "44px 0 16px",
            scrollMarginTop: 90,
            textWrap: "balance",
          }}
        >
          {renderInline(block.text)}
        </h2>
      );
    case "h3":
      return (
        <h3
          key={i}
          style={{
            fontSize: 21,
            lineHeight: 1.3,
            letterSpacing: "-0.015em",
            fontWeight: 700,
            margin: "30px 0 10px",
          }}
        >
          {renderInline(block.text)}
        </h3>
      );
    case "ul":
    case "ol": {
      const Tag = block.type === "ul" ? "ul" : "ol";
      return (
        <Tag
          key={i}
          style={{
            fontSize: 18,
            lineHeight: 1.65,
            color: "#33362B",
            margin: "0 0 22px",
            paddingLeft: 22,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote
          key={i}
          style={{
            margin: "0 0 24px",
            padding: "6px 0 6px 22px",
            borderLeft: "3px solid #15C07C",
            fontSize: 20,
            lineHeight: 1.55,
            fontStyle: "italic",
            color: "#22251C",
          }}
        >
          {renderInline(block.text)}
          {block.cite && (
            <cite style={{ display: "block", marginTop: 8, fontSize: 14, fontStyle: "normal", color: "#8A8B7C" }}>
              - {block.cite}
            </cite>
          )}
        </blockquote>
      );
    case "callout":
      return (
        <div
          key={i}
          style={{
            background: "#0B2118",
            color: "#D8E4DC",
            borderRadius: 16,
            padding: "22px 26px",
            margin: "0 0 26px",
          }}
        >
          {block.title && (
            <div
              style={{
                fontFamily: mono,
                fontSize: 12,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#3FE0A0",
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              {block.title}
            </div>
          )}
          <p style={{ fontSize: 16, lineHeight: 1.6, margin: 0 }}>{renderInline(block.text)}</p>
        </div>
      );
    case "stats":
      return (
        <div
          key={i}
          className="grid-3"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${block.items.length},1fr)`,
            gap: 14,
            margin: "8px 0 30px",
          }}
        >
          {block.items.map((item, j) => (
            <div
              key={j}
              style={{ background: "#FBFAF4", border: "1px solid #E6E0D0", borderRadius: 14, padding: 22 }}
            >
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", color: "#15A06A" }}>
                {item.value}
              </div>
              <div style={{ fontSize: 14.5, lineHeight: 1.4, color: "#4A4D40", marginTop: 6 }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>
      );
    case "figure":
      return (
        <figure key={i} style={{ margin: "6px 0 30px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static
              first-party SVG diagrams; next/image adds nothing for these */}
          <img
            src={block.src}
            alt={block.alt}
            loading="lazy"
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              borderRadius: 16,
              border: "1px solid #E6E0D0",
            }}
          />
          {block.caption && (
            <figcaption
              style={{ marginTop: 10, fontSize: 14, lineHeight: 1.5, color: "#8A8B7C" }}
            >
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
    case "table":
      return (
        <div key={i} style={{ overflowX: "auto", margin: "0 0 28px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15.5, minWidth: 460 }}>
            <thead>
              <tr>
                {block.headers.map((h, j) => (
                  <th
                    key={j}
                    style={{
                      textAlign: "left",
                      padding: "12px 14px",
                      borderBottom: "2px solid #0B2118",
                      fontWeight: 700,
                      color: "#16190F",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} style={{ background: r % 2 ? "#FBFAF4" : "transparent" }}>
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      style={{
                        padding: "12px 14px",
                        borderBottom: "1px solid #E6E0D0",
                        color: c === 0 ? "#16190F" : "#4A4D40",
                        fontWeight: c === 0 ? 700 : 400,
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const url = `${siteConfig.url}/blog/${post.slug}`;
  const toc = tableOfContents(post);

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      inLanguage: "nb-NO",
      datePublished: post.datePublished,
      dateModified: post.dateModified,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      url,
      // Per-post OG card (app/blog/[slug]/opengraph-image.tsx) + any figures
      // used in the article, so Google's rich results get real media.
      image: [
        `${url}/opengraph-image`,
        ...post.body
          .filter((b): b is Extract<Block, { type: "figure" }> => b.type === "figure")
          .map((b) => `${siteConfig.url}${b.src}`),
      ],
      author: { "@type": "Organization", name: post.author, url: siteConfig.url },
      publisher: {
        "@type": "Organization",
        name: siteConfig.name,
        url: siteConfig.url,
        logo: { "@type": "ImageObject", url: `${siteConfig.url}/icon.png` },
      },
      keywords: post.keywords.join(", "),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Hjem", item: siteConfig.url },
        { "@type": "ListItem", position: 2, name: "Blogg", item: `${siteConfig.url}/blog` },
        { "@type": "ListItem", position: 3, name: post.title, item: url },
      ],
    },
    ...(post.faq
      ? [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: post.faq.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          },
        ]
      : []),
  ];

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SiteHeader />

      {/* ARTICLE HERO */}
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
          style={{ maxWidth: 760, margin: "0 auto", padding: "60px 32px 56px" }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              fontFamily: mono,
              fontSize: 13,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#3FE0A0",
              fontWeight: 700,
            }}
          >
            <Link href="/blog" style={{ textDecoration: "none", color: "#3FE0A0" }}>
              Blogg
            </Link>
            <span style={{ opacity: 0.5 }}>/</span>
            <span style={{ color: "#9FB3A7" }}>{post.category}</span>
          </div>
          <h1
            style={{
              fontSize: "clamp(32px,4.4vw,54px)",
              lineHeight: 1.05,
              letterSpacing: "-0.035em",
              fontWeight: 800,
              margin: "18px 0 0",
              textWrap: "balance",
            }}
          >
            {post.title}
          </h1>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: 22,
              fontSize: 14.5,
              color: "#9FB3A7",
            }}
          >
            <span>{post.author}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{formatDate(post.datePublished)}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{readingTimeMinutes(post)} min lesing</span>
          </div>
        </div>
      </section>

      {/* ARTICLE BODY */}
      <article className="section-pad" style={{ background: "#F3EFE4", padding: "56px 0 40px" }}>
        <div
          className="section-inner"
          style={{ maxWidth: 760, margin: "0 auto", padding: "0 32px" }}
        >
          <p style={{ fontSize: 20, lineHeight: 1.6, color: "#4A4D40", margin: "0 0 32px", fontWeight: 500 }}>
            {post.excerpt}
          </p>

          {toc.length > 2 && (
            <nav
              aria-label="Innhold"
              style={{
                background: "#FBFAF4",
                border: "1px solid #E2DCCB",
                borderRadius: 14,
                padding: "20px 24px",
                margin: "0 0 36px",
              }}
            >
              <div
                style={{
                  fontFamily: mono,
                  fontSize: 12,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#15A06A",
                  fontWeight: 700,
                  marginBottom: 12,
                }}
              >
                Innhold
              </div>
              <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                {toc.map((item) => (
                  <li key={item.id} style={{ fontSize: 15.5, lineHeight: 1.4 }}>
                    <a href={`#${item.id}`} className="nav-link" style={{ textDecoration: "none", color: "#33362B" }}>
                      {item.text}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          {post.body.map((block, i) => renderBlock(block, i))}

          {/* FAQ */}
          {post.faq && post.faq.length > 0 && (
            <div style={{ marginTop: 48 }}>
              <h2
                style={{
                  fontSize: "clamp(25px,3vw,34px)",
                  lineHeight: 1.18,
                  letterSpacing: "-0.025em",
                  fontWeight: 800,
                  margin: "0 0 20px",
                }}
              >
                Ofte stilte spørsmål
              </h2>
              {post.faq.map((item, i) => (
                <div
                  key={i}
                  style={{
                    background: "#FBFAF4",
                    border: "1px solid #E2DCCB",
                    borderRadius: 14,
                    padding: "22px 24px",
                    marginBottom: 12,
                  }}
                >
                  <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", margin: "0 0 8px" }}>
                    {item.q}
                  </h3>
                  <p style={{ fontSize: 15.5, lineHeight: 1.6, color: "#4A4D40", margin: 0 }}>{item.a}</p>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 40 }}>
            <Link href="/blog" style={{ color: "#15A06A", fontWeight: 700, textDecoration: "none", fontSize: 16 }}>
              ← Tilbake til bloggen
            </Link>
          </div>
        </div>
      </article>

      {/* CTA */}
      <section
        className="section-pad"
        style={{
          background: "#0B2118",
          backgroundImage:
            "radial-gradient(800px 400px at 50% 0%, rgba(21,192,124,0.18), transparent 60%)",
          color: "#EFEDE2",
          padding: "88px 0",
        }}
      >
        <div
          className="section-inner"
          style={{ maxWidth: 680, margin: "0 auto", padding: "0 32px", textAlign: "center" }}
        >
          <h2
            style={{
              fontSize: "clamp(28px,3.8vw,46px)",
              lineHeight: 1.06,
              letterSpacing: "-0.035em",
              fontWeight: 800,
              textWrap: "balance",
            }}
          >
            Klar til å aldri miste en henvendelse?
          </h2>
          <p style={{ fontSize: 18, lineHeight: 1.5, color: "#B4C5BB", margin: "20px auto 0", maxWidth: "48ch" }}>
            Prøv en norsk AI-agent gratis, eller book en live-demo så viser vi hvordan
            KI-resepsjonisten fungerer for din bedrift.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 32, flexWrap: "wrap" }}>
            <Link
              href="/#demo"
              className="btn-primary"
              style={{
                color: "#08231A",
                fontWeight: 700,
                fontSize: 17,
                padding: "16px 30px",
                borderRadius: 13,
                textDecoration: "none",
                boxShadow: "0 12px 34px rgba(21,192,124,0.34)",
              }}
            >
              Snakk med AI-agenten →
            </Link>
            <Link
              href="/#book"
              className="btn-outline"
              style={{
                background: "transparent",
                color: "#EFEDE2",
                fontWeight: 600,
                fontSize: 17,
                padding: "16px 28px",
                borderRadius: 13,
                textDecoration: "none",
              }}
            >
              Book en demo →
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
