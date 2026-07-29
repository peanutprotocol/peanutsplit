# Expense composer design labs

Standalone prototypes for the add-expense flow. Open the file directly in a
browser — no server, no build.

- `expense-picker.html` — the add-expense lab: composer layouts and the
  who-paid / split-between controls side by side.
- `composer-hifi.html` — the hi-fi composer card, the same surface rendered at
  production fidelity.

Neither is shipped. They deliberately live here rather than in
`apps/web/public/`, where they would be served on peanutsplit.com.

Because they sit outside the web app, the `@font-face` rules point at the real
fonts by relative path (`../../apps/web/public/fonts/`) so the labs render with
Sniglet and Knerd standalone. If you move these files, fix those three URLs.
