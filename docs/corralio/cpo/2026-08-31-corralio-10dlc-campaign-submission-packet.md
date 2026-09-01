# Corralio 10DLC Campaign Submission Packet

Date: 2026-08-31
Status: **PREPARED LOCALLY - NOT YET SUBMIT-READY**

## Registered business and campaign type

- Customer-facing brand: `Corralio`
- Legal operator: `CO Services`
- Telnyx/TCR brand classification: `Sole Proprietor` (founder-confirmed from the Telnyx account)
- Website: `https://corralio.com`
- Support: `help@corralio.com`
- Sender: `+1 509-206-9898`
- Campaign use case: `SOLE_PROPRIETOR`
- Marketing: `No`

Telnyx's current Sole Proprietor documentation requires a verified Sole Proprietor brand to create a campaign with the
`SOLE_PROPRIETOR` use case. This is the campaign classification, not a reason to omit the actual traffic from the description
and samples. Corralio's intended traffic includes one-time verification codes, customer-care replies, and transactional account
and family-schedule notifications. Those message categories must remain consistent throughout the registration. See:

- https://developers.telnyx.com/docs/messaging/10dlc/sole-proprietor
- https://support.telnyx.com/en/articles/10684248-10dlc-use-cases
- https://support.telnyx.com/en/articles/10715016-10dlc-inaccurate-or-inconsistency-error

## Campaign Description

Corralio provides one-time account verification codes, customer care, and transactional account and family-sports schedule
notifications. Users may text Corralio with schedule information and may receive schedule confirmations, changes, event and
arrival reminders, leave-by notifications, and replies to requests they initiate. Messages are sent only to users who opt in.
No marketing or promotional messages are sent through this campaign.

## Opt-In Workflow Description

After Corralio SMS is activated, users visit `https://corralio.com/sms`, where the Corralio phone number and disclosure appear
together. The page directs users to text START to 509-206-9898. The adjacent disclosure states that by texting START, the user
agrees to receive recurring transactional messages about the user's Corralio account and family sports schedules; message
frequency varies; message and data rates may apply; STOP opts out; HELP provides help; and consent is not a condition of
purchase. The page links to `https://corralio.com/terms` and `https://corralio.com/privacy`. The inbound system records the START
request and permits application-originated transactional messages only while durable consent is active. A future phone-auth
form must present its own adjacent OTP disclosure before it may be included as a second opt-in path; no such form is claimed in
this submission workflow today.

## Keywords and automatic responses

- Opt-In Keywords: `START`
- Opt-Out Keywords: `STOP`
- Help Keywords: `HELP`
- Opt-In Message: `Corralio: You are subscribed to transactional messages. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out or HELP for help.`
- Opt-Out Message: `Corralio: You are unsubscribed and will no longer receive messages. Reply START to subscribe again.`
- Help Message: `Corralio: Need help? Email help@corralio.com. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out.`

The application must also honor other reasonable opt-out requests; keyword automation is not the exclusive revocation path.

## Sample messages

1. `Corralio verification code: 847291. It expires in 10 minutes. Do not share this code. Reply STOP to opt out.`
2. `Corralio: Saturday's game is now at 3:30 PM at Dwight Merkel Sports Complex. Reply STOP to opt out or HELP for help.`
3. `Corralio: Leave by 7:14 AM for your 8:00 AM game. Estimated drive time is 32 minutes. Reply STOP to opt out.`
4. `Corralio: Your weekend plan is ready: https://corralio.com/ Reply STOP to opt out or HELP for help.`

These are privacy-minimized, contain no child name, use GSM-7-safe characters, and are each below 160 characters. The fourth
sample substantiates the Embedded Link answer with Corralio's full domain and no third-party shortener.

## Compliance URLs

- Privacy URL: `https://corralio.com/privacy`
- Terms URL: `https://corralio.com/terms`
- SMS Opt-In URL after activation: `https://corralio.com/sms`

The three routes exist locally. They are not claimed to be deployed until an authorized production deployment is independently
verified.

## Campaign Attributes

- Embedded Link: `YES`
- Embedded Phone Number: `NO`
- Number Pooling: `NO`
- Age-Gated Content: `NO`
- Direct Lending or Loan Arrangement: `NO`

## Activation and submission blockers

The founder **cannot submit this packet as an implemented live workflow yet**. The following exact gates remain:

1. The Phase A+B capped test-environment vendor spike must pass with a test Telnyx credential, sender/profile, webhook public
   key, hard spend/segment cap, disposable test number, test Supabase phone Auth/Send SMS Hook configuration, CAPTCHA/rate-limit
   controls, and dedicated channel-identity HMAC secret.
2. The signed inbound webhook, replay protection, durable START/STOP synchronization, centralized consent-aware send gate, and
   provider opt-out consistency must be implemented and verified under that approved Phase A+B sequence.
3. The public SMS opt-in flag must remain off until those controls are operational. It may then be enabled through an authorized
   configuration change and deployment.
4. Production must be checked directly to confirm that `/privacy`, `/terms`, and the enabled `/sms` disclosure are publicly
   reachable and match this packet exactly.
5. Telnyx campaign/profile STOP, START, and HELP responses must be reviewed against the exact GSM-7 copy above before submission.

No Telnyx API call, Telnyx configuration, live SMS, database migration, production configuration, campaign submission, push, or
deployment was authorized or performed by this compliance-surface implementation.

## Founder/legal review items

The public Terms intentionally do not invent governing law, venue, arbitration, or class-action-waiver provisions because the
repository contains no authoritative decision for them. The disclaimer and liability language should receive legal review before
the terms are treated as final legal advice. The Privacy Policy uses purpose-based retention language rather than fabricating a
fixed retention period; a future approved retention schedule should replace that general language when one exists.
