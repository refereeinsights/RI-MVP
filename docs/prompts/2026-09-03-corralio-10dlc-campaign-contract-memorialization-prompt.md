# Corralio — Memorialize Submitted 10DLC Campaign Contract

The Corralio Telnyx 10DLC campaign has now been SUBMITTED FOR REVIEW.

This task is documentation/authority alignment only.

Do not modify application code, schema, Telnyx, Supabase, Cloudflare, Vercel, environment variables, deployment, or the submitted campaign.

Do not send SMS.

## Purpose

Create a canonical record of exactly what Corralio represented to Telnyx/TCR in the submitted 10DLC campaign.

This record becomes an implementation constraint for the initial SMS deployment.

Future implementation must match the submitted campaign unless an explicit founder decision changes the messaging program and, where necessary, the 10DLC campaign is updated.

Do not silently broaden SMS behavior beyond the submitted campaign.

---

# Legal / Brand Identity

Legal operator / registered brand:

CO Services

Entity type:

Sole Proprietor

Consumer-facing service:

Corralio

Website:

https://corralio.com

Public SMS program page:

https://corralio.com/sms

Privacy:

https://corralio.com/privacy

Terms:

https://corralio.com/terms

Customer-facing SMS identity:

Corralio

Initial Corralio SMS number:

+1 509-206-9898

Telnyx Messaging Profile:

Corralio

Provider:

Telnyx

API:

Telnyx API v2

---

# Submitted Campaign Classification

Campaign type:

SOLE_PROPRIETOR

Vertical:

Professional Services

Selected message/use-case categories:

- 2FA
- Customer Care
- Account Notification

Marketing:

NOT INCLUDED

Initial implementation must therefore NOT use this campaign for:

- upgrade promotions
- HotelPlanner promotions
- affiliate offers
- sponsored-business promotions
- general marketing
- bulk promotional messaging

Marketing may be considered later only through an explicit product/compliance decision and any required campaign/consent changes.

---

# Submitted Campaign Description

Record the submitted campaign description as:

"Corralio provides family sports schedule management, customer care, account notifications, and account verification. Users may receive verification codes, schedule confirmations, schedule changes, event reminders, arrival and leave-by notifications, and responses to user-initiated support requests. Recurring messages are sent only to users who opt in. This campaign does not send marketing messages."

Treat these message categories as the initial approved product envelope.

---

# Submitted Opt-In Workflow

Record the submitted opt-in workflow as:

"Users visit https://corralio.com/sms, where Corralio displays the designated SMS number and instructs users to text START to opt in. The disclosure states that users agree to receive recurring transactional messages about their Corralio account and family sports schedules, message frequency varies, message and data rates may apply, consent is not a condition of purchase, and users may reply STOP to opt out or HELP for help. Links to https://corralio.com/terms and https://corralio.com/privacy are displayed with the opt-in disclosure. Users initiate enrollment by texting START to the published Corralio number."

Implementation consequence:

START is the canonical explicit recurring-SMS enrollment keyword for the initial program.

Do not treat:

- account creation
- email consent
- push consent
- OTP request
- phone-number possession
- sending an arbitrary inbound SMS

as equivalent to recurring transactional SMS consent.

---

# Keywords

Canonical submitted keywords:

Opt-in:
START

Opt-out:
STOP

Help:
HELP

These must remain consistent between:

- Telnyx Messaging Profile
- Corralio application state
- /sms
- /terms
- /privacy where applicable
- support documentation
- future SMS implementation

---

# Submitted START Response

Canonical response:

"Corralio: You're subscribed to Corralio messages. Msg frequency varies. Msg & data rates may apply. Reply STOP to unsubscribe or HELP for help."

Preserve the substance of this response.

Do not silently broaden consent to marketing.

---

# Submitted STOP Response

Canonical response:

"Corralio: You've been unsubscribed and will no longer receive messages. Reply START to subscribe again."

Implementation consequence:

STOP must result in Corralio application-level suppression in addition to any provider-level Telnyx suppression.

Provider suppression alone is not sufficient as Corralio's authoritative consent record.

---

# Submitted HELP Response

Canonical response:

"Corralio: Need help? Email help@corralio.com. Msg frequency varies. Msg & data rates may apply. Reply STOP to unsubscribe."

Public support address:

help@corralio.com

Do not introduce CO Services into routine customer-facing SMS copy unless legally/compliance-required.

Corralio remains the customer-facing identity.

---

# Submitted Sample Messages

Record the representative submitted messages.

## Account Notification

"Corralio: Schedule update - Saturday's game is now at 3:30 PM. View your schedule at https://corralio.com. Reply STOP to opt out."

## Customer Care

"Corralio: We received your schedule request. We'll let you know when your family sports schedule is ready. Reply STOP to opt out or HELP for help."

## 2FA

"Corralio: Your verification code is 123456. This code expires soon. Do not share this code with anyone."

The 123456 value is illustrative only.

Production OTP values must obviously be generated by the authentication system.

---

# Message Style / Encoding

Initial Corralio SMS templates should remain GSM-7 compatible where practical.

Prefer:

- straight apostrophes
- standard hyphens
- ordinary ASCII punctuation

Avoid unnecessary:

- smart quotes
- em dashes
- Unicode symbols
- emoji

when they would increase segment usage.

Actual segment encoding/count must be calculated rather than assuming character count equals SMS cost.

---

# Submitted Compliance URLs

Privacy Policy:

https://corralio.com/privacy

Terms:

https://corralio.com/terms

SMS CTA:

https://corralio.com/sms

These pages are live at campaign submission time.

Do not remove or materially contradict the SMS disclosures while the campaign relies on them.

---

# Submitted Content Attributes

Embedded Link:

YES

Approved initial link domain:

corralio.com

Do not use third-party URL shorteners for initial transactional SMS.

Embedded Phone Number:

NO

Number Pooling:

NO

Age-Gated Content:

NO

Direct Lending / Loan Arrangement:

NO

Implementation must remain consistent with these declarations.

If product behavior later requires changing one of these answers, flag the compliance impact before shipping the behavior.

---

# Commercial / Marketing Boundary

The submitted campaign explicitly excludes marketing.

Therefore initial SMS must not contain:

- HotelPlanner booking promotions
- affiliate offers
- subscription upgrade offers
- sponsored POIs
- advertisements
- discount codes
- promotional cross-sells

This does NOT prohibit transactional travel-related functionality where genuinely necessary to provide the Corralio service, but promotional content must not be disguised as transactional messaging.

Escalate ambiguity before implementation.

---

# Consent Boundary

Maintain separate concepts for:

1. phone identity
2. phone authentication / OTP
3. recurring transactional SMS consent
4. push consent
5. email consent
6. future marketing consent

Do not collapse them into one notification preference.

Recurring transactional SMS consent must have auditable state including at minimum:

- normalized phone identity or privacy-safe authoritative mapping
- consent timestamp
- consent source
- disclosure/program version
- current subscription status
- opt-out timestamp/state
- re-subscription history as appropriate

---

# Provider/Application Agreement

Telnyx provider-level START/STOP/HELP behavior is useful but does not replace Corralio application state.

Before broad SMS activation, prove:

START
→ provider subscribed
→ Corralio consent active

STOP
→ provider suppression
→ Corralio consent opted out
→ centralized outbound service refuses future sends

START after STOP
→ provider re-enabled
→ Corralio records valid re-consent

HELP
→ response matches submitted program behavior

Provider and application state must not silently diverge.

---

# Current Submission State

As of this decision:

10DLC Brand:
Submitted/established under CO Services as Sole Proprietor.

10DLC Campaign:
SUBMITTED FOR REVIEW.

Campaign approval:
PENDING / NOT YET VERIFIED.

Telnyx stated that campaign status will be communicated through:

- Telnyx campaign/brand profile
- account email
- campaign/webhook updates where configured

Do not represent the campaign as approved until approval is actually observed.

---

# Production Gate

Submission is NOT authorization to send production A2P traffic.

Do not enable unrestricted Corralio outbound SMS until:

- campaign is verified/approved;
- Corralio number is correctly associated with the approved campaign;
- required inbound/outbound implementation is operational;
- consent persistence is operational;
- START/STOP synchronization is verified;
- centralized safety/rate/cost controls are operational;
- applicable phone Auth/OTP safety gates are satisfied;
- founder explicitly authorizes production SMS.

Keep existing fail-closed SMS gates intact.

---

# Documentation Work

Create a canonical decision document such as:

docs/corralio/cpo/2026-09-03-founder-decision-submitted-10dlc-campaign-contract.md

Use repository naming conventions if a more appropriate canonical location exists.

Update:

- Corralio CPO execution state
- relevant SMS implementation notes
- Phase A+B authority references

so future agents know this document is the authoritative submitted 10DLC contract.

Do not duplicate large amounts of content into multiple documents. Link/reference the canonical decision instead.

Also preserve the previous campaign-submission packet as historical evidence rather than silently rewriting it as though it were the final submitted record.

---

# Drift Detection

Add a concise implementation checklist to the canonical decision.

Before SMS production activation, verify:

[ ] /sms CTA matches submitted opt-in workflow
[ ] Privacy SMS language remains compatible
[ ] Terms SMS program remains compatible
[ ] START behavior matches submission
[ ] STOP behavior matches submission
[ ] HELP behavior matches submission
[ ] Account Notification templates fit submitted use case
[ ] Customer Care templates fit submitted use case
[ ] 2FA templates fit submitted use case
[ ] Marketing SMS remains disabled
[ ] Embedded links use approved domain behavior
[ ] Number pooling remains disabled
[ ] No unregistered content category has been introduced

Any failed item requires founder/compliance review before launch.

---

# Required Output

Return:

## A. Canonical Document Created

Exact path.

## B. Submitted Campaign Contract

Concise summary.

## C. Authority Updates

Exact documents updated and what changed.

## D. Drift Risks

Any existing implementation or documentation that currently conflicts with the submitted campaign.

## E. Production SMS Gate

Current status and remaining blockers.

## F. Confirmation

Confirm:

- no SMS sent
- no Telnyx change
- no campaign change
- no schema change
- no deployment
- no external mutation
- no commit/push unless separately authorized

Run git diff --check.

Do not implement SMS behavior in this task.
