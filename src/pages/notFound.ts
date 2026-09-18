export const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Link not found</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<style>
  :root { color-scheme: light dark; --bg: #eff4ef; --card: #ffffff; --fg: #1d2a24; --muted: #56655d; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0f1613; --card: #17211c; --fg: #e6eee9; --muted: #a3b3aa; } }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center; padding: 16px;
    background: var(--bg); color: var(--fg);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; text-align: center;
  }
  main { background: var(--card); border-radius: 24px; padding: 40px 32px; max-width: 360px; }
  svg { display: block; margin: 0 auto 20px; }
  h1 { font-size: 1.5rem; margin: 0 0 .5rem; letter-spacing: -0.01em; }
  p { color: var(--muted); margin: 0; line-height: 1.5; }
</style>
</head>
<body>
  <main>
    <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#0f7a61"/>
      <g transform="translate(2 -4)">
        <path d="M14 46 C21 12, 43 13, 46.5 39" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round"/>
        <path d="M48 49 L52.2 37.2 L40.4 39 Z" fill="#fff" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
        <circle cx="14" cy="46" r="7" fill="#f2a15e"/>
      </g>
    </svg>
    <h1>Link not found</h1>
    <p>This short link doesn't exist or has been removed. Check the address for typos.</p>
  </main>
</body>
</html>
`;
