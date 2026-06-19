# HotelPlanner / Reservations.com API v2.3 — Complete Reference
> Partner: TournamentInsights | Account ID: [REDACTED_ACCOUNT_ID] | Site ID: [REDACTED_SITE_ID]

---

## Table of Contents

**API Requests**
1. [Authorization](#authorization)
2. [Site ID](#site-id)
3. [Calling a Method](#calling-a-method)

**Methods**
4. [ping](#ping)

**Search & Book**
5. [multiPropertySearch](#multipropertysearch)
6. [getProfile](#getprofile)
7. [propertyAvailability](#propertyavailability)
8. [verifyBundle](#verifybundle)
9. [reserve](#reserve)
10. [confirm3DSReservation](#confirm3dsreservation)

**View & Changes**
11. [getReservation](#getreservation)
12. [changeReservation](#changereservation)
13. [cancelReservation](#cancelreservation)

**Groups & Long Stay**
14. [createGroupRequest](#creategrouprequest)
15. [createLongStayRequest](#createlongstayrequest)

**Account Management**
16. [getClientSummary](#getclientsummary)
17. [getUserToken](#getusertoken)
18. [getUserInfo](#getuserinfo)
19. [setAccountStatus](#setaccountstatus)

**Reports**
20. [getReport / individual](#getreport--individual)

**Static Content**
21. [getDataFile](#getdatafile)

**Room Blocks** *(NEW)*
22. [getEvents](#getevents)

---

## Authorization

Every request must include a valid **Authorization Token** in the `Authorization` HTTP header.

The token has two parts separated by a dot (`.`):
```
Authorization: <REDACTED_API_KEY>.<REDACTED_SIGNATURE>
```

**Part 1 — API Key**
- Generated in your partner account alongside a Secret Encryption Key.
- The Secret Key is shown only once at generation — if lost, generate a new key pair.
- Base64URL-encode the API Key to form Part 1.

**Part 2 — Signature Key**
Combine: `base64UrlEncode(ApiKey) | AccountId | UnixEpochTime`
Hash with HMAC SHA256 using your Secret Key, then base64URL-encode the result.

**Full formula:**
```
base64UrlEncode(ApiKey) + "." + base64UrlEncode(HMACSHA256(base64UrlEncode(ApiKey) + "|" + AccountId + "|" + UnixEpoch, SecretKey))
```

> **Note:** Tokens are valid for approximately 30 seconds from creation.

**Authorization Failure Codes** (returned in `X-Auth-Status-Code` header on 401):

| Code | Reason |
|------|--------|
| 800 | Invalid API Credentials / No Credentials Found |
| 801 | Inactive API Key |
| 802 | API Key Expired |
| 803 | Signature encoding error |
| 804 | Site not found for supplied credentials |
| 805 | Signature failed verification |
| 806 | Missing Required Headers |
| 807 | SSL Required |
| 808 | POST Method Required |
| 809 | Invalid Domain |
| 810 | Epoch time has passed / token in signature is invalid |
| 811 | Missing Epoch |
| 812 | Invalid Epoch Value |
| 814 | Invalid Method for Domain |
| 815 | Invalid Source Code |
| 816 | Missing customerIPAddress |
| 817 | Internal Server Auth failed ipAddress authentication |

**Java Pseudo-Code Example:**
```java
String apiKey = "Your Api Key";
String secretKey = "Your Secret Encryption Key";
int accountId = "Your Partner Account Id";
int siteId = "Your Site Id";
long unixTime = GetEpoch();

String encodedApiKey = Base64.getUrlEncoder().withoutPadding().encodeToString(apiKey.getBytes("UTF8"));
String signatureKey = encodedApiKey + "|" + accountId + "|" + unixTime;

Mac sha256Hmac = Mac.getInstance("HmacSHA256");
SecretKeySpec keySpec = new SecretKeySpec(secretKey.getBytes(), "HmacSHA256");
sha256Hmac.init(keySpec);

byte[] bytesSignatureHash = sha256Hmac.doFinal(signatureKey.getBytes("UTF8"));
String authorizationToken = encodedApiKey + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(bytesSignatureHash);

String params = "?method=ping&epoch=unixTime&locale=en_US&customerIPAddress={ip}&customerUserAgent={ua}";
String json = "{\"echo\":\"Hello World\"}";

URL url = new URL("https://api.hotelplanner.com/hpapi/v2.3/" + params);
HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
conn.setRequestMethod("POST");
conn.setRequestProperty("Authorization", authorizationToken);
conn.setRequestProperty("x-hp-api-siteid", siteId);
conn.setRequestProperty("content-type", "application/json; charset=UTF-8");
```

**PHP Example:**
```php
function base64urlEncode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
$apiKey = "Your Api Key";
$secretKey = "Your Secret Encryption Key";
$accountId = "Your Partner Account Id";
$siteId = "Your Site Id";
$unixEpoch = time();
$encodedApiKey = base64urlEncode($apiKey);
$signatureKey = $encodedApiKey . "|" . $accountId . "|" . $unixEpoch;
$hash = hash_hmac('sha256', $signatureKey, $secretKey, true);
$authToken = $encodedApiKey . "." . base64urlEncode($hash);
// Then POST to API with Authorization header and x-hp-api-siteid header
```

---

## Site ID

Every request must include the `x-hp-api-siteid` HTTP header.

```
x-hp-api-siteid: [REDACTED_SITE_ID]
```

| Site ID | Domain |
|---------|--------|
| [REDACTED_SITE_ID] | [REDACTED_SITE_DOMAIN] |

---

## Calling a Method

- All requests must be **HTTPS POST**.
- Recommend requesting **GZIP** compression.
- Base URL: `https://api.hotelplanner.com/hpapi/v2.3/`
- **Exception:** Use `https://reserve-api.hotelplanner.com` for the `reserve` method only.

**URL Parameters:**

| Parameter | Example | Required | Description |
|-----------|---------|----------|-------------|
| method | ping | Required | See Methods section |
| epoch | 1511902772 | Required | The epoch time embedded in your auth token |
| customerIPAddress | 192.168.1.1 | Required | Customer's IP (fraud protection) |
| customerUserAgent | Mozilla/5.0... | Required | Customer's browser user agent (fraud protection) |
| locale | en_US | Optional | Language/country code. Default: en_US |
| currency | USD | Optional | 3-letter currency code. Default: USD |
| sc | tournamentinsights | Optional | Source code for tracking/special rates. Defaults to site default |

**Example POST:**
```
POST: https://api.hotelplanner.com/hpapi/v2.3/?method=multiPropertySearch&epoch=1511902772&locale=en_US&currency=USD&customerIPAddress=1.2.3.4&customerUserAgent=Mozilla/5.0&sc=tournamentinsights
```

---

## ping

Tests your authorization and connection.

**Arguments:**

| Argument | Example | Required | Description |
|----------|---------|----------|-------------|
| echo | hello world | Optional | String to echo back |

**Request:**
```json
{
  "echo": "hello world"
}
```

**Response:**
```json
{
  "echo": "hello world",
  "version": "2.3"
}
```

**Error Response:**
```json
{
  "message": "",
  "code": 500,
  "success": false,
  "errors": [{"message": ""}],
  "text": "INTERNAL SERVER ERROR"
}
```

---

## multiPropertySearch

Search for available properties by destination, returning the lowest rate per property sorted by distance. Uses a nightly cache of rates (rates may be up to 24 hours old).

**Arguments:**

| Argument | Example | Required | Description |
|----------|---------|----------|-------------|
| destination | Las Vegas, NV | Required (or hotelId) | City, address, zip, landmark, or lat/lon. All languages supported. |
| checkIn | 5/15/2026 | Required | mm/dd/yyyy format |
| checkOut | 5/17/2026 | Required | mm/dd/yyyy format |
| roomCount | 1 | Required | Number of rooms per night |
| adultCount | 1 | Required | Adults per room |
| childCount | 0 | Optional | Children per room |
| hotelId | 67747,28474 | Optional | Comma-delimited hotel IDs to limit search |
| hotelIdTypeId | 0 | Optional | Hotel ID type (0=Universal default, 1=EAN, 2=Booking.com, 3=Expedia, 4=IcePortal, 5=Agoda, 6=Priceline, 7=GetARoom, 9=TrustYou, 10=Travelport, 11=HotelPlanner Groups, 13=Worldspan, 14=HotelBeds, 15=Travolutionary) |
| propertyTypeIDs | [1,3,6,15] | Optional | Array of Property Type IDs to filter |
| distance | 10 | Optional | Search radius. Default 20. Max 60 mi / 100 km |
| unit | mi | Optional | mi (default) or km |
| unpublishedLevel | 5 | Optional | 5=Public (default), 10=Light, 15=Mobile, 20=Regular, 25=Strict, 30=Package Regular, 35=Package Strict |
| preferredHotelIdTypeId | 10 | Optional | Return results with this hotelIdTypeId. Default 0 |
| includeExternalBookings | true | Optional | Include VRBO listings (hotelIdTypeId=24). Default false |
| includeCancelPolicy | true | Optional | Include cancellation policy per rate. Default true |
| isAaa | true | Optional | Include AAA member rates. Default false |
| isGovernment | true | Optional | Include Military/Government rates. Default false |
| isSenior | true | Optional | Include AARP/Senior rates. Default false |
| paymentType | prePay | Optional | NONE (default, all), prePay, postPay |
| ratingMin | 3 | Optional | Minimum star rating (1–5 scale) |
| priceMin | 75 | Optional | Minimum price filter |
| priceMax | 150 | Optional | Maximum price filter |
| eventId | 12345 | Optional | Book-in-Block event ID |
| onlyShowEventRates | true | Optional | Limit to Book-in-Block rates only (default true when eventId provided) |
| limit | 200 | Optional | Max results |
| timeout | 14 | Optional | Seconds to wait. Min 3, default 7 |
| amenities | [44, 14] | Optional | Filter by amenity IDs (Free Breakfast=44, Gym=9, Pool=14, Family=1073745198, Restaurant=19, Meeting Rooms=2131, Kitchen=81, Pet Friendly=40, Jacuzzi=371, EV Charging=1073743315) |

**Request:**
```json
{
  "destination": "Baltimore, MD",
  "checkIn": "09/17/2026",
  "checkOut": "09/20/2026",
  "roomCount": "1",
  "adultCount": "1",
  "childCount": "0",
  "unpublishedLevel": "",
  "isAaa": true,
  "preferredHotelIdTypeId": 10,
  "includeExternalBookings": false,
  "timeout": "8"
}
```

**Response:**
```json
{
  "availabilities": [
    {
      "hotelId": 67747,
      "roomRates": [
        {
          "averageBeforeTax": 339,
          "rates": [
            {
              "totalBeforeTax": 1017,
              "effectiveDate": "2017-09-17",
              "expireDate": "2017-09-20",
              "amountAfterTax": 1219.59,
              "duration": 3,
              "amountBeforeTax": 339,
              "totalAfterTax": 3658.77
            }
          ],
          "mealPlanCode": "MP03",
          "totalBeforeTax": 1017,
          "averageAfterTax": 1219.59,
          "roomCount": 1,
          "totalAfterTax": 3658.77
        }
      ],
      "mealPlans": {
        "MP03": {
          "code": "MP03",
          "description": "Includes a breakfast per person per day.",
          "includesBreakfast": true,
          "includesDinner": false,
          "includesLunch": false,
          "name": "Bed and Breakfast"
        }
      },
      "hotelIdTypeId": 0,
      "currencyPrefix": "$",
      "currencyCode": "USD"
    }
  ],
  "hotels": {
    "0_67747": {
      "hotelId": 67747,
      "position": {"distanceFromSearch": 0.13, "longitude": -76.615, "latitude": 39.285},
      "propertyTypeId": 1,
      "contactInfo": {"city": "Baltimore", "countryCode": "US", "phone": "+1-866-111-1212", "state": "MD", "address1": "300 South Charles Street"},
      "rating": 3.5,
      "hotelName": "Sheraton Inner Harbor Hotel",
      "hotelIdTypeId": 0,
      "thumbnailUrl": "//media.hotelplanner.com/htlimg/50/50607/thumbnail-150.jpg",
      "review": 3.9,
      "reviewCount": 902,
      "instantBookable": "Y"
    }
  }
}
```

---

## getProfile

Returns detailed property content: photos, points of interest, descriptions, amenities, cleaning policies, and more.

> **Important:** Content from this method must NOT be used on pages indexed by search bots (Google, Bing). For non-indexed, transactional pages only.

> **AWS S3 Alternative (en_US, type=0 hotels only):** Download profiles faster directly from S3 — use the path returned by `getDataFile` with `dataFileName=HotelProfiles`.

**Arguments:**

| Argument | Example | Required | Description |
|----------|---------|----------|-------------|
| hotelID | 1123354 | Required | Hotel ID to look up |
| hotelIDTypeID | 0 | Optional | Hotel ID type (same codes as multiPropertySearch). Default 0 |

**Request:**
```json
{
  "hotelID": "123456",
  "hotelIDTypeID": "0"
}
```

**Response (abbreviated):**
```json
{
  "profiles": {
    "hpid": 123456,
    "hotelname": "The Name of Inn",
    "longitude": -80.1997055,
    "latitude": 26.7419856,
    "state": "FL",
    "amenityhighlights": ["24-hour fitness facilities", "Breakfast available (surcharge)", "Indoor pool"],
    "hoteldescription": {
      "aboutbrand": ["Boutique Hotel with Japanese inspired décor with live music every Sunday"],
      "airport": "Palm Beach International Airport (PBI) is 6 miles away.",
      "breakfast": "Breakfast available",
      "breakfastIsComplimentary": "true",
      "cleaningPolicies": {
        "enhancedCleaning": "This property advises that enhanced cleaning and guest safety measures are currently in place.",
        "contactlessCheckIn": "Contactless check-in and contactless check-out are available."
      },
      "internet": "Complimentary Wi-Fi",
      "parking": "",
      "miscfees": "<ul><li>Pet fee: USD 15 per pet, per night</li></ul>",
      "feeDetails": [
        {"currency": "USD", "category": "Pet Fee", "fee": 15, "amountType": "fixed", "frequency": "per night", "assignment": "per pet", "type": "Pet fee", "requirement": "optional"}
      ]
    },
    "landmarks": [{"distance": 1.3, "name": "Palm Beach County Convention Center"}],
    "amenities": ["24-hour fitness facilities", "ATM/banking", "Bar/lounge"],
    "address1": "1234 Main Street",
    "photos": [{"src": "//images.hotelplanner.com/hotels/.../image.jpg", "alt": "Hotel 1 of 66"}],
    "postalcode": 33480,
    "city": "West Palm Beach",
    "propertyType": {"code": 1, "name": "Hotel"},
    "countrycode": "US",
    "starrating": 3.5,
    "reviewratings": {"numbers": "3.0/5", "words": "Average", "basedon": "Based on 946 guest reviews"}
  }
}
```

---

## propertyAvailability

Returns live (or near-live) room-level availability from a specific property, including rates, cancellation policies, and a **bundle** string needed for `reserve`.

> **Note:** Bundles are valid for 48 hours. Use `verifyBundle` before `reserve`.

**Arguments:**

| Argument | Example | Required | Description |
|----------|---------|----------|-------------|
| hotelID | 1123354 | Required | Hotel ID |
| hotelIDTypeID | 0 | Optional | Hotel ID type. Default 0 |
| checkIn | 5/15/2026 | Required | mm/dd/yyyy |
| checkOut | 5/17/2026 | Required | mm/dd/yyyy |
| roomCount | 1 | Required | Rooms per night |
| adultCount | 1 | Required | Adults per room |
| childCount | 0 | Optional | Children per room |
| unpublishedLevel | 5 | Optional | Rate visibility level (same codes as multiPropertySearch) |
| isAaa | true | Optional | AAA rates. Default false |
| isGovernment | true | Optional | Military/Government rates. Default false |
| isSenior | true | Optional | AARP/Senior rates. Default false |
| skipExtraRateRules | false | Optional | Skip extra GDS call for nightly rate detail (may cause inaccurate nightly rates). Default false |
| paymentType | prePay | Optional | NONE, prePay, postPay |
| eventId | 12345 | Optional | Book-in-Block event ID |
| onlyShowEventRates | true | Optional | Limit to event rates only |
| limit | 200 | Optional | Max availabilities |
| suppressBundle | false | Optional | Set true if you don't need the bundle (faster response for caching) |
| timeout | 14 | Optional | Seconds. Min 3, default 10 |
| maxRoomTypes | 4 | Optional | Max room types per vendor |

**Request:**
```json
{
  "hotelID": "48272",
  "hotelIDTypeID": "0",
  "checkIn": "09/17/2026",
  "checkOut": "09/20/2026",
  "roomCount": "1",
  "adultCount": "1",
  "childCount": "0",
  "isSenior": true,
  "unpublishedLevel": "5",
  "timeout": "15"
}
```

**Response (abbreviated):**
```json
{
  "sourceCode": "YOURPROVIDEDSOURCECODE",
  "addOns": {
    "REFPROG01": {
      "status": "Quoted",
      "information": {"cancelPolicy": "Fully Flexible Plan, Free Cancel Anytime."},
      "id": "REFPROG01",
      "type": "REP",
      "requirement": "optional"
    }
  },
  "availabilities": [
    {
      "hotelId": 48272,
      "roomRates": [
        {
          "averageBeforeTax": 61.46,
          "bundle": "[ENCODED BUNDLE STRING]",
          "rates": [
            {"totalBeforeTax": 61.46, "effectiveDate": "2026-09-17", "expireDate": "2026-09-18", "amountAfterTax": 71.47, "duration": 1, "amountBeforeTax": 61.46, "totalAfterTax": 71.47}
          ],
          "totalBeforeTax": 184.38,
          "roomTypeCode": 2144165,
          "ratePlanCode": "15C",
          "mealPlanCode": "MP03",
          "earnings": {"yourShare": 4.68, "grossProfit": 15.63, "currencyCode": "USD"},
          "averageAfterTax": 71.47,
          "cancelPolicy": {
            "nonRefundable": false,
            "freeCancellationCutOff": "2026-09-16T20:00:00Z",
            "text": "Cancel before 09/16/2026 16:00 PM: FREE",
            "freeCancellation": true
          },
          "roomCount": 1,
          "payNow": true,
          "totalAfterTax": 214.41,
          "addOns": [{"currency": "USD", "amount": 15.00, "id": "REFPROG01"}],
          "promotionText": "Flash Deal - Won't last long!"
        }
      ],
      "ratePlans": {"15C": {"code": "15C", "description": "Multi Night", "name": "OTA PROMO 15C"}},
      "mealPlans": {"MP03": {"code": "MP03", "description": "Includes a breakfast per person per day.", "includesBreakfast": true, "name": "Bed and Breakfast"}},
      "hotelIdTypeId": 0,
      "currencyPrefix": "$",
      "feeDetails": [{"currency": "USD", "category": "Pet Fee", "fee": 15, "amountType": "fixed", "frequency": "per night", "assignment": "per pet", "type": "Pet fee", "requirement": "optional"}],
      "roomTypes": {
        "2144165": {"code": 2144165, "bedType": "queen", "description": "Our queen bed smoking room...", "accessible": false, "smoking": true, "name": "1 Queen Bed, Smoking Room"}
      },
      "currencyCode": "USD"
    }
  ]
}
```

**Upgraded Cancellation Policies:**
Qualifying prepay rates may include an optional upgraded cancellation policy add-on (type=`REP`). Include the add-on ID in the `reserve` call's `addOns` array.

---

## verifyBundle

Verifies a bundle from `propertyAvailability` is still available and the price hasn't changed. Call this before `reserve`.

> If the price changed, a new bundle and updated availability are returned.

**Arguments:**

| Argument | Example | Required | Description |
|----------|---------|----------|-------------|
| bundle | [string] | Required | Bundle string from propertyAvailability |

**Request:**
```json
{
  "bundle": "[BUNDLE STRING FROM propertyAvailability]"
}
```

**Response:**
```json
{
  "newTotal": 389.6,
  "currency": "USD",
  "isPriceChange": true,
  "newBundle": "[NEW BUNDLE STRING IF PRICE CHANGED]",
  "token": "<REDACTED_RESERVE_TOKEN>",
  "isStillAvailable": true,
  "availabilities": [
    {
      "hotelId": 27491,
      "roomRates": [
        {
          "averageBeforeTax": 166.27,
          "ratePlanCode": 1261259,
          "cancelPolicy": {"nonRefundable": true, "text": "NONREFUNDABLE", "freeCancellation": false},
          "supplier": "HotelPlanner",
          "totalAfterTax": 389.6,
          "payNow": true,
          "bundle": "[UPDATED BUNDLE]",
          "rates": [...],
          "totalBeforeTax": 332.54,
          "roomTypeCode": 38512,
          "averageAfterTax": 194.8,
          "roomCount": 1
        }
      ],
      "hotelIdTypeId": 0,
      "currencyCode": "USD"
    }
  ]
}
```

---

## reserve

Makes a reservation. Requires a bundle from `propertyAvailability`, traveler details, and payment information.

> **Use `reserve-api.hotelplanner.com`** (not the standard API domain) for this method only.
> **Set timeout to 120 seconds or higher.**
> **Call `verifyBundle` first** to protect against price changes or sold-out rooms.

**Arguments:**

| Argument | Example | Required | Description |
|----------|---------|----------|-------------|
| bundle | [string] | Required | Bundle from propertyAvailability (or updated from verifyBundle) |
| dupePreventionKey | GUID-accountid | Optional | Unique key per booking to prevent duplicates. 30–75 chars. |
| tracking | {...} | Optional | customField1–8 (255 chars each), jobCode (100 chars), keyword (300 chars) |
| comments | Ground level please | Optional | Notes for hotel front desk. Max 75 chars |
| addToExistingGDSPNR | [PNR] | Optional | Add to existing GDS PNR/record locator |
| addOns | ["REFPROG01"] | Optional | Add-on IDs from propertyAvailability (e.g. upgraded cancellation policy) |

**Request:**
```json
{
  "bundle": "[BUNDLE STRING]",
  "rooms": [
    {
      "firstName": "Susan",
      "lastName": "Smith",
      "adultCount": "1",
      "childCount": "0",
      "email": "susan.smith@hotelplanner.com"
    }
  ],
  "creditCard": {
    "nameOnCard": "Susan Smith",
    "cardNumber": "4387755555555550",
    "expireMonth": "12",
    "expireYear": "2020",
    "cvv": "123",
    "billingAddress": {
      "firstName": "Susan",
      "lastName": "Smith",
      "address1": "123 Main St.",
      "city": "West Palm Beach",
      "stateProvince": "FL",
      "postalCode": "33401",
      "countryCode": "US",
      "phone": "5555551234",
      "email": "susan.smith@hotelplanner.com"
    }
  },
  "confirmation": {
    "email": "guest@example.com",
    "emailCc": "cc@example.com",
    "sms": "5555551234",
    "message": "Thank you for booking."
  },
  "tracking": {
    "customField1": "custom value",
    "jobcode": "job code",
    "keyword": "keyword tracking"
  },
  "comments": "ground level is preferred"
}
```

**Response:**
```json
{
  "ConfirmationPageKey": "ZpfLbHFi0rbgAxbvSJ1pnBjOLtSOJdFQ...",
  "reservations": [
    {
      "itineraryNumber": "H1234567",
      "recordLocator": "ZSDAAa12345",
      "checkIn": "07/21/2016 01:07:00",
      "checkOut": "07/22/2016 01:07:00",
      "checkInTime": "3:00 PM",
      "checkOutTime": "11:00 AM",
      "taxes": 0,
      "firstName": "John",
      "email": "john.doe@example.com",
      "hotel": {
        "hotelID": 123456,
        "phone": "1-561-555-1234",
        "name": "The Name of Inn",
        "city": "West Palm Beach",
        "countryCode": "US",
        "address1": "1234 Main Street"
      },
      "status": "Confirmed",
      "subtotal": 98,
      "total": 98,
      "currencyCode": "USD",
      "fitID": 1426811,
      "rooms": [
        {
          "firstName": "John",
          "lastName": "Doe",
          "confirmationNumber": "ZY9L47ZZZ",
          "status": "Confirmed",
          "description": "Queen Bed Quiet Beach Side Room",
          "guests": [{"firstName": "John", "lastName": "Doe", "email": "john.doe@example.com", "isPrimary": true}]
        }
      ],
      "duration": 1
    }
  ]
}
```

**Key Error Responses:**

| Scenario | Code | Message |
|----------|------|---------|
| Sold out / rate changed | 409 | "We are sorry, but the requested room type has been sold out or the rate has changed..." |
| Declined credit card | 409 | "This credit card was declined without giving us a specific reason..." |
| Rate change (new bundle included) | 409 | "We were just informed by the hotel that the rate has changed from $X to $Y..." |
| Validation error | 422 | "bundle is required" |

**Test Reservations:** Use `4111111111111111` as credit card number for testing. Choose a postPay rate 30+ days out with free cancellation, then cancel immediately.

**White Label Checkout Alternative:** POST `bundle` form variable to `https://{your-white-label}/Accept/CheckOut.htm`. Also pass `ReturnPage` for sold-out redirects.

---

## confirm3DSReservation

Completes a 3D Secure authenticated reservation after the customer passes 3DS bank authentication. Called with the token from the `reserve` method's 409 `requiresAction` response.

> **Set timeout to 120 seconds or higher.**

**Arguments:**

| Argument | Example | Required | Description |
|----------|---------|----------|-------------|
| token | C4AC3FAD-9E02-16E0-... | Required | Token ID returned from the reserve method |

**Request:**
```json
{
  "token": "<REDACTED_RESERVATION_TOKEN>"
}
```

**Response:** Same structure as `reserve` response — returns full reservation confirmation with `itineraryNumber`, `rooms`, `hotel`, `status`, etc.

**3DS Flow Summary:**
1. Call `reserve` → receive 409 with `requiresAction: true` and a URL
2. Load the returned URL in an iframe
3. Customer completes 3DS authentication with their bank
4. Iframe posts `window.postMessage()` with `{status, eng, token}`
5. Call `confirm3DSReservation` with the token to complete booking

---

## getReservation

Looks up an existing reservation by itinerary number and email/phone.

**Arguments:**

| Argument | Example | Required | Description |
|----------|---------|----------|-------------|
| itineraryNumber | H1234567 | Required | Itinerary number from booking creation |
| emailAddress | john.doe@example.com | Required | Email address or phone number of guest |
| showRelated | true | Optional | Include related reservations (for multi-room bookings split across separate confirmations) |

**Request:**
```json
{
  "itineraryNumber": "H1234567",
  "emailAddress": "john.doe@example.com",
  "showRelated": true
}
```

**Response (abbreviated):**
```json
{
  "reservations": [
    {
      "itineraryNumber": "H1234567",
      "recordLocator": "ZSDAAa12345",
      "checkIn": "12/07/2019",
      "checkOut": "12/08/2019",
      "checkInTime": "3:00 PM",
      "checkOutTime": "11:00 AM",
      "taxes": 54.31,
      "formattedTaxes": "$54.31 USD",
      "firstName": "John",
      "hotel": {"hotelID": 123456, "name": "The Name of Inn", "city": "West Palm Beach", "address1": "1234 Main Street"},
      "status": "Confirmed",
      "subtotal": 98,
      "total": 98,
      "cancellationPolicy": "A $25 USD Fee Is Charged For All Canceled Reservations.",
      "changesAreAllowed": true,
      "isPrepaid": true,
      "currencyCode": "USD",
      "rooms": [{"firstName": "John", "lastName": "Doe", "confirmationNumber": "ZY9L47ZZZ", "status": "Confirmed"}],
      "duration": 1,
      "addOns": [{"id": "REFPROG01", "type": "REP", "status": "Active", "information": {"cancelPolicy": "Fully Flexible Plan, Free Cancel Anytime."}}]
    }
  ]
}
```

---

## changeReservation

Modifies an existing reservation. Currently supports **name changes** and **frequent guest number changes** only.

Check `changesAreAllowed` in `getReservation` response before calling.

**Arguments:**

| Argument | Example | Required | Description |
|----------|---------|----------|-------------|
| itineraryNumber | H1234567 | Required | Itinerary number |
| emailAddress | john.doe@example.com | Required | Guest email |
| firstName | John | Required | Guest first name |
| lastName | Doe | Required | Guest last name |
| roomNumber | 1 | Optional | Room to update. Default 1 |
| frequentGuestNumber | RA123456789 | Optional | Frequent guest / loyalty number |
| customField1–8 | string | Optional | Tracking fields (255 chars each) |
| specialRequest | string | Optional | Notes to hotel. Max 75 chars. (EVE and EPS reservations only) |
| smokingPreference | boolean | Optional | Smoking preference — not guaranteed. (EPS only) |

**Request:**
```json
{
  "itineraryNumber": "H1234567",
  "emailAddress": "john.doe@example.com",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response:** Full reservation object (same as `getReservation`).

---

## cancelReservation

Cancels a cancelable reservation.

> Best practice: cancel using the same `x-hp-api-siteid` used to book.

**Arguments:**

| Argument | Example | Required | Description |
|----------|---------|----------|-------------|
| itineraryNumber | H1234567 | Required | Itinerary number |
| emailAddress | john.doe@example.com | Required | Guest email |

**Request:**
```json
{
  "itineraryNumber": "H1234567",
  "emailAddress": "john.doe@example.com"
}
```

**Response:**
```json
{
  "success": "true"
}
```

---

## createGroupRequest

Creates a Group Request (5+ rooms). Hotels respond with negotiated offers. Bookings are completed directly with the on-property sales team.

> **For testing**, always send `comments` as `"test test"`.

**Key Arguments:**

| Argument | Example | Required | Description |
|----------|---------|----------|-------------|
| firstName | John | Required | |
| lastName | Doe | Required | |
| email | john.doe@example.com | Required | |
| numRooms | 12 | Required | 5+ for group; <5 requires 14+ night itinerary |
| split | 1 | Required | 1–4: how many hotels to split group across |
| rating | 3 | Required | 1=1-2★, 2=1-3★, 2.5=2-3★, 3=2-4★, 3.5=3-4★, 4=3-5★, 5=4-5★ |
| roomTypeCode | 1 | Required | 1=1K/Q, 2=1K Only, 3=2DBL(1-2), 4=2DBL(3), 5=2DBL(4), 6=Suite 1BR, 7=Suite 2BR, 8=Mixed |
| groupTypeCode | 70 | Required | 30=Business Meeting, 70=Convention, 80=Corporate Incentive, 90=Family Reunion, 140=Sports-Adult, 143=Sports-Youth, 150=Wedding, etc. |
| comments | test test | Required | Notes for hotels. 1024 char max |
| targetRate | 150 | Required | Max rate per room/night |
| minRate | 65 | Required | Min rate per room/night |
| itinerary | [{checkIn, checkOut, destination}] | Required | Array of itinerary objects |
| meetingSpaces | [{...}] | Optional | Meeting space requirements |
| roomDetails | [{stayDate, roomTypeCode, roomTypeCount}] | Optional | Detailed nightly room breakdown |
| responsesDueDate | 07/28/2027 | Optional | Decision deadline for hotels (mm/dd/yyyy) |
| groupName | The Great Group | Optional | Event/group name. 150 chars max |
| phone | 561-555-0001 | Optional* | *Required if SMSOptIn=1 |
| companyName | Worldwide Seminar, Inc. | Optional | |
| jobCode | Job:33244 | Optional | |
| keyword | group rates | Optional | |
| travelAgentID | 123456 | Optional | IATA ID |
| rebate | {amount, rebateCurrency, rebatePayToCode} | Optional | Per room/night rebate |

**Response:**
```json
{
  "groupRequest": {
    "postingID": 3001012
  }
}
```

---

## createLongStayRequest

Creates a Long Stay Request (same structure as group request, but for extended stays). If fewer than 5 rooms, itinerary must be 14+ nights.

**Key difference from createGroupRequest:** No `groupTypeCode` required. All other arguments and response are the same.

**Response:**
```json
{
  "longstayRequest": {
    "postingID": 3001012
  }
}
```

---

## getClientSummary

Returns all requests (group, individual, meeting space, approvals, events) for a given client email.

**Arguments:**

| Argument | Example | Required | Description |
|----------|---------|----------|-------------|
| emailAddress | someclient@gmail.com | Required | Client email |
| products | Request,Individual | Optional | Comma-delimited: All, Request, Individual, MeetingSpace, Approval, Event. Default: All |
| limit | 25 | Optional | Max records per product type. Default 25 |
| offset | 0 | Optional | Pagination offset. Default 0 |

**Request:**
```json
{
  "emailAddress": "john.doe@example.com",
  "products": "all",
  "limit": 25,
  "offset": 0
}
```

**Response:** Returns arrays for `requests`, `individuals`, `MeetingSpaces`, `Approvals`, and `Event` — each with full booking details including hotel info, status, itinerary, and cancellation policy.

---

## getUserToken

Generates a JWT for automatic user login on white label sites. Valid for **30 seconds**.

**Arguments:**

| Argument | Example | Required | Description |
|----------|---------|----------|-------------|
| userEmailAddress | user@example.com | Required | User email |
| userPassword | <REDACTED_PASSWORD> | Required | User password (min 7 chars if creating account) |

**Request:**
```json
{
  "userEmailAddress": "user@example.com",
  "userPassword": "<REDACTED_PASSWORD>"
}
```

**Response:**
```json
{
  "userToken": "eyJ0eXAiOiJKV1Qi...[JWT]",
  "token": "<REDACTED_USER_TOKEN>"
}
```

**Usage:** POST `userToken` form field to `{white-label}/Login.htm`. Optionally add `?returnToURL=%2FSearch%2F`.

---

## getUserInfo

Parses a JWT generated by `getUserToken`. Must be called within the token's valid period.

**Arguments:**

| Argument | Example | Required | Description |
|----------|---------|----------|-------------|
| userToken | eyJ0eXAi... | Required | JWT user token |
| fields | ["email","firstName"] | Optional | Fields to extract from token |

**Request:**
```json
{
  "userToken": "eyJ0eXAiOiJKV1Qi...",
  "fields": ["email", "firstName", "lastName", "userId"]
}
```

**Response:**
```json
{
  "email": "joe.smith@example.com",
  "firstName": "Joe",
  "lastName": "Smith",
  "userId": 12345
}
```

---

## setAccountStatus

Activates, deactivates, or sets an account to pending status.

> Once deactivated, an account cannot be reactivated.

**Arguments:**

| Argument | Example | Required | Description |
|----------|---------|----------|-------------|
| email | john.doe@example.com | Required | User email |
| active | true | Optional | true=activate pending account, false=deactivate. Default true |
| pending | false | Optional | true=put active account into pending status. Default false |

**Request:**
```json
{
  "email": "john.doe@example.com",
  "active": true,
  "pending": false
}
```

**Response:**
```json
{
  "success": true
}
```

---

## getReport / individual

Returns reporting data on individual hotel bookings.

> **Maximum 1 year of data per call.** At least one date range parameter required.

**Arguments (individual reportType):**

| Argument | Example | Required | Description |
|----------|---------|----------|-------------|
| reportType | individual | Required | Always "individual" for this report |
| returnType | csv | Optional | xlsx (default), csv, json |
| checkInDateStart/End | 09/17/2025 | Optional* | Check-in date range |
| checkOutDateStart/End | 09/17/2025 | Optional* | Check-out date range |
| cancelledDateStart/End | 09/17/2025 | Optional* | Cancellation date range |
| commissionReceivedDateStart/End | 09/17/2025 | Optional* | Commission received date range |
| partnerPaidDateStart/End | 09/17/2025 | Optional* | Partner paid date range |
| purchasedDateStart/End | 09/17/2025 | Optional* | Purchase date range |
| name | Susan Smith | Optional | Guest name (first or last sufficient) |
| hotelName | Best Western JFK | Optional | Hotel name |
| itineraryNumber | H1234567 | Optional | Itinerary or confirmation number |
| sourceCode | HotelPlannerOrganic | Optional | Comma-delimited source codes |
| includeCancelled | true | Optional | Include cancelled reservations. Default true |
| jobCode | ABC123 | Optional | |
| keyword | DowntownConcert | Optional | |
| customField1–8 | 12345 | Optional | |

*At least 1 date range required. Date formats: `yyyy-mm-dd`, `mm/dd/yyyy`, or ISO 8601 datetime.

**Request:**
```json
{
  "reportType": "individual",
  "purchasedDateStart": "2025-09-01T00:00:00.000-05:00",
  "purchasedDateEnd": "2025-12-31T23:59:59.999-05:00",
  "includeCancelled": false
}
```

---

## getDataFile

Downloads static data files updated weekly on Saturday mornings. File locations change weekly — always call this method to get the current path.

**Arguments:**

| Argument | Example | Required | Description |
|----------|---------|----------|-------------|
| dataFileName | AllProperties | Required | File name to download |

**Available File Names:**

| File Name | Description |
|-----------|-------------|
| AllProperties | All properties with basic address info and `HasContent` flag |
| HotelProfiles | S3 path format for individual hotel profile JSON |
| AllCurrencies | All currencies with current conversion rates (updated multiple times/day) |
| TrustYouIDMappings | Hotel ID → TrustYou hotel ID mappings |
| TravelportIDMappings | Hotel ID → Travelport hotel ID mappings |
| WorldspanIDMappings | Hotel ID → Worldspan hotel ID mappings |
| ExpediaIDMappings | Hotel ID → Expedia hotel ID mappings |
| PricelineIDMappings | Hotel ID → Priceline hotel ID mappings |
| GetARoomIDMappings | Hotel ID → GetARoom hotel ID mappings |
| BookingIDMappings | Hotel ID → Booking.com hotel ID mappings |
| TopSellingProperties | Best selling properties in rank order |
| Top1000SellersLastYear | Top 1000 sellers in last year |
| Top500SellersLastMonth | Top 500 sellers last month |
| HotelsOnly | Hotels only (excludes apartments, condos, etc.) |
| BrandCodes | Brand codes and names |
| PropertyTypes | Property Type IDs |

**Request:**
```json
{
  "dataFileName": "AllProperties"
}
```

**Response:**
```json
{
  "fileLocation": "https://s3.amazonaws.com/static.hotelplanner.com/API/SupplierMappings/AllProperties[guid].zip"
}
```

**Property Type Codes:**

| Code | Type |
|------|------|
| 0 | Unknown |
| 1 | Hotel |
| 2 | Motel |
| 3 | All-Inclusive Resort |
| 4 | Spa or Beach Resort |
| 5 | All-Suite or Extended Stay Hotel |
| 6 | Boutique Hotel |
| 7 | Bed & Breakfast |
| 8 | Casino |
| 9 | Convention or Events Center |
| 10 | Meeting Space |
| 11 | Hostel |
| 12 | Cabin or Ski Lodge |
| 13 | Guest House or Cottage |
| 14 | Aparthotel or Condo-Hotel |
| 15 | Apartment |
| 16 | Villa or Condo |
| 17 | Campsite or Campground Resort |
| 18 | Boat or Yacht |
| 19 | Luxury Tent |
| 20 | CVB or Visitors Agency |

---

## getEvents *(Room Blocks — NEW)*

Returns a list of Book-in-Block events.

**Arguments:**

| Argument | Example | Required | Description |
|----------|---------|----------|-------------|
| Active | true | Optional | true=current events only, false=all events. Default true |
| Limit | 100 | Optional | Max records. Default 100 |
| internalEventId | TBBS2021 | Optional | Your internal event ID to look up |

**Response:**
```json
{
  "events": [
    {
      "id": "7728",
      "eventSiteId": 4,
      "name": "Tampa Bay Boat Show",
      "startDate": "12/01/2026",
      "endDate": "12/07/2026",
      "reservationCutoffDate": "12/01/2026",
      "internalEventId": "TBBS2026",
      "description": "Lorem ipsum dolor sit amet...",
      "landingPageConfig": "LandingPage",
      "landingPageUrl": "https://www.hotelplanner.com/Event/1e30/",
      "collectFunds": true,
      "createDate": "2026-10-27T18:00:00Z",
      "updateDate": "2026-10-27T18:00:00Z"
    }
  ]
}
```

---

## Additional Methods (Not Yet Documented Here)

The following methods exist in the API and can be accessed via the partner portal. Documentation for each follows the same Request/Response pattern as above:

**Reports:** rfpCommissions, rfpRequests, paymentDetails, offlineCalls, getStats, checkoutPage

**Static Content:** getReviews, getRateCalender

**Room Blocks (NEW):** getEventDetails, getEventHotelDetails, createEventHotel, createEventRoomType, manageEventAttendees, moveEventReservation, getEventSubBlockSummary, getEventSubBlockDetails

**Site Management (NEW):** getAllSiteSettings, getSiteSetting, setSiteSetting, setHotelSpecificRules, getHotelSpecificRules, deleteHotelSpecificRules

**Points Management:** getPointsBalance, getPointsTransactions, addToPointsBalance

**Vouchers (NEW):** purchaseVouchers

**Simple Events:** getSimpleEvents, createSimpleEvent, changeSimpleEvent, deleteSimpleEvent

---

## Standard Error Response

All methods return this structure on error:

```json
{
  "message": "Description of error",
  "code": 500,
  "success": false,
  "errors": [
    {"message": "Detailed error message"}
  ],
  "text": "INTERNAL SERVER ERROR"
}
```

Common HTTP codes: 500 (server error), 409 (conflict — sold out, rate changed, card declined, 3DS required), 422 (validation error), 401 (unauthorized).

---

*Documentation captured from: https://tournamentinsights.hotelplanner.com/_Partner/API/*
*API Version: Reservations.com API v2.3*
