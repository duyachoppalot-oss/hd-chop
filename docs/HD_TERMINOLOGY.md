# Harley model terminology — how to read codes before inferring fitment

Read this before any script turns vendor or catalog model text into `vehicles` / `fitment` rows.
Status (2026-10-24): Laken's answers are in. FL includes FLH; EL is the 61 ci OHV big twin, a Knucklehead 1936–47 (it carried on as a 61 ci Panhead 1948–52); FXR is its own family with its own frame; W/WL/WLA are models of their own. FL and FX are now their own platforms (`fl`, `fx`, migration 005, `01_vehicles.mjs` chassisPlatform). The suspect rows below were fixed and applied. Vendor fitment is **not** loaded yet.

## Core rules

1. **Code + year decides meaning, never the code alone.** `FL` in 1952 is a Panhead; `FL` in 2005 vendor text is a family shorthand; `FXS` is a Shovelhead Low Rider in 1977–84 and a Softail Blackline in 2011–13; `FXSB` is a Shovelhead Low Rider in 1983–85 and a Softail Breakout in 2013–17.
2. **Two kinds of tokens.**
   - *Model token*: a full code that names one bike in that year (`FLHR` 2004, `FXWG` 1982, `WLA` 1942). Maps to that vehicle only.
   - *Family token*: shorthand a parts company uses for a group (`FL 1941-1984`, `FLT 1980-UP`, `FXST 1984-UP`, `FXD`, `XL`). Expands only to vehicles **already in `vehicles`** that match the family rule below for each year. Lower confidence than a model token.
3. **Vendor text never creates a vehicle.** Vehicles come only from H-D catalogs / the year-model master (01_vehicles evidence gate). A vendor range that runs past a vehicle's real years (e.g. `FLT 1939-…`) just doesn't match those years.
4. **Never trust a vendor's (or Stinkin's) family label.** Re-resolve from the raw code + year using this file. See "Known bad mappings" below.
5. **If a token isn't in the tables below → review queue, not a guess.**

## Engine eras (H-D)

| Engine | Years | Big Twin codes in that era |
|---|---|---|
| F-head / pre-'36 | 1911–1929 | J, JD, F (not in our vehicles; skip) |
| Flathead | 1929–1973 | V/VL/VLD/VLH 1930–36; U/UL/UH/ULH 1937–48; W/WL/WLA/WLD/WR 1937–52 (45 ci); G Servi-Car 1932–73; D/DL 1929–31; K/KH/KK/KR 1952–56 (pre-Sportster) |
| Knucklehead | 1936–1947 | EL (61 ci) 1936–47, FL (74 ci) 1941–47, UL/ES variants |
| Panhead | 1948–1965 | EL 1948–52, FL 1948–65, FLH 1955–65 (Hydra-Glide 1949–57, Duo-Glide 1958–64, Electra Glide 1965) |
| Shovelhead | 1966–1984 | FL/FLH 1966–84, FLT/FLTC 1980–84, FLHT/FLHTC 1983–84, FX family 1971–84, FXR family 1982–84 |
| Evolution | 1984–1999 | 1984 is a split year: some FLH/FX/FXR are Shovel, FXST is Evo |
| Ironhead Sportster | 1957–1985 | XL, XLH, XLCH, XLS, XLT, XLX, XLCR, XR1000 |
| Evo Sportster | 1986–2022 | XLH883/1100/1200, XL883…, XL1200… |

## Chassis families (what "Touring/Softail/Dyna" mean)

| Family | First–last year | Codes | Notes |
|---|---|---|---|
| FL big twin (pre-Touring) | 1936–1984 | EL, FL, FLH, FLHS, FLP, FLHP, FLHF, FLHC… | Rigid until 1957, swingarm from 1958 (Duo-Glide). Not "Touring" in H-D's later sense; platform `fl`. 1985 FLH/FLHS stay `touring` until the 1984–86 FLT catalog says which frame they used. |
| FLT chassis / Touring | 1980– | FLT/FLTC 1980–96, FLHT* 1983–, FLHR* 1994–, FLTR* 1998–, FLHX* 2006–… | "FLT" in vendor text after 1984 = whole Touring family. |
| FX (Shovel swingarm) | 1971–1986 | FX, FXE, FXS, FXEF, FXWG, FXB, FXSB, FXDG (1983 Disc Glide) | Platform `fx`. FXWG/FXSB/FXEF ran into 1985–86 with Evo on the **FX swingarm frame, not Softail** (1984–86 FX-FXST catalog: "85 to * - FXWG, FXSB, FXEF", "Late 86 - FXWG"). |
| FXR | 1982–1994 (+ CVO 1999–2000) | FXR, FXRS, FXRT, FXRP, FXRD, FXRDG, FXLR, FXRS-SP, FXRS-CONV… | Own rubber-mount frame; platform `fxr`. Never part of FX or Softail. |
| Softail | 1984– | FXST* 1984–, FLST* 1986–, plus 2018+ ex-Dyna names (FXBB, FXLR, FXFB, FLDE, FLHC, FLSL, FXBR, FXDR…) | FX-prefix and FL-prefix Softails are the **same chassis**. |
| Dyna | 1991–2017 | FXD*, FLD 2012–16 | Merged into Softail for 2018. |
| Sportster | 1957–2022 | XL* | K models 1952–56 are not Sportsters. |

