"use server";

import {
  submitPublicHotelSupportEnrollment,
  type HotelSupportEnrollmentActionState,
} from "@/lib/hotelSupportEnrollment";

export async function submitHotelSupportEnrollmentAction(
  token: string,
  _previousState: HotelSupportEnrollmentActionState,
  formData: FormData
): Promise<HotelSupportEnrollmentActionState> {
  return submitPublicHotelSupportEnrollment(token, formData);
}
