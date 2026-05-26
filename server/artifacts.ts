import type {
  ChecklistItem,
  HtmlTemplateBundle,
  KeywordRow,
  PromptBundle,
  Site,
  WorkflowBundle
} from "../shared/types.js";

export function generateArtifacts(site: Site): Site {
  const keywords = generateKeywordPlan(site);
  const prompts = generatePrompts(site);
  const workflow = generateWorkflow(site, prompts);
  const htmlTemplate = generateHtmlTemplate(site);

  return {
    ...site,
    keywords,
    prompts,
    workflow,
    htmlTemplate,
    status: "template",
    updatedAt: new Date().toISOString()
  };
}

export function generateKeywordPlan(site: Site): KeywordRow[] {
  const host = new URL(site.url).hostname.replace(/^www\./, "");
  const brandName = site.name || host;
  const languagePrefix = site.language === "he" ? "HE" : "EN";
  const baseTerms = Array.from(
    new Set([
      brandName,
      `${brandName} services`,
      `${brandName} pricing`,
      `${brandName} blog`,
      `${brandName} guide`,
      `${host.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")} contact`
    ])
  );

  return baseTerms.map((keyword, index) => ({
    id: `kw-${index + 1}`,
    keyword,
    volume: null,
    difficulty: null,
    cpc: null,
    currentRank: null,
    clusterGroup: `${languagePrefix} seed cluster ${index < 2 ? "brand" : "content"}`,
    source: index < 2 ? "brand" : "sitemap"
  }));
}

export function generatePrompts(site: Site): PromptBundle {
  const vars = {
    WEBSITE_URL: site.url,
    BRAND_NAME: site.name,
    PRIMARY_COLOR: site.styleProfile.primaryColor,
    SECONDARY_COLOR: site.styleProfile.secondaryColor,
    ACCENT_COLOR: site.styleProfile.accentColor,
    TEXT_COLOR: site.styleProfile.textColor,
    BG_COLOR: site.styleProfile.bgColor,
    BORDER_COLOR: site.styleProfile.borderColor,
    FONT_FAMILY: site.styleProfile.fontFamily,
    RADIUS_PX: site.styleProfile.borderRadius,
    LANGUAGE: site.language,
    DIRECTION: site.direction,
    SITE_TYPE: site.siteType
  };

  const writingBlog = replaceVariables(
    `You are the senior content writer for {{BRAND_NAME}}.

Website: {{WEBSITE_URL}}
Language: {{LANGUAGE}}
Direction: {{DIRECTION}}
Site type: {{SITE_TYPE}}
Audience and tone: practical, expert, locally specific, and conversion-aware. Use the live site's existing voice as the baseline.

Write a complete article for the keyword: {{ $json.keyword }}

Rules:
- Preserve factual accuracy and do not invent contact information.
- Use clear H2/H3 structure, useful examples, and concrete advice.
- Add an FAQ section with questions that help search engines and AI answer engines cite the article.
- Include the author/company context from the site profile.
- Avoid filler, generic claims, and unverifiable statistics.`,
    vars
  );

  const imagePlanning = replaceVariables(
    `Create an image plan for the article generated for {{BRAND_NAME}}.

Website: {{WEBSITE_URL}}
Primary color: {{PRIMARY_COLOR}}
Accent color: {{ACCENT_COLOR}}
Font family reference: {{FONT_FAMILY}}
Article title: {{ $json.title }}
Article keyword: {{ $json.keyword }}

Output:
1. Hero image prompt
2. Two supporting image prompts
3. Alt text for each image
4. Placement notes for the HTML redesign step

Rules:
- Match the client's real brand colors.
- Do not request text-heavy images unless the text is essential.
- Keep image concepts useful, specific, and non-stock-like.`,
    vars
  );

  const htmlRedesign = replaceVariables(
    `Redesign the generated article as WordPress-safe HTML for {{BRAND_NAME}}.

Website: {{WEBSITE_URL}}
Direction: {{DIRECTION}}
Language: {{LANGUAGE}}
Primary color: {{PRIMARY_COLOR}}
Secondary color: {{SECONDARY_COLOR}}
Accent color: {{ACCENT_COLOR}}
Text color: {{TEXT_COLOR}}
Background color: {{BG_COLOR}}
Border color: {{BORDER_COLOR}}
Font family: {{FONT_FAMILY}}
Border radius: {{RADIUS_PX}}

Input article HTML: {{ $json.articleHtml }}

Non-negotiable rules:
- Wrap output in <!-- wp:html --> and <!-- /wp:html -->.
- Scope all CSS under the brand article wrapper class.
- No <script>, inline event handlers, <link>, @import, external fonts, or external scripts.
- Use exactly two responsive breakpoints: 820px and 480px.
- Use <details>/<summary> for FAQ, closed by default.
- Use an unnumbered TOC with <ul>, not <ol>.
- Include the 5-row author block order: header, badges, description, social icons, CTA buttons.
- Preserve all n8n expressions exactly.`,
    vars
  );

  const unresolvedVariables = [writingBlog, imagePlanning, htmlRedesign]
    .join("\n")
    .match(/{{[A-Z0-9_]+}}/g) ?? [];

  return {
    writingBlog,
    imagePlanning,
    htmlRedesign,
    validation: {
      n8nExpressionsIntact: areN8nExpressionsBalanced([writingBlog, imagePlanning, htmlRedesign].join("\n")),
      unresolvedVariables,
      expressionCount: countN8nExpressions([writingBlog, imagePlanning, htmlRedesign].join("\n"))
    }
  };
}

