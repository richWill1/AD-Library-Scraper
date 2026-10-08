# Creative Companion — prototype

This is our own Chrome extension, not a subscription to an external ad SaaS. Installation and an end-to-end test have NOT been completed.

It runs content scripts only on the Meta Ad Library path and our Render website. On a creative request from our site, it temporarily opens a background Ad Library tab for the requested numeric Page/ad IDs. It reads image/video URLs from the rendered DOM, matched to that ad ID, sends those public creative URLs back to our site, then closes the temporary tab. It does not read or transmit login cookies, access tokens, passwords, browsing history, or other Facebook pages. There are no host_permissions or tabs permissions in the manifest. Meta can still require login or limit access; the extension reports failure rather than solving challenges.

To test after approval: unzip the download, open chrome://extensions, enable Developer mode, choose Load unpacked, and select the companion folder containing manifest.json. Reload our Render website in Chrome. Research a brand, select it, and scroll to its ad cards. Installation creates browser access for the two declared content-script patterns; review the source before granting it. Uninstall through Chrome's Extensions page to remove it.

Only one preview lookup runs at a time. The website retries a busy request and times out safely. This prototype uses the UK preview scope and is not a production guarantee of every creative variant or worldwide coverage. It cannot work inside the Codex in-app browser.
