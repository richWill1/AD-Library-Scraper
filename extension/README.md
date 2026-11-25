# AdSnoop Chrome extension

On a brand's own website, click the AdSnoop icon to see the ads that brand is
running in the UK: the matched brand and how we know it's theirs, how many
ads are live (and on which platforms), how many launched this week, the AI
summary and a grid of their nine biggest ads by UK reach. Buttons open adsnoop.co.uk on that
brand (see all ads, pin as a competitor, remix).

- Only runs when you click it. The one permission is `activeTab`, so it can
  read the current tab's address at that moment and nothing else.
- Sends only the website's address to `GET /api/lookup?site=…` on AdSnoop.
  It never reads Facebook or Instagram pages or feeds.
- No sign-in in the extension. Anything that needs an account happens on the site.
- `config.js` sets which site it talks to (production by default).

## Try it

```
node scripts/pack-extension.mjs --preview   # or without --preview for production
```

Unzip, open `chrome://extensions`, turn on Developer mode, choose
**Load unpacked** and pick the `adsnoop-extension` folder.
