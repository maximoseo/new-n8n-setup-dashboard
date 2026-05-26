import { load } from "cheerio";
import type { CheerioAPI } from "cheerio";
import type {
  DiscoveryCheck,
  Site,
  SiteInput,
  SiteLanguage,
  SiteType,
  SocialLinks,
  StyleProfile
} from "../shared/types.js";

interface FetchResult {
  url: string;
  ok: boolean;
  status: number;
  contentType: string;
  text: string;
}

const fallbackPalette = ["#1d4ed8", "#0f766e", "#f59e0b", "#111827", "#ffffff", "#d9dee8"];

export async function discoverSite(input: SiteInput, currentSite: Site): Promise<Site> {
  const baseUrl = normalizeUrl(input.url);
  const checks: DiscoveryCheck[] = [
    { id: "homepage", label: "Homepage HTML fetched", status: "running" },
    { id: "sitemap", label: "Sitemap discovered", status: "pending" },
    { id: "about", label: "About page found", status: "pending" },
    { id: "brand", label: "Brand colors and typography extracted", status: "pending" },
    { id: "logo", label: "Logo URL verified", status: "pending" },
    { id: "contact", label: "Contact and social links extracted", status: "pending" }
  ];

  const home = await fetchText(baseUrl);
  checks[0] = {
    ...checks[0],
    status: home.ok ? "pass" : "fail",
    message: home.ok ? `${home.status} ${home.contentType}` : `Fetch failed with ${home.status}`
  };

  if (!home.ok) {
    return {
      ...currentSite,
      checks,
      updatedAt: now()
    };
  }

  const $ = load(home.text);
  const title = cleanText($("title").first().text());
  const metaDescription = cleanText(
    $('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content") ?? ""
  );
  const language = input.language ?? detectLanguage($, home.text);
  const direction = language === "he" ? "rtl" : "ltr";
  const sitemapUrl = input.sitemapUrl || (await discoverSitemap(baseUrl, checks));
  const linkTargets = extractLinkTargets($, baseUrl);
  const aboutPageUrl = input.aboutPageUrl || findRelevantLink(linkTargets, ["about", "about-us", "אודות", "מי אנחנו"]);
  const contactPageUrl = findRelevantLink(linkTargets, ["contact", "contact-us", "צור קשר", "contacto"]);
  const contactHtml = contactPageUrl ? await fetchText(contactPageUrl) : undefined;
  const aboutHtml = aboutPageUrl ? await fetchText(aboutPageUrl) : undefined;

  checks[1] = {
    ...checks[1],
    status: sitemapUrl ? "pass" : "warn",
    message: sitemapUrl || "No sitemap found in common paths or robots.txt"
  };
  checks[2] = {
    ...checks[2],
    status: aboutPageUrl ? "pass" : "warn",
    message: aboutPageUrl || "No About link matched common labels"
  };

  const cssText = await fetchStylesheetText($, baseUrl);
  const combinedHtml = [home.text, contactHtml?.text ?? "", aboutHtml?.text ?? "", cssText].join("\n");
  const palette = extractPalette(combinedHtml);
  const styleProfile = buildStyleProfile(combinedHtml, palette);
  const logoUrl = findLogoUrl($, baseUrl);
  const logoVerified = logoUrl ? await verifyImageUrl(logoUrl) : false;
  const socialLinks = extractSocialLinks(linkTargets);
  const contactText = `${$.text()} ${contactHtml?.text ?? ""}`;
  const phone = extractPhone(contactText);
  const whatsapp = extractWhatsapp(linkTargets, contactText) || phone;
  const siteType = input.siteType ?? detectSiteType(combinedHtml, linkTargets);

  checks[3] = {
    ...checks[3],
    status: palette.length >= 3 ? "pass" : "warn",
    message: `${palette.length} colors found; font: ${styleProfile.fontFamily}`
  };
  checks[4] = {
    ...checks[4],
    status: logoVerified ? "pass" : logoUrl ? "fail" : "warn",
    message: logoUrl ? `${logoUrl}${logoVerified ? "" : " did not return image/*"}` : "No logo image candidate found"
  };
  checks[5] = {
    ...checks[5],
    status: phone || Object.keys(socialLinks).length ? "pass" : "warn",
    message: `${phone ? `Phone ${phone}` : "No phone"}; ${Object.keys(socialLinks).length} social links`
  };

  return {
    ...currentSite,
    url: baseUrl,
    name: deriveSiteName(title, baseUrl),
    language,
    direction,
    siteType,
    sitemapUrl,
    aboutPageUrl,
    contactPageUrl,
    styleProfile,
    logoUrl,
    logoVerified,
    phone,
    whatsapp,
    socialLinks,
    authorName: deriveSiteName(title, baseUrl),
    authorBio: metaDescription || `Editorial team for ${new URL(baseUrl).hostname}`,
    status: "discovery",
    checks,
    updatedAt: now()
  };
}

function now() {
  return new Date().toISOString();
}

export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  url.hash = "";
  return url.toString();
}

