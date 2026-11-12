import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const knownCards = JSON.parse(fs.readFileSync(path.join(root, "scripts/card-guide-data.json"), "utf8"));
const base = "https://mysteryboostercommander.com";
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const decode = value => value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const write = (name, text) => {
  if (!fs.existsSync(path.join(root, name)) || read(name) !== text) fs.writeFileSync(path.join(root, name), text);
};
const files = fs.readdirSync(root).filter(name => name.endsWith(".html"));
const sitemapBefore = read("sitemap.xml");
const listedUrls = [...sitemapBefore.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1]));
const cards = [];

for (const file of files) {
  const html = read(file);
  if (!html.includes('aria-labelledby="mbc-combos"')) continue;
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  const slug = file.slice(0, -5);
  const metadata = knownCards[slug];
  const name = schema.about?.name;
  if (!name) throw new Error("Missing card name in " + file);
  const number = metadata?.collector_number ?? html.match(/card image \(MBC #(\d+)\)/)?.[1];
  const cost = metadata?.mana_cost ?? decode(html.match(/<dt>Mana cost[^<]*<\/dt>\s*<dd>([^<]+)/)?.[1] ?? "").split(" · ")[0].trim();
  const type = metadata?.type_line ?? decode(html.match(/<dt>Type[^<]*<\/dt>\s*<dd>([^<]+)/)?.[1] ?? "");
  // New card files can provide explicit colors for a color indicator or a land with no mana cost.
  const explicitColors = html.match(/<meta name="card-colors" content="([WUBRG]*)"/)?.[1];
  const colors = metadata?.colors ?? [...new Set(explicitColors ?? (cost.match(/[WUBRG](?=[/}])/g) ?? []).join(""))];
  if (!number || !type) throw new Error("Missing printing or type for " + file);
  cards.push({ file, slug, name, number, cost, colors, type });
}

cards.sort((a, b) => Number(a.number) - Number(b.number) || a.name.localeCompare(b.name));
const byUrl = new Map(cards.map(card => [base + "/" + card.slug, card]));
for (const url of listedUrls) {
  const file = new URL(url).pathname.slice(1) + ".html";
  if (!files.includes(file)) continue;
  const html = read(file);
  if (html.includes('aria-labelledby="mbc-combos"') && !byUrl.has(url)) throw new Error("Unindexed card page " + url);
}

function compatible(a, b) {
  const sameColors = [...a.colors].sort().join("") === [...b.colors].sort().join("");
  const sharedColor = a.colors.some(color => b.colors.includes(color));
  const types = ["Creature", "Planeswalker", "Artifact", "Enchantment", "Instant", "Sorcery", "Land"];
  return sameColors || sharedColor || types.some(type => a.type.includes(type) && b.type.includes(type));
}

// A bipartite flow gives every page exactly two outgoing and two incoming related links.
const count = cards.length;
const source = count * 2;
const sink = source + 1;
const graph = Array.from({ length: sink + 1 }, () => []);
function edge(from, to, capacity) {
  const forward = { to, capacity, reverse: graph[to].length };
  const backward = { to: from, capacity: 0, reverse: graph[from].length };
  graph[from].push(forward);
  graph[to].push(backward);
}
for (let i = 0; i < count; i++) {
  edge(source, i, 2);
  edge(count + i, sink, 2);
  const candidates = cards.map((card, index) => ({ card, index }))
    .filter(({ card, index }) => index !== i && compatible(cards[i], card))
    .sort((a, b) => {
      const same = card => [...card.colors].sort().join("") === [...cards[i].colors].sort().join("");
      return Number(same(b.card)) - Number(same(a.card)) || a.index - b.index;
    });
  for (const { index } of candidates) edge(i, count + index, 1);
}
let flow = 0;
while (true) {
  const parents = Array(graph.length).fill(null);
  const queue = [source];
  parents[source] = { from: -1 };
  for (let position = 0; position < queue.length && !parents[sink]; position++) {
    const from = queue[position];
    graph[from].forEach((item, index) => {
      if (item.capacity && !parents[item.to]) {
        parents[item.to] = { from, index };
        queue.push(item.to);
      }
    });
  }
  if (!parents[sink]) break;
  for (let to = sink; to !== source;) {
    const { from, index } = parents[to];
    const item = graph[from][index];
    item.capacity--;
    graph[to][item.reverse].capacity++;
    to = from;
  }
  flow++;
}
if (flow !== count * 2) throw new Error("Cannot give every card two compatible incoming links");
for (let i = 0; i < count; i++) {
  const related = graph[i].filter(item => item.to >= count && item.to < count * 2 && item.capacity === 0)
    .map(item => cards[item.to - count]);
  if (related.length !== 2) throw new Error("Invalid related links for " + cards[i].slug);
  const links = '<div data-guide-links="related"><ul>' + related.map(card => '<li><a href="/' + card.slug + '">' + escape(card.name) + "</a></li>").join("")
    + '</ul><p><a href="/guides">See every card guide</a></p></div>';
  let html = read(cards[i].file).replace(/<div data-guide-links="related">.*?<\/div>/gs, "");
  html = html.replace(/(<section[^>]*aria-labelledby="mbc-combos"[^>]*>.*?)(<\/section>)/s, (_, content, end) => content + links + end);
  write(cards[i].file, html);
}

const title = "Mystery Booster Commander Card Guides | MBC Guide";
const heading = "Card Guides for Mystery Booster Commander";
const description = "Explore individual Mystery Booster Commander card guides by color, with Oracle rules text, Commander deck direction, and combinations with other cards.";
const template = read("index.html");
let head = template.slice(0, template.indexOf("<main "));
head = head.replace(/<title>.*?<\/title>/s, "<title>" + title + "</title>");
for (const [attribute, value] of [
  ['name="description"', description], ['property="og:title"', title], ['name="twitter:title"', title],
  ['property="og:description"', description], ['name="twitter:description"', description], ['property="og:url"', base + "/guides"],
]) head = head.replace(new RegExp('<meta content="[^"]+" ' + attribute + '/>'), '<meta content="' + escape(value) + '" ' + attribute + "/>");
head = head.replace(/<link href="[^"]+" rel="canonical"\/>/, '<link href="' + base + '/guides" rel="canonical"/>');
head = head.replace('href="/" aria-current="page"', 'href="/"').replace('aria-current="page" href="/"', 'href="/"');
const schema = {
  "@context": "https://schema.org", "@type": "CollectionPage", "@id": base + "/guides#collection",
  url: base + "/guides", name: heading, description, inLanguage: "en",
  mainEntity: { "@type": "ItemList", itemListElement: cards.map((card, index) => ({
    "@type": "ListItem", position: index + 1, name: card.name, url: base + "/" + card.slug,
  })) },
};
head = head.replace(/<script type="application\/ld\+json">.*?<\/script>/s, '<script type="application/ld+json">' + JSON.stringify(schema) + "</script>");
const groups = [["White", "W"], ["Blue", "U"], ["Black", "B"], ["Red", "R"], ["Green", "G"], ["Colorless", ""], ["Multicolor", null]];
const sections = groups.map(([label, color]) => {
  const group = cards.filter(card => color === null ? card.colors.length > 1 : color === "" ? card.colors.length === 0 : card.colors.length === 1 && card.colors[0] === color);
  return '<section class="section" aria-labelledby="guides-' + label.toLowerCase() + '"><h2 id="guides-' + label.toLowerCase() + '">' + label + "</h2><ul>"
    + group.map(card => '<li><a href="/' + card.slug + '">' + escape(card.name) + "</a> — MBC #" + escape(card.number) + " · " + escape(card.cost || "No mana cost") + "</li>").join("\n")
    + "</ul></section>";
});
const body = '<main class="container" id="main"><article aria-labelledby="page-title"><header class="hero"><h1 id="page-title">' + heading
  + '</h1><p>This index collects the individual card guides published on this site. For all 2,347 cards in the product, browse <a href="/card-list">the full 2,347-card list</a>.</p></header>'
  + sections.join("\n") + '<p>Every guide includes complete Oracle rules text and explains how to use the card in Commander.</p></article></main>';
write("guides.html", head + body + template.slice(template.indexOf("</main>") + 7));

for (const file of [...files, "guides.html"]) {
  let html = read(file);
  html = html.replace(/(<nav aria-label="Main navigation" class="main-nav">)(.*?)(<\/nav>)/s, (_, start, content, end) => {
    const clean = content.replace(/<a(?: aria-current="page")? href="\/guides"(?: aria-current="page")?>Card guides<\/a>/g, "");
    const current = file === "guides.html" ? ' aria-current="page"' : "";
    return start + clean + '<a href="/guides"' + current + ">Card guides</a>" + end;
  });
  if (file === "index.html") {
    html = html.replace(/<p data-guides-entry="home">.*?<\/p>/s, "");
    html = html.replace(/(<section aria-labelledby="changes-title")/, '<p data-guides-entry="home"><a href="/guides">Browse every card guide →</a></p>$1');
  }
  if (file === "commanders.html") {
    html = html.replace(/<p data-guides-entry="commanders">.*?<\/p>/s, "");
    html = html.replace(/(<section aria-labelledby="shared-title")/, '<p data-guides-entry="commanders"><a href="/guides">Browse all card guides →</a></p>$1');
  }
  write(file, html);
}

let sitemap = sitemapBefore;
const today = new Date().toISOString().slice(0, 10);
for (const url of [base + "/guides", ...cards.map(card => base + "/" + card.slug)]) {
  if (!listedUrls.includes(url)) sitemap = sitemap.replace("</urlset>", "  <url><loc>" + url + "</loc><lastmod>" + today + "</lastmod></url>\n</urlset>");
}
write("sitemap.xml", sitemap);
let redirects = read("_redirects");
if (!redirects.includes("/guides.html /guides 301")) redirects = redirects.trimEnd() + "\n/guides.html /guides 301\n";
write("_redirects", redirects);
console.log("Generated /guides with " + cards.length + " static card links and two incoming related links per card.");