## Family tokens in vendor text (seen in V-Twin / PU / WPS data)

Measured 2026-10-24 (`reports/terminology_survey_*.txt`). Ranges are the token's start year.

| Token | Year range in text | Means | Expands to (our `vehicles`) | Confidence |
|---|---|---|---|---|
| `EL` | 1936–1952 | 61 ci OHV big twin (Knucklehead 1936–47, Panhead 1948–52) | EL vehicles in those years | model |
| `FL` | start ≤ 1984 | FL big twin family, **includes FLH** | platform `fl`. **Not** FLT/FLTC/FLHT (FLT chassis) | family |
| `W`, `WL`, `WLA`, `WLD`, `WR`, `UL`, `VL`, `G`, `K`… | flathead years | each is its own model | exact code only | model |
| `FL` | start ≥ 1985 | ambiguous (38 rows) | review | — |
| `FLH` | ≤ 1984 | FLH (high-compression FL) | FLH* vehicles | model-ish |
| `FLH` | ≥ 1985 | Touring FLH* shorthand | Touring vehicles whose code starts FLH | family |
| `FLT` | 1980–1984 | Tour Glide chassis | FLT, FLTC, FLHT, FLHTC | family |
| `FLT` | ≥ 1985 | all Touring | platform `touring` | family |
| `FX` | 1971–1986 | FX Shovel/early-Evo swingarm family | platform `fx`. **Not** FXR*, **not** Softail | family |
| `FXR` | 1982–2000 | FXR family | platform `fxr` | family |
| `FXST` | ≥ 1984 | FX Softails | platform `softail` and code starts FX (2018+: see open question 3) | family |
| `FLST` | ≥ 1986 | FL Softails | platform `softail` and code starts FL | family |
| `FXD` | 1991–2017 | Dyna | platform `dyna` | family |
| `XL` | ≥ 1957 | Sportster | platform `sportster` | family |
| `XL` | < 1957 | not a Sportster (K model) | review | — |
| `FL/FX`, `FL FX` (combined) | ≤ 1984 | all pre-Evo big twins (FL + FX families). E.g. "37-84 FL FX" | FL family ∪ FX family | family |
| `FL/FX`, `FLST/FXST` | ≥ 1984 | Softail | platform `softail` | family |
| `FLH/FLT` | any | Touring | as `FLT` | family |
| `Big Twin`, `All models`, `Custom application`, `All` | — | too broad | skip | — |
| `Chief`, `Scout` | — | Indian, not H-D | reject | — |
| `J`, `JD`, `F` (1912–29) | — | pre-1930 H-D | skip (no vehicles) | — |
| `… -UP` | open end | through current | cap at the vehicle's real last year | as base token |

## Known bad mappings in Stinkin' derived tables (do NOT reuse)

`product_fitment_year_model.family_name` and `catalog_fitment_v2` already expanded vendor codes, with errors:
- `FL` filed as **Touring from 1930**; `FLH` Touring from 1947; `FLT` Touring from 1939/1941.
- `FX` filed as Shovelhead from **1941** to 2026; `FXE` Shovelhead to 2007.
- `FXS` filed as **Softail 1977–84** (it's the Shovel Low Rider).
- `FLH` filed as Panhead up to 1982.
- `XL` from 1936, `EL` from 1928.

→ Read only the **raw** vendor text (`vtwin_scrape_data.fitment_raw`, `pu_fitment_expanded` code+year, WPS raw) and resolve with this file.

## Fixed 2026-10-24 (01_vehicles rules, applied)

| Row | Was | Now | Evidence |
|---|---|---|---|
| FXWG 1986 | `softail` | `fx` / evolution_bigtwin | 1984–86 FX-FXST catalog "Late 86 - FXWG" |
| FXSB 1986 | `softail`, "BREAKOUT" | `fx` / evo, no name | "85 to * - FXWG, FXSB, FXEF", "85 & Early 86 - FXWG, FXSB, FXEF" |
| FXEF 1981–85 | `fxr` | `fx` | Fat Bob is FX-frame |
| FXWG 1985, FXSB 1985 | missing | added, `fx` / evo | same catalog; 01 now reads ";"-separated ranges and single years ("85 - FXSB, FXEF") |
| FXDG 1983 (Disc Glide) | missing | added, `fx` / shovelhead | same parser fix |
| FX family 1971–84 | `vintage` | `fx` | — |
| FLH, FLHS 1984 | `touring` | `fl` | FL frame until the FLT/FLHT took over |

Still open (needs the PDF catalogs Laken has): 1982 FXSB (Low Rider got the FXSB code in 1983 per secondary sources; one catalog line says "80 to * - FXB, FXSB"); 1985 FLH/FLHS frame; 1979–80 FXEF; all Knucklehead/Panhead vehicles.

## Open questions for Laken

1. `FXST 2018-UP` / `FLST 2018-UP`: after 2018 H-D renamed Softails (FXBB, FXLR, FLHC…). Treat as all 2018+ Softails with that prefix, or review? (Currently review.)
2. Flathead models are still `vintage`. Split them too (45 ci W/WL/WLA, 74/80 ci U/UL, V/VL, Servi-Car G, K models)?
