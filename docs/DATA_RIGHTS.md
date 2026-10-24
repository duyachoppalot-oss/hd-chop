# Data rights — what may be copied into hdchop

Not legal advice. Get a quick review before App Store launch.

| Source | May copy | Must NOT copy |
|---|---|---|
| OEM fitment extracted from HD catalogs (`hd_oem_catalog_reference`, `oem_fitment`) | Normalized OEM number, year, model code, a cleaned short description written by us, condition tags | Catalog text verbatim beyond a short part name, diagrams, images, page scans |
| HD parts catalogs scraped from the H-D service portal (serviceinfo.harley-davidson.com) into `~/Developer/catalog-extract/rows/*.tsv`, 391 books, 1991–2027 — loaded by `scripts/etl/09_service_catalog.mjs` (`fitment.source = 'service_catalog'`) | Same as the row above: normalized OEM number, year, model code, a cleaned short description written by us, condition tags. Section/figure names only internally (concept matching), never displayed | Catalog text verbatim beyond a short part name, section/figure titles shown as-is, diagrams and images (`catalog-extract/images`), page scans, the numeric part index as a list |
| ⚠ Open question for that source (Laken, before launch) | The portal is public, no login (the scraper never logs in). Its Terms of Use (serviceinfo.harley-davidson.com/terms, dated May 12, 2016, read 2026-10-24) say: "You may not modify, copy, reproduce, republish, repurpose, … sell or distribute … the material on the Site in whole or in part"; printing/downloading only "solely for your own use"; it also prohibits "harvesting, mining or collection of … information from or through the Site". No robots.txt. Whether bare fitment facts (number ↔ model ↔ year), re-expressed in our own words, count as "the material" is a legal question — get the pre-launch review to answer it. Until then this source stays removable: every row it adds carries `source = 'service_catalog'` and can be deleted in one statement | — |
| Our derived data (`oem_supersession`, `oem_part_timeline`, chain roots, concepts) | All of it | — |
| `bike_specs` (from Drag Specialties FatBook/OldBook) | Facts used internally to set `vehicles.fuel_system` / engine | Any text, tables, or images reproduced in the app |
| Vendor catalogs (PU, WPS, VTwin, Drag Specialties) | Nothing displayed in the app. Later: a "find it at Stinkin' Supplies" link keyed by OEM number. | Descriptions, images, prices, vendor names, aftermarket crossref tables |
| Fallen Cycles salvage records | Confirm ownership with the facility first. Then: OEM number + year/model the part came off. | Customer info, VINs shown publicly |

Trademark: use "Harley-Davidson" and model names only to describe fitment. No HD logos or bar & shield. Show "Not affiliated with or endorsed by Harley-Davidson" in the app footer and App Store listing.