export function generateWorkflow(site: Site, prompts: PromptBundle): WorkflowBundle {
  const missingFields = [
    ["Google Sheets URL", site.googleSheetsUrl],
    ["Webhook URL", site.webhookUrl],
    ["Writing prompt", prompts.writingBlog],
    ["Image prompt", prompts.imagePlanning],
    ["HTML prompt", prompts.htmlRedesign]
  ]
    .filter(([, value]) => !value)
    .map(([label]) => label);

  const json = {
    name: `${site.name} - Blog Publishing Pipeline`,
    active: false,
    nodes: [
      {
        id: "webhook-trigger",
        name: "Webhook Trigger",
        type: "n8n-nodes-base.webhook",
        parameters: {
          path: site.webhookUrl,
          responseMode: "responseNode"
        }
      },
      {
        id: "site-profile",
        name: "Set Site Profile",
        type: "n8n-nodes-base.set",
        parameters: {
          values: {
            string: [
              { name: "siteUrl", value: site.url },
              { name: "language", value: site.language },
              { name: "direction", value: site.direction },
              { name: "primaryColor", value: site.styleProfile.primaryColor }
            ]
          }
        }
      },
      {
        id: "writing-blog",
        name: "Writing Blog Prompt",
        type: "n8n-nodes-base.openAi",
        parameters: {
          prompt: prompts.writingBlog
        }
      },
      {
        id: "image-planning",
        name: "Image Planning Prompt",
        type: "n8n-nodes-base.openAi",
        parameters: {
          prompt: prompts.imagePlanning
        }
      },
      {
        id: "html-redesign",
        name: "HTML Redesign Prompt",
        type: "n8n-nodes-base.openAi",
        parameters: {
          prompt: prompts.htmlRedesign
        }
      },
      {
        id: "google-sheets",
        name: "Update Content Calendar",
        type: "n8n-nodes-base.googleSheets",
        parameters: {
          documentUrl: site.googleSheetsUrl,
          operation: "append"
        }
      }
    ],
    connections: {
      "Webhook Trigger": { main: [[{ node: "Set Site Profile", type: "main", index: 0 }]] },
      "Set Site Profile": { main: [[{ node: "Writing Blog Prompt", type: "main", index: 0 }]] },
      "Writing Blog Prompt": { main: [[{ node: "Image Planning Prompt", type: "main", index: 0 }]] },
      "Image Planning Prompt": { main: [[{ node: "HTML Redesign Prompt", type: "main", index: 0 }]] },
      "HTML Redesign Prompt": { main: [[{ node: "Update Content Calendar", type: "main", index: 0 }]] }
    }
  };

  const nodePreview = [
    {
      id: "webhook-trigger",
      name: "Webhook Trigger",
      type: "n8n webhook",
      status: site.webhookUrl ? "configured" : "needs_attention",
      details: site.webhookUrl || "Webhook URL required"
    },
    {
      id: "writing-blog",
      name: "Writing Blog Prompt",
      type: "LLM prompt node",
      status: prompts.writingBlog ? "configured" : "needs_attention",
      details: `${prompts.writingBlog.length.toLocaleString()} characters`
    },
    {
      id: "image-planning",
      name: "Image Planning Prompt",
      type: "LLM prompt node",
      status: prompts.imagePlanning ? "configured" : "needs_attention",
      details: `${prompts.imagePlanning.length.toLocaleString()} characters`
    },
    {
      id: "html-redesign",
      name: "HTML Redesign Prompt",
      type: "LLM prompt node",
      status: prompts.htmlRedesign ? "configured" : "needs_attention",
      details: `${prompts.htmlRedesign.length.toLocaleString()} characters`
    },
    {
      id: "google-sheets",
      name: "Update Content Calendar",
      type: "Google Sheets",
      status: site.googleSheetsUrl ? "configured" : "needs_attention",
      details: site.googleSheetsUrl || "Google Sheets URL required"
    }
  ] as WorkflowBundle["nodePreview"];

  return {
    json,
    nodePreview,
    validation: {
      configuredNodes: nodePreview.filter((node) => node.status === "configured").length,
      attentionNodes: nodePreview.filter((node) => node.status === "needs_attention").length,
      missingFields
    }
  };
}

