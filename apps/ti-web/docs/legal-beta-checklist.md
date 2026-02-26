# TI Legal Beta Checklist

## Routes
- `/signup`
- `/terms`
- `/privacy`
- `/content-standards`

## Signup Copy Strings
- Consent label: `I agree to the Terms of Service and Privacy Policy.`
- Consent error: `Please agree to the Terms of Service and Privacy Policy.`
- Guidelines notice: `By creating an account, you agree to follow the TournamentInsights community guidelines.`

## Manual QA Steps
- Open `/signup` and confirm the consent checkbox renders with links to `/terms` and `/privacy`.
- Confirm the submit button is disabled while consent is unchecked.
- Attempt form submit without checking consent (for example, via Enter key) and verify the exact error string appears.
- Confirm `community guidelines` links to `/content-standards` and opens in the same tab.
- Load `/terms`, `/privacy`, and `/content-standards` and verify each page shows `Last updated: 2026-02-26` and `support@tournamentinsights.com`.