async function fetchText(url: string): Promise<FetchResult> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "NewSiteOnboardingDashboard/0.1 (+discovery)" },
      signal: AbortSignal.timeout(12000)
    });
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();

    return {
      url,
      ok: response.ok,
      status: response.status,
      contentType,
      text
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      contentType: "",
      text: String(error)
    };
  }
}

async function discoverSitemap(baseUrl: string, checks: DiscoveryCheck[]) {
  const url = new URL(baseUrl);
  const candidates = [
    new URL("/sitemap.xml", url.origin).toString(),
    new URL("/sitemap_index.xml", url.origin).toString()
  ];

  const robots = await fetchText(new URL("/robots.txt", url.origin).toString());
  if (robots.ok) {
    for (const line of robots.text.split(/\r?\n/)) {
      const match = line.match(/^sitemap:\s*(.+)$/i);
      if (match?.[1]) {
        candidates.unshift(match[1].trim());
      }
    }
  }

  for (const candidate of Array.from(new Set(candidates))) {
    const result = await fetchText(candidate);
    const looksLikeSitemap = /<(urlset|sitemapindex)\b/i.test(result.text);
    if (result.ok && looksLikeSitemap) {
      return candidate;
    }
  }

  checks[1].message = robots.ok ? "robots.txt checked" : "robots.txt unavailable";
  return "";
}

function extractLinkTargets($: CheerioAPI, baseUrl: string) {
  return $("a[href]")
    .toArray()
    .map((element) => {
      const href = $(element).attr("href") ?? "";
      return {
        href: absolutizeUrl(href, baseUrl),
        text: cleanText($(element).text()).toLowerCase()
      };
    })
    .filter((link) => Boolean(link.href));
}

function findRelevantLink(links: Array<{ href: string; text: string }>, needles: string[]) {
  const normalizedNeedles = needles.map((needle) => needle.toLowerCase());

  return (
    links.find((link) => normalizedNeedles.some((needle) => `${link.href} ${link.text}`.toLowerCase().includes(needle)))
      ?.href ?? ""
  );
}

function absolutizeUrl(href: string, baseUrl: string) {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return href;
  }

  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return "";
  }
}

async function fetchStylesheetText($: CheerioAPI, baseUrl: string) {
  const stylesheetUrls = $("link[rel~='stylesheet'][href]")
    .toArray()
    .map((element) => absolutizeUrl($(element).attr("href") ?? "", baseUrl))
    .filter(Boolean)
    .slice(0, 6);

  const responses = await Promise.allSettled(stylesheetUrls.map((url) => fetchText(url)));
  return responses
    .map((response) => (response.status === "fulfilled" && response.value.ok ? response.value.text : ""))
    .join("\n");
}

function extractPalette(text: string) {
  const counts = new Map<string, number>();
  const add = (color: string) => counts.set(color, (counts.get(color) ?? 0) + 1);

  for (const match of text.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)) {
    add(normalizeHex(match[0]));
  }

  for (const match of text.matchAll(/rgba?\(\s*(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})(?:[,\s/]+[\d.]+)?\s*\)/gi)) {
    add(rgbToHex(Number(match[1]), Number(match[2]), Number(match[3])));
  }

  return Array.from(counts.entries())
    .filter(([color]) => !["#000000", "#ffffff"].includes(color))
    .sort((a, b) => b[1] - a[1])
    .map(([color]) => color)
    .slice(0, 10);
}