export function generateHtmlTemplate(site: Site): HtmlTemplateBundle {
  const brandClass = `${slugify(site.name)}-art`;
  const contactUrl = site.contactPageUrl || site.url;
  const phoneHref = site.phone ? `tel:${site.phone.replace(/[^\d+]/g, "")}` : contactUrl;
  const whatsappHref = site.whatsapp.startsWith("http")
    ? site.whatsapp
    : site.whatsapp
      ? `https://wa.me/${site.whatsapp.replace(/[^\d]/g, "")}`
      : contactUrl;
  const socialLinks = Object.entries(site.socialLinks)
    .filter(([, href]) => href)
    .map(([platform, href]) => `<a href="${escapeAttr(href)}" class="${platform}" rel="nofollow noopener">${platform}</a>`)
    .join("\n        ");
  const radius = site.styleProfile.borderRadius || "10px";

  const html = `<!-- wp:html -->
<div id="top" class="${brandClass}" dir="${site.direction}" lang="${site.language}" style="--primary:${site.styleProfile.primaryColor};--secondary:${site.styleProfile.secondaryColor};--accent:${site.styleProfile.accentColor};--text:${site.styleProfile.textColor};--bg:${site.styleProfile.bgColor};--border:${site.styleProfile.borderColor};--radius:${radius};">
  <style>
    .${brandClass}{max-width:860px;margin:0 auto;color:var(--text);background:var(--bg);font-family:${systemFontStack(site.language)} !important;font-size:16px;line-height:1.8;padding:24px;}
    .${brandClass} *{box-sizing:border-box;}
    .${brandClass} br,.${brandClass} p:empty{display:none !important;}
    .${brandClass} a{color:var(--primary);font-weight:500;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px;}
    .${brandClass} a:hover{color:var(--secondary);background:color-mix(in srgb,var(--primary) 10%,transparent);border-radius:8px;}
    .${brandClass} h1{font-size:38px;line-height:1.15;margin:0 0 18px;font-weight:850;color:var(--text);}
    .${brandClass} h2{font-size:28px;line-height:1.25;margin:38px 0 16px;font-weight:800;border-bottom:2px solid var(--primary);padding-bottom:8px;}
    .${brandClass} h3{font-size:20px;line-height:1.35;margin:28px 0 10px;font-weight:700;}
    .${brandClass} .lead{font-size:19px;line-height:1.75;color:color-mix(in srgb,var(--text) 78%,white);margin:0 0 28px;}
    .${brandClass} .toc,.${brandClass} .note,.${brandClass} .author-block{border:1px solid var(--border);border-radius:var(--radius) !important;box-shadow:${site.styleProfile.shadow} !important;background:#fff;padding:22px;margin:26px 0;}
    .${brandClass} .label{display:flex;align-items:center;gap:10px;font-size:19px;font-weight:800;margin:0 0 14px;}
    .${brandClass} .label::before{content:"";width:5px;height:22px;background:var(--accent);border-radius:6px;}
    .${brandClass} .toc ul{list-style:none;padding:0;margin:0;display:grid;gap:8px;}
    .${brandClass} .check-list{display:grid;gap:12px;padding:0;margin:20px 0;list-style:none;}
    .${brandClass} .check-list li{display:grid;grid-template-columns:24px 1fr;gap:12px;align-items:start;}
    .${brandClass} .check-icon{width:22px;height:22px;border-radius:6px;background:var(--primary);display:inline-grid;place-items:center;margin-top:4px;}
    .${brandClass} .table-wrap{overflow-x:auto;margin:22px 0;border-radius:var(--radius) !important;border:1px solid var(--border);}
    .${brandClass} table{width:100%;border-collapse:collapse;min-width:620px;}
    .${brandClass} th{background:#102a43;color:#fff;text-align:${site.direction === "rtl" ? "right" : "left"};padding:12px 14px;}
    .${brandClass} td{padding:12px 14px;border-bottom:1px solid var(--border);}
    .${brandClass} tr:nth-child(even) td{background:#f7f9fc;}
    .${brandClass} img{max-width:100%;height:auto;max-height:60vh;object-fit:contain;}
    .${brandClass} details{border:1px solid var(--border);border-radius:var(--radius) !important;padding:14px 18px;margin:12px 0;background:#fff;}
    .${brandClass} summary{cursor:pointer;font-weight:750;display:flex;gap:12px;align-items:center;justify-content:space-between;}
    .${brandClass} summary::after{content:"+";font-weight:900;color:var(--primary);}
    .${brandClass} details[open] summary::after{content:"-";}
    .${brandClass} .author-header{display:flex !important;gap:14px;align-items:center;min-height:72px;}
    .${brandClass} .author-logo{width:58px;height:58px;border-radius:16px !important;background:linear-gradient(135deg,var(--primary),var(--secondary));color:#fff;display:grid;place-items:center;font-weight:900;}
    .${brandClass} .badges{display:flex !important;gap:10px;flex-wrap:wrap;margin:16px 0;}
    .${brandClass} .badges span{border:1px solid var(--border);border-radius:999px;padding:7px 12px;background:#fff;font-weight:700;}
    .${brandClass} .socials{display:flex !important;gap:10px;flex-wrap:wrap;margin:18px 0;}
    .${brandClass} .socials a{width:42px;height:42px;border-radius:50% !important;background:#fff;border:1px solid var(--border);display:grid;place-items:center;text-decoration:none;text-transform:capitalize;font-size:11px;}
    .${brandClass} .socials .facebook:hover{background:#1877F2;color:#fff;}
    .${brandClass} .socials .linkedin:hover{background:#0A66C2;color:#fff;}
    .${brandClass} .socials .instagram:hover{background:linear-gradient(135deg,#F58529,#DD2A7B,#8134AF);color:#fff;}
    .${brandClass} .socials .youtube:hover{background:#FF0000;color:#fff;}
    .${brandClass} .socials .tiktok:hover{background:#000;color:#fff;}
    .${brandClass} .cta-row{display:flex !important;gap:14px;flex-wrap:wrap;margin-top:18px;}
    .${brandClass} .cta{display:inline-flex !important;align-items:center;justify-content:center;min-width:160px;padding:14px 32px;border-radius:50px !important;background:color-mix(in srgb,var(--primary) 78%,white);color:#fff;text-decoration:none;font-weight:800;box-shadow:0 10px 24px color-mix(in srgb,var(--primary) 24%,transparent) !important;}
    .${brandClass} .cta:hover{background:var(--secondary);color:#fff;transform:translateY(-1px);}
    .${brandClass} .cta.whatsapp:hover{background:#25D366;color:#fff;}
    .${brandClass} .floating-cluster{position:fixed;right:18px;bottom:18px;display:grid !important;gap:10px;z-index:5;}
    .${brandClass} .floating-action{width:48px;height:48px;border-radius:50% !important;background:#fff;color:var(--primary);border:1px solid var(--border);display:grid;place-items:center;text-decoration:none;box-shadow:0 10px 24px rgba(15,23,42,.14) !important;font-weight:900;}
    @media (max-width:820px){.${brandClass}{padding:18px;}.${brandClass} h1{font-size:32px;}.${brandClass} .author-header{align-items:flex-start;}.${brandClass} .cta{width:100%;}}
    @media (max-width:480px){.${brandClass}{padding:14px;font-size:15px;}.${brandClass} h1{font-size:28px;}.${brandClass} h2{font-size:24px;}.${brandClass} .toc,.${brandClass} .note,.${brandClass} .author-block{padding:16px;}.${brandClass} .floating-cluster{right:12px;bottom:12px;}}
  </style>

  <h1>Sample article title for ${escapeHtml(site.name)}</h1>
  <p class="lead">This preview shows how a generated article will look after the onboarding dashboard applies the live style profile, WordPress rules, CTA structure, and responsive template checks.</p>

  <nav class="toc" aria-label="Table of contents">
    <p class="label">Table of contents</p>
    <ul>
      <li><a href="#section-strategy">Strategy</a></li>
      <li><a href="#section-checklist">Checklist</a></li>
      <li><a href="#section-faq">FAQ</a></li>
    </ul>
  </nav>

  <h2 id="section-strategy">Strategy</h2>
  <p>The article body keeps the site's typography, colors, spacing, and direction while staying safe for WordPress HTML blocks.</p>

  <div class="note">
    <p class="label">Key implementation notes</p>
    <ul class="check-list">
      <li><span class="check-icon"><svg width="13" height="10" viewBox="0 0 13 10" fill="none" aria-hidden="true"><path d="M1 5l3 3 8-7" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>Scoped CSS under the brand article wrapper.</span></li>
      <li><span class="check-icon"><svg width="13" height="10" viewBox="0 0 13 10" fill="none" aria-hidden="true"><path d="M1 5l3 3 8-7" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span>CTA, author block, TOC, FAQ, and responsive breakpoints are included.</span></li>
    </ul>
  </div>

  <h2 id="section-checklist">Checklist</h2>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Rule</th><th>Status</th><th>Note</th></tr></thead>
      <tbody>
        <tr><td>WordPress wrapper</td><td>Pass</td><td>Uses wp:html comments.</td></tr>
        <tr><td>External dependencies</td><td>Pass</td><td>No scripts, fonts, or CSS imports.</td></tr>
        <tr><td>Responsive rules</td><td>Pass</td><td>Includes 820px and 480px breakpoints.</td></tr>
      </tbody>
    </table>
  </div>

  <h2 id="section-faq">FAQ</h2>
  <details>
    <summary>How does this template stay WordPress-safe?</summary>
    <p>It avoids scripts, external assets, global CSS, and unsupported layout dependencies.</p>
  </details>
  <details>
    <summary>Can the colors be edited after discovery?</summary>
    <p>Yes. The dashboard stores the discovered palette and the operator can review it before deployment.</p>
  </details>

  <section class="author-block" aria-label="Author">
    <div class="author-header">
      <div class="author-logo">${initials(site.name)}</div>
      <div>
        <h3>${escapeHtml(site.authorName || site.name)}</h3>
        <p>${escapeHtml(site.name)} editorial and SEO team</p>
      </div>
    </div>
    <div class="badges">
      <span>Brand matched</span>
      <span>Contact verified</span>
      <span>WordPress safe</span>
    </div>
    <p>${escapeHtml(site.authorBio || `Content prepared for ${site.name}.`)}</p>
    <div class="socials">
        ${socialLinks || `<a href="${escapeAttr(site.url)}" rel="nofollow noopener">site</a>`}
    </div>
    <div class="cta-row">
      <a class="cta" href="${escapeAttr(phoneHref)}">Call now</a>
      <a class="cta whatsapp" href="${escapeAttr(whatsappHref)}">WhatsApp</a>
      <a class="cta" href="${escapeAttr(contactUrl)}">Contact us</a>
    </div>
  </section>

  <div class="floating-cluster" aria-label="Quick actions">
    <a class="floating-action backtop" href="#top" aria-label="Back to top">Top</a>
    <a class="floating-action contact" href="${escapeAttr(contactUrl)}" aria-label="Contact us">Contact</a>
  </div>
</div>
<!-- /wp:html -->`;

  return {
    html,
    checklist: runHtmlChecklist(html, brandClass, site)
  };
}

