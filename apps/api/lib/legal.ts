// Privacy policy and terms (docs/FIX_PLAN.md B3), served at /privacy and /terms
// (app/privacy, app/terms; outside /v1, so no app key). DRAFT until the legal review (B2).
// Words in [BRACKETS] are Laken's to fill in.

const UPDATED = 'October 26, 2026';

// Same look as the app (apps/mobile/src/lib/theme.tsx): flash-sheet panels with firm
// outlines and hard offset shadows, Bangers caps, Rye section heads, Oswald body,
// Courier Prime for the date. Fonts are self-hosted in public/fonts (OFL), no third-party requests.
// Dark / light follow the phone, with the app's two palettes.
type Active = 'privacy' | 'terms';

function page(title: string, active: Active, body: string): Response {
  const tab = (key: Active, label: string) =>
    `<a class="chip${key === active ? ' on' : ''}" href="/${key}"${key === active ? ' aria-current="page"' : ''}>${label}</a>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>HD Chop — ${title}</title>
<style>
  @font-face { font-family: Bangers; src: url(/fonts/Bangers_400Regular.ttf) format("truetype"); font-display: swap; }
  @font-face { font-family: Rye; src: url(/fonts/Rye_400Regular.ttf) format("truetype"); font-display: swap; }
  @font-face { font-family: Oswald; src: url(/fonts/Oswald_400Regular.ttf) format("truetype"); font-weight: 400; font-display: swap; }
  @font-face { font-family: Oswald; src: url(/fonts/Oswald_600SemiBold.ttf) format("truetype"); font-weight: 600; font-display: swap; }
  @font-face { font-family: "Courier Prime"; src: url(/fonts/CourierPrime_400Regular.ttf) format("truetype"); font-display: swap; }
  :root {
    --bg: #0B0A08; --panel: #17140F; --panel-hi: #211C14; --accent: #D4A52C; --line: #D4A52C;
    --fill: #D4A52C; --on-fill: #0B0A08; --shadow: #4E3B10; --text: #F2E8D0; --muted: #A39880; --faint: #6E6553;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg: #FFFFFF; --panel: #FFFFFF; --panel-hi: #F6F0E1; --accent: #8A6A12; --line: #14110C;
      --fill: #D4A52C; --on-fill: #0B0A08; --shadow: #D4A52C; --text: #14110C; --muted: #5C5448; --faint: #8A8276;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 18px/1.55 Oswald, "Arial Narrow", system-ui, sans-serif;
         -webkit-text-size-adjust: 100%; }
  header { display: flex; justify-content: center; padding: 18px 16px 6px; }
  .mark { font: 30px/1 Bangers, Impact, sans-serif; letter-spacing: .02em; color: var(--text); text-decoration: none; }
  main { max-width: 680px; margin: 0 auto; padding: 8px 16px 56px; }
  h1 { font: 46px/1.05 Bangers, Impact, sans-serif; letter-spacing: .015em; text-transform: uppercase; margin: 18px 0 6px; transform: rotate(-1deg); transform-origin: left; }
  .date { font: 15px/1.4 "Courier Prime", ui-monospace, monospace; color: var(--muted); margin: 0 0 22px; }
  h2 { font: 21px/1.2 Rye, Georgia, serif; color: var(--accent); text-transform: uppercase; letter-spacing: .03em;
       border-bottom: 3px solid var(--accent); padding-bottom: 6px; margin: 36px 0 14px; }
  p { margin: 0 0 14px; }
  strong { font-weight: 600; }
  a { color: var(--accent); text-underline-offset: 3px; }
  .panel { background: var(--panel); border: 2.5px solid var(--line); border-radius: 10px; box-shadow: 4px 4px 0 var(--shadow);
           padding: 16px 18px 4px; margin: 0 4px 22px 0; }
  .panel .kicker { font: 17px/1 Rye, Georgia, serif; color: var(--accent); text-transform: uppercase; letter-spacing: .03em; margin: 0 0 10px; }
  .callout { background: var(--fill); color: var(--on-fill); border-color: var(--line); }
  .callout .kicker { color: var(--on-fill); }
  .callout a { color: var(--on-fill); }
  footer { margin-top: 44px; }
  .chips { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 22px; }
  .chip { display: inline-flex; align-items: center; min-height: 48px; padding: 0 22px; border: 2.5px solid var(--line); border-radius: 999px;
          box-shadow: 4px 4px 0 var(--shadow); background: var(--panel); color: var(--accent);
          font: 22px/1 Bangers, Impact, sans-serif; letter-spacing: .02em; text-decoration: none; text-transform: uppercase; }
  .chip.on { background: var(--fill); color: var(--on-fill); }
  .chip:active { transform: translate(3px, 3px); box-shadow: 1px 1px 0 var(--shadow); }
  .fine { color: var(--muted); font-size: 15px; text-align: center; }
</style></head>
<body>
<header><span class="mark">HD CHOP</span></header>
<main>
<h1>${title}</h1>
<p class="date">Last updated ${UPDATED}</p>
${body}
<footer>
<div class="chips">${tab('privacy', 'Privacy')}${tab('terms', 'Terms')}</div>
<p class="fine">Not affiliated with or endorsed by Harley-Davidson. Harley-Davidson and its model names are trademarks of their owner, used here only to describe which parts fit which motorcycles.</p>
</footer>
</main></body></html>`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

export const privacyPage = () =>
  page(
    'Privacy policy',
    'privacy',
    `
<div class="panel"><p class="kicker">Short version</p>
<p>No accounts. No location. No ads. No tracking. We don't sell anything about you.</p></div>
<p>HD Chop is an app for looking up Harley-Davidson OEM part numbers and which bikes they fit. It is run by [OWNER / BUSINESS NAME] ("we"). This policy says what the app collects and why.</p>

<h2>What we don't collect</h2>
<p>You don't sign up or log in. The app does not ask for or read your name, email, phone number, contacts, photos, location or advertising ID, and it has no ad, analytics or tracking code in it.</p>

<h2>What reaches our server</h2>
<p><strong>Your lookups.</strong> To answer a search the app sends our server the year and model you picked and the words you typed (for example "2004 FLHR, gas tank"), or a part number. That is how the answer comes back; the request carries no name or account.</p>
<p><strong>Searches we couldn't match.</strong> When your words don't match any part we know, we keep the words and the bike you picked so we can teach the app new names for parts. We store no IP address, device ID or anything else with them.</p>
<p><strong>Server logs.</strong> Like any website, our web server briefly logs each request: time, IP address, the address requested (which includes your search words) and the app or browser version. We use these logs only to keep the service running and to stop abuse (for example limiting how fast one address can send requests). They are deleted after [14] days.</p>

<h2>Subscriptions</h2>
<p>If you subscribe to HD Chop Pro, Apple handles the payment; we never see your card or Apple ID. We use RevenueCat to check whether a subscription is active. RevenueCat receives a random ID the app creates (not your name or email) and your purchase record from Apple. See <a href="https://www.revenuecat.com/privacy">RevenueCat's privacy policy</a>.</p>

<h2>On your phone</h2>
<p>The app saves your settings (Dark / Light / Phone page) on your device. [When the garage feature ships: the bikes you save stay on your device too.] Deleting the app deletes them.</p>

<h2>Where it's kept and who sees it</h2>
<p>Our server and database run at Hetzner (a hosting company) in [the United States]. Only we can read the data above. We don't sell or share it, except if the law requires us to.</p>

<h2>Children</h2>
<p>HD Chop is not aimed at children under 13 and we don't knowingly collect anything from them.</p>

<h2>Your choices</h2>
<p>Because nothing we keep is tied to your name or device, we usually can't find "your" data. If you have a question or want something removed, email <a href="mailto:[CONTACT EMAIL]">[CONTACT EMAIL]</a> and we'll do what we can.</p>

<h2>Changes</h2>
<p>If this policy changes we'll update the date at the top. Big changes will also be noted in the app's release notes.</p>
`
  );

export const termsPage = () =>
  page(
    'Terms of use',
    'terms',
    `
<p>These terms cover your use of the HD Chop app and website, run by [OWNER / BUSINESS NAME] ("we"). By using HD Chop you agree to them.</p>

<h2>What HD Chop is</h2>
<p>HD Chop helps you find Harley-Davidson OEM part numbers and the years and models they were used on. The information is put together from parts catalogs and other references. We work hard to get it right, but catalogs have errors, parts get superseded, and bikes get modified.</p>

<div class="panel callout"><p class="kicker">Check before you buy</p>
<p>HD Chop is a reference, not a guarantee. <strong>Always confirm a part number with your dealer, the seller or the factory documentation before you buy, order or install a part</strong>, especially anything to do with brakes, steering, wheels, tires, suspension, fuel or electrical systems. We are not responsible for parts that don't fit, wrong orders, returns, or work done based on the app.</p></div>

<h2>Not affiliated with Harley-Davidson</h2>
<p>HD Chop is an independent app. It is not affiliated with, endorsed by or sponsored by Harley-Davidson. Harley-Davidson, H-D and the model names are trademarks of their owner and are used only to describe which parts fit which motorcycles.</p>

<h2>Subscriptions</h2>
<p>Some features need an HD Chop Pro subscription, bought through Apple. Prices are shown in the app before you buy. Subscriptions renew automatically until you cancel; you can cancel any time in your Apple ID settings (Settings → your name → Subscriptions), at least 24 hours before the renewal date. Refunds are handled by Apple under Apple's rules. Apple's standard <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">Licensed Application End User License Agreement</a> also applies.</p>

<h2>Fair use</h2>
<p>Use HD Chop for looking up parts. Don't copy, scrape or resell its data, overload or attack the service, or try to get around the subscription. We may limit or block access that does.</p>

<h2>No warranty</h2>
<p>HD Chop is provided "as is" without warranties of any kind, to the extent the law allows. The service may change, pause or stop.</p>

<h2>Limit of liability</h2>
<p>To the extent the law allows, we are not liable for indirect or consequential losses, and our total liability for any claim is limited to what you paid us for HD Chop in the 12 months before the claim.</p>

<h2>Changes and contact</h2>
<p>We may update these terms; the date at the top shows the latest version. These terms are governed by the laws of [STATE], USA. Questions: <a href="mailto:[CONTACT EMAIL]">[CONTACT EMAIL]</a>.</p>
`
  );
