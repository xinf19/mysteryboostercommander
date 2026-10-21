# Mystery Booster Commander Guide

An independent fan site covering game changes, Rulebreaker, rules, card lists, release dates, and disclosed commanders.

Homepage: [mysteryboostercommander.com](https://mysteryboostercommander.com/)

## Preview locally

The seven main guides and eight individual commander profiles are HTML files in the repository root. The deployed site uses extensionless URLs and root-relative internal links. Preview navigation through a server that supports these routes.

Tailwind CSS loads from a CDN. Base styles are also included in each page. The card browser requires JavaScript and access to the Scryfall API.

## Pages

- `index.html` — Game changes
- `rulebreaker.html` — Rulebreaker guide
- `rules.html` — Rules guide
- `card-list.html` — Searchable card list
- `release-date.html` — Release and legality dates
- `what-is.html` — Set introduction
- `commanders.html` — Disclosed commanders

Independent, unaffiliated fan site. Magic: The Gathering and related names are owned by Wizards of the Coast.

## Crawling

`robots.txt` allows crawling and links to `sitemap.xml`, which lists the seven main guides and eight commander profiles using canonical extensionless URLs. The commander overview also provides stable anchors for all eight profiles.