export function runHtmlChecklist(html: string, brandClass: string, site: Site): ChecklistItem[] {
  const lowered = html.toLowerCase();
  const wrapperMatches = (html.match(/class="floating-cluster"/g) ?? []).length;
  const backtopMatches = (html.match(/class="floating-action backtop"/g) ?? []).length;
  const contactMatches = (html.match(/class="floating-action contact"/g) ?? []).length;

  return [
    {
      id: "wp-wrapper",
      label: "WordPress wrapper present",
      passed: html.includes("<!-- wp:html -->") && html.includes("<!-- /wp:html -->"),
      detail: "Checks wp:html opening and closing comments."
    },
    {
      id: "no-scripts",
      label: "No script or inline handlers",
      passed: !/<script\b/i.test(html) && !/\son[a-z]+\s*=/i.test(html),
      detail: "Rejects script tags and inline event handlers."
    },
    {
      id: "no-external-assets",
      label: "No external asset dependencies",
      passed: !/<link\b/i.test(html) && !/@import/i.test(html) && !/fonts\.googleapis/i.test(html),
      detail: "Allows normal anchors, blocks CSS imports and external font links."
    },
    {
      id: "scoped-css",
      label: "CSS is scoped",
      passed: new RegExp(`\\.${brandClass}`).test(html) && !/\n\s*(body|html|:root)\s*\{/i.test(html),
      detail: `Expected selectors under .${brandClass}.`
    },
    {
      id: "breakpoints",
      label: "Two responsive breakpoints",
      passed: html.includes("@media (max-width:820px)") && html.includes("@media (max-width:480px)"),
      detail: "Requires 820px and 480px media queries."
    },
    {
      id: "toc-ul",
      label: "TOC uses unnumbered list",
      passed: /<nav class="toc"[\s\S]*<ul>[\s\S]*<\/ul>[\s\S]*<\/nav>/i.test(html) && !/<ol\b/i.test(html),
      detail: "The TOC is a ul and no ordered list is emitted."
    },
    {
      id: "faq-closed",
      label: "FAQ closed by default",
      passed: !/<details\s+open\b/i.test(html),
      detail: "Details elements do not use the open attribute."
    },
    {
      id: "floating-cluster",
      label: "Floating cluster has exactly two buttons",
      passed: wrapperMatches === 1 && backtopMatches === 1 && contactMatches === 1,
      detail: `Found cluster ${wrapperMatches}, backtop ${backtopMatches}, contact ${contactMatches}.`
    },
    {
      id: "whatsapp-hover",
      label: "WhatsApp hover uses brand green",
      passed: html.includes("#25D366"),
      detail: "Checks WhatsApp hover color."
    },
    {
      id: "direction",
      label: "Language direction set",
      passed: html.includes(`dir="${site.direction}"`) && html.includes(`lang="${site.language}"`),
      detail: `Expected ${site.direction}/${site.language}.`
    }
  ];
}

function replaceVariables(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((output, [key, value]) => output.replaceAll(`{{${key}}}`, value), template);
}

function areN8nExpressionsBalanced(value: string) {
  const opens = value.match(/{{/g)?.length ?? 0;
  const closes = value.match(/}}/g)?.length ?? 0;
  return opens === closes;
}

function countN8nExpressions(value: string) {
  return value.match(/{{\s*[$\w][\s\S]*?}}/g)?.length ?? 0;
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "site"
  );
}

function systemFontStack(language: string) {
  if (language === "he") {
    return "Arial, 'Noto Sans Hebrew', 'Segoe UI', sans-serif";
  }

  return "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
}

function initials(value: string) {
  const letters = value
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return escapeHtml(letters || "S");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value: string) {
  return escapeHtml(value);
}
