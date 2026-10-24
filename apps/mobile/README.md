# HD Chop mobile

Expo SDK 58 + Expo Router (TypeScript). Routes live in `src/app/`:

| Route | Screen |
|---|---|
| `/` | Pick year (`/v1/years`) |
| `/models/[year]` | Pick model, grouped by platform; models with no fitment greyed out |
| `/search` | Selected bike + search box + quick-pick words |
| `/results?q=` | `/v1/search`: concept chips (up to 3), part cards, ±10-year toggle (`all=1`), trigram fallback |
| `/part/[oem]` | `/v1/part/:oem`: newest number, replaces, fits per model split by conditions |

Shared code: `src/lib` (theme, API client, bike context, formatting), `src/components`.
The selected bike lives in memory only (saved garage is Phase 4).

Run:

```
npm --prefix apps/mobile install
npm --prefix apps/mobile start        # QR code for Expo Go on a phone
npm --prefix apps/mobile run web      # browser (Claude preview: "mobile-web" in .claude/launch.json)
npm --prefix apps/mobile run typecheck
```

The app calls the deployed API (https://hdchop.5.161.100.126.nip.io). Point it elsewhere with
`EXPO_PUBLIC_API_URL`, e.g. `EXPO_PUBLIC_API_URL=http://<mac-lan-ip>:3001 npm --prefix apps/mobile start`
against `npm --prefix apps/api run dev`.

iOS Simulator and TestFlight builds need Xcode (this Mac has only Command Line Tools) or EAS Build plus an
Apple Developer account.
