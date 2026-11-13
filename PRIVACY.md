# Privacy

**Nothing leaves your Mac except fetching the feeds you chose, and checking for app updates.**

- Cherub Courier has no server, no accounts, no analytics, no tracking and no AI.
- It downloads the RSS/Atom feeds you approved, at your edition times (and when you
  press Refresh). Those sites see an ordinary request from your Mac, as when you visit them.
- Once a day it downloads the public list of recommended sources from this project's
  GitHub repository (`data/sources.json`), so new or retired feeds reach you without an
  update. Nothing about you is sent.
- From version 0.4.0, at launch and every few hours it checks this project's GitHub
  releases for a newer version of the app, and downloads it if there is one. macOS only
  installs an update signed by the same developer. Nothing about you is sent; GitHub sees
  an ordinary download request.
- During setup, a link you paste is fetched once to check that it is a feed.
- Clicking a headline opens it in your browser; from then on, that site's own privacy
  policy applies.
- Your topics, keywords, sources and reading history stay in
  `~/Library/Application Support/Cherub Courier/` and are never uploaded.
  Menu bar cherub icon > Reset everything… deletes them.
