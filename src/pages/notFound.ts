export const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Link not found</title>
<style>
  :root { color-scheme: light dark; --bg: #f8fafc; --fg: #0f172a; --muted: #64748b; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0f172a; --fg: #f1f5f9; --muted: #94a3b8; } }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; align-items: center; justify-content: center; padding: 16px;
    background: var(--bg); color: var(--fg);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; text-align: center;
  }
  h1 { font-size: 1.5rem; margin: 0 0 .5rem; }
  p { color: var(--muted); margin: 0; }
</style>
</head>
<body>
  <main>
    <h1>Link not found</h1>
    <p>This short link doesn't exist or has been removed.</p>
  </main>
</body>
</html>
`;