function normalizeHex(value: string) {
  const hex = value.toLowerCase();
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function buildStyleProfile(text: string, discoveredPalette: string[]): StyleProfile {
  const palette = discoveredPalette.length ? discoveredPalette : fallbackPalette;
  const dark = palette.find((color) => luminance(color) < 0.24) ?? "#111827";
  const light = palette.find((color) => luminance(color) > 0.82) ?? "#ffffff";
  const primary = palette.find((color) => luminance(color) >= 0.16 && luminance(color) <= 0.55) ?? fallbackPalette[0];
  const secondary = palette.find((color) => color !== primary && luminance(color) <= 0.72) ?? fallbackPalette[1];
  const accent = palette.find((color) => ![primary, secondary, dark].includes(color)) ?? fallbackPalette[2];
  const radius = detectRadius(text);

  return {
    primaryColor: primary,
    secondaryColor: secondary,
    accentColor: accent,
    textColor: dark,
    bgColor: light,
    borderColor: "#d9dee8",
    fontFamily: detectFontFamily(text),
    borderRadius: `${radius}px`,
    shadow: /box-shadow\s*:/i.test(text) ? "0 18px 45px rgba(15, 23, 42, 0.12)" : "0 10px 24px rgba(15, 23, 42, 0.08)",
    spacing: radius >= 18 ? "airy" : radius <= 4 ? "tight" : "balanced",
    palette
  };
}

function luminance(hex: string) {
  const normalized = normalizeHex(hex).replace("#", "");
  const [red, green, blue] = [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16) / 255);
  const linear = [red, green, blue].map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function detectRadius(text: string) {
  const values = Array.from(text.matchAll(/border-radius\s*:\s*(\d{1,3})(?:px)?/gi))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value <= 80);

  if (!values.length) return 8;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (average < 5) return 4;
  if (average > 22) return 24;
  return 10;
}

function detectFontFamily(text: string) {
  const counts = new Map<string, number>();

  for (const match of text.matchAll(/font-family\s*:\s*([^;{}]+)/gi)) {
    const family = match[1]
      .split(",")[0]
      .replace(/["']/g, "")
      .trim();
    if (family && !/inherit|initial|var\(/i.test(family)) {
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "system-ui";
}

function findLogoUrl($: CheerioAPI, baseUrl: string) {
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) return absolutizeUrl(ogImage, baseUrl);

  const candidate = $("img")
    .toArray()
    .map((element) => ({
      src: $(element).attr("src") || $(element).attr("data-src") || "",
      alt: ($(element).attr("alt") ?? "").toLowerCase(),
      className: ($(element).attr("class") ?? "").toLowerCase()
    }))
    .find((image) => `${image.src} ${image.alt} ${image.className}`.includes("logo"));

  return candidate?.src ? absolutizeUrl(candidate.src, baseUrl) : "";
}

async function verifyImageUrl(url: string) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(8000)
    });
    return response.ok && (response.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
}

function extractSocialLinks(links: Array<{ href: string; text: string }>): SocialLinks {
  const socials: SocialLinks = {};

  for (const link of links) {
    if (/facebook\.com/i.test(link.href)) socials.facebook = link.href;
    if (/linkedin\.com/i.test(link.href)) socials.linkedin = link.href;
    if (/instagram\.com/i.test(link.href)) socials.instagram = link.href;
    if (/youtube\.com|youtu\.be/i.test(link.href)) socials.youtube = link.href;
    if (/tiktok\.com/i.test(link.href)) socials.tiktok = link.href;
  }

  return socials;
}

function extractPhone(text: string) {
  const match = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  return match ? match[0].replace(/\s+/g, " ").trim() : "";
}

function extractWhatsapp(links: Array<{ href: string; text: string }>, text: string) {
  const waLink = links.find((link) => /wa\.me|api\.whatsapp\.com|whatsapp/i.test(link.href));
  if (waLink?.href) return waLink.href;

  const whatsappNearNumber = text.match(/whatsapp[^+\d]*(\+?\d[\d\s().-]{7,}\d)/i);
  return whatsappNearNumber?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function detectLanguage($: CheerioAPI, html: string): SiteLanguage {
  const lang = $("html").attr("lang")?.toLowerCase() ?? "";
  const dir = $("html").attr("dir")?.toLowerCase() ?? "";

  if (lang.startsWith("he") || dir === "rtl" || /[\u0590-\u05ff]/.test(html)) {
    return "he";
  }

  return "en";
}

function detectSiteType(text: string, links: Array<{ href: string; text: string }>): SiteType {
  const combined = `${text} ${links.map((link) => `${link.href} ${link.text}`).join(" ")}`.toLowerCase();
  return /woocommerce|shopify|cart|checkout|add to cart|product-|\/product\/|\/shop\b|עגלת קניות/.test(combined)
    ? "ecommerce"
    : "regular";
}

function deriveSiteName(title: string, baseUrl: string) {
  const hostname = new URL(baseUrl).hostname.replace(/^www\./, "");
  const fromTitle = title.split(/[|-]/)[0]?.trim();
  return fromTitle || hostname;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
