# AdSnoop Insights: editor's guide

Articles live in `content/insights/articles/` as Markdown files. Each deploy turns them into fast, fully server-rendered pages at `/insights`. No database or CMS account is needed.

## Add or edit an article

1. Create `content/insights/articles/<url-slug>.md`. The file name becomes the URL, so `roas-vs-poas.md` is published at `/insights/roas-vs-poas`. You can also run `npm run insights:new -- "Your title"` to start from a template.
2. Fill in the frontmatter (see below) and write the body in Markdown. Use `##` and `###` for headings. The title is the page's only H1.
3. Keep `status: draft` while you work. Drafts appear on **preview.adsnoop.co.uk** with a yellow "Draft" banner. They are never built on the live site, are marked noindex and are left out of the sitemap.
4. To publish, set `status: published`, check `publishedAt`, and push to the preview branch. The article goes live on adsnoop.co.uk when preview is merged into `main`.
5. When you make a substantive change to a published article, add `updatedAt: YYYY-MM-DD`.

You can do all of this in GitHub's web editor: open the folder, choose "Add file", and commit to `preview/apple-inspired-adsnoop`.

## Frontmatter

```yaml
title: "Article title shown on the page"
seoTitle: "Optional shorter title for search results (about 55 characters)"
description: "120–160 characters. Used for cards, search results and social previews."
category: measurement-profitability   # a slug from categories.yml
status: draft                         # draft or published
publishedAt: 2026-11-22
updatedAt: 2026-12-01                 # optional
author: AdSnoop Editorial
featured: true                        # optional; picks the large card on /insights
art: roas-poas                        # roas-poas, competitor-lens, format-mix, fatigue-curve, capi-flow, rings
artAlt: "Describe the illustration for screen readers"
keywords: [roas, poas]
related: [other-article-slug]         # optional; otherwise picked from the same category
cta:                                  # the product prompt at the end of the article
  heading: "Short heading"
  text: "One helpful sentence about a real AdSnoop feature."
  label: "Search competitor ads"
  href: "/"                           # "/", "/?q=Brand", "/tracker" or "/meta-updates"
sources:
  - title: "Source title"
    url: "https://…"
    publisher: "Meta for Developers"
    note: "Optional context, such as 'practitioner interpretation'."
```

The build stops with a clear message if a required field is missing, a category is unknown, or an internal link or related article doesn't exist.

## Editorial blocks

```md
:::takeaways
- Bullet points summarising the article
:::

:::impact
### Who this affects
### What changes
### Recommended action
### When no action is needed
:::

:::example Optional subtitle
Clearly labelled as a hypothetical example.
:::

:::verify
Things the reader should check against the official source.
:::

:::note Optional label
A neutral aside.
:::

:::figure poas-waterfall
:::

:::cta heading="Short heading" label="Button text" href="/" placement="inline_method"
One sentence explaining why this AdSnoop feature helps here.
:::
```

To separate confirmed facts from interpretation inline, use `<span class="ins-label">Verified</span>` and `<span class="ins-label-interp">Interpretation</span>`.

## Editorial standards

- Link to the primary source, which is usually Meta's own documentation or announcement, and give dates.
- Don't invent statistics, benchmarks, quotes or dates. If something can't be verified, say so in a `:::verify` block or leave it out.
- Label hypothetical examples as hypothetical.
- Only link to AdSnoop features that exist.
- Use British English.

## Meta news workflow

`npm run insights:news` lists recent Meta advertising updates from the existing `/meta-updates` feed that no article cites yet. `npm run insights:news -- --draft 3` turns item 3 into an unpublished draft. The draft records the original link, source and date, and it carries a skeleton for the "What this means for advertisers" section. Nothing is published automatically. Rewrite every draft in your own words and check it against the source before you set `status: published`.
