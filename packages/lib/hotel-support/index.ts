export const HOTEL_SUPPORT_RATES_CENTS = [500, 1000] as const;
export type HotelSupportRateCents = (typeof HOTEL_SUPPORT_RATES_CENTS)[number];

export const HOTEL_SUPPORT_TERMS_VERSION = "tournament_hotel_support_v1";

export const HOTEL_SUPPORT_TERMS_TEXT = `By submitting this enrollment, you confirm that you are authorized to enroll the identified tournament. TournamentInsights may provide a dedicated tournament hotel page and materials that the tournament can share with teams and families.

Eligible bookings that are successfully attributed to and validated through TournamentInsights may generate tournament support proceeds at the rate shown in this enrollment. Bookings, room nights, revenue, proceeds, and payment timing are not guaranteed. Cancellations, refunds, disputes, booking changes, duplicate transactions, fraud, errors, or ineligible bookings may reduce, reverse, or eliminate proceeds.

Proceeds become payable only after TournamentInsights receives and verifies the applicable funds from its hotel provider. TournamentInsights may adjust or reverse amounts associated with ineligible, refunded, disputed, duplicate, fraudulent, or erroneous bookings.

Participation does not create exclusive lodging rights unless separately agreed. You may not describe this program as a charitable donation, tax deduction, guaranteed payment, or hotel discount unless TournamentInsights explicitly authorizes that description.

TournamentInsights may pause or terminate participation because of conflicting housing arrangements, misuse, fraud, attribution or technical issues, legal or compliance concerns, or changes to the underlying hotel program.

Submitting this enrollment does not activate fee-enabled hotel routing. TournamentInsights must separately review, approve, and activate the tournament's Hotel Program.`;

export const HOTEL_SUPPORT_INVITATION_LIFETIME_DAYS = 14;

export const HOTEL_SUPPORT_RECIPIENT_TYPES = [
  "tournament_organization",
  "nonprofit_booster",
  "business",
  "individual",
  "other",
] as const;

export type HotelSupportRecipientType = (typeof HOTEL_SUPPORT_RECIPIENT_TYPES)[number];

export type HotelSupportSubmissionInput = {
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  contactTitle: string | null;
  expectedRecipientType: HotelSupportRecipientType;
  expectedRecipientName: string;
  confirmAuthority: boolean;
  confirmHousingEligibility: boolean;
  confirmNoGuarantee: boolean;
  confirmEligibleAttribution: boolean;
  confirmTerms: boolean;
};

export type HotelSupportSubmissionValidation =
  | { ok: true; value: HotelSupportSubmissionInput }
  | { ok: false; message: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requiredText(value: unknown, maxLength: number) {
  const normalized = String(value ?? "").trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function optionalText(value: unknown, maxLength: number) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return normalized.length <= maxLength ? normalized : undefined;
}

export function isHotelSupportRateCents(value: unknown): value is HotelSupportRateCents {
  return value === 500 || value === 1000;
}

export function formatHotelSupportRate(rateCents: HotelSupportRateCents) {
  return `$${(rateCents / 100).toFixed(2)} per eligible room night`;
}

export function validateHotelSupportSubmission(input: Record<string, unknown>): HotelSupportSubmissionValidation {
  const contactName = requiredText(input.contactName, 160);
  if (!contactName) return { ok: false, message: "Enter your name." };

  const contactEmail = requiredText(input.contactEmail, 320)?.toLowerCase() ?? null;
  if (!contactEmail || !EMAIL_PATTERN.test(contactEmail)) {
    return { ok: false, message: "Enter a valid email address." };
  }

  const contactPhone = optionalText(input.contactPhone, 50);
  if (contactPhone === undefined) return { ok: false, message: "Phone must be 50 characters or fewer." };
  const contactTitle = optionalText(input.contactTitle, 120);
  if (contactTitle === undefined) return { ok: false, message: "Role/title must be 120 characters or fewer." };

  const recipientType = String(input.expectedRecipientType ?? "") as HotelSupportRecipientType;
  if (!HOTEL_SUPPORT_RECIPIENT_TYPES.includes(recipientType)) {
    return { ok: false, message: "Choose an expected payment recipient type." };
  }
  const expectedRecipientName = requiredText(input.expectedRecipientName, 200);
  if (!expectedRecipientName) return { ok: false, message: "Enter the expected payment recipient name." };

  const confirmations = [
    input.confirmAuthority,
    input.confirmHousingEligibility,
    input.confirmNoGuarantee,
    input.confirmEligibleAttribution,
    input.confirmTerms,
  ];
  if (!confirmations.every((value) => value === true)) {
    return { ok: false, message: "Complete every required confirmation before submitting." };
  }

  return {
    ok: true,
    value: {
      contactName,
      contactEmail,
      contactPhone,
      contactTitle,
      expectedRecipientType: recipientType,
      expectedRecipientName,
      confirmAuthority: true,
      confirmHousingEligibility: true,
      confirmNoGuarantee: true,
      confirmEligibleAttribution: true,
      confirmTerms: true,
    },
  };
}
