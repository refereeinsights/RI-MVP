"use client";

import { useState } from "react";

type Props = {
  tournamentId: string;
  tournamentName: string;
  canSubmit: boolean;
  disabledMessage?: string | null;
};

type SubmitState = "idle" | "saving" | "success" | "error";

export default function RefereeReviewForm({
  tournamentId,
  tournamentName,
  canSubmit,
  disabledMessage,
}: Props) {
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cashTournament, setCashTournament] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || state === "saving") return;

    const formData = new FormData(event.currentTarget);
      const payload = {
        tournament_id: tournamentId,
        tournament_name: tournamentName,
        overall_score: Number(formData.get("overall_score") ?? 0),
        logistics_score: Number(formData.get("logistics_score") ?? 0),
        facilities_score: Number(formData.get("facilities_score") ?? 0),
        pay_score: Number(formData.get("pay_score") ?? 0),
        support_score: Number(formData.get("support_score") ?? 0),
        worked_games: formData.get("worked_games")
          ? Number(formData.get("worked_games"))
          : null,
        shift_detail: String(formData.get("shift_detail") ?? "").trim(),
        ref_cash_tournament: formData.get("ref_cash_tournament") === "on",
        ref_cash_at_field: formData.get("ref_cash_at_field") === "on",
        level_of_competition: String(formData.get("level_of_competition") ?? "").trim() || null,
        referee_food: (formData.get("referee_food") as string | null) || null,
        facilities: (formData.get("facilities") as string | null) || null,
        referee_tents: (formData.get("referee_tents") as string | null) || null,
        travel_lodging: (formData.get("travel_lodging") as string | null) || null,
        ref_game_schedule: (formData.get("ref_game_schedule") as string | null) || null,
        ref_parking: (formData.get("ref_parking") as string | null) || null,
        ref_parking_cost: (formData.get("ref_parking_cost") as string | null) || null,
        ref_mentors: (formData.get("ref_mentors") as string | null) || null,
        assigned_appropriately: (formData.get("assigned_appropriately") as string | null) || null,
      };

      if (
        [payload.overall_score, payload.logistics_score, payload.facilities_score, payload.pay_score, payload.support_score].some(
          (value) => Number.isNaN(value) || value < 1 || value > 5
        )
      ) {
        setErrorMessage("Scores must be between 1 and 5 whistles.");
        setState("error");
        return;
      }

    setState("saving");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/referee-reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? "Unable to submit review.");
      }
      (event.target as HTMLFormElement).reset();
      setCashTournament(false);
      setState("success");
    } catch (err: any) {
      setState("error");
      setErrorMessage(err?.message ?? "Unable to submit review.");
    }
  }

  if (!canSubmit) {
    return (
      <div className="reviewFormDisabled">
        <p>{disabledMessage ?? "You must be a verified referee to submit feedback."}</p>
      </div>
    );
  }

  return (
    <form className="reviewForm" onSubmit={handleSubmit}>
      <h3>Share your experience</h3>
      <p className="reviewForm__hint">
        Scores are private to referees until approved. Rate each category from 1 to 5 whistles (1 =
        unacceptable, 5 = outstanding) and add as much context as possible—logistics, support, and
        anything crews should know before accepting games.
      </p>

      <div className="reviewForm__grid">
        <label>
          <span>Overall shift score</span>
          <select name="overall_score" defaultValue="5" required>
            <option value="5">5 - Outstanding</option>
            <option value="4">4</option>
            <option value="3">3</option>
            <option value="2">2</option>
            <option value="1">1 - Unacceptable</option>
          </select>
        </label>
        <label>
          <span>Logistics &amp; scheduling</span>
          <select name="logistics_score" defaultValue="5" required>
            <option value="5">5 - Outstanding</option>
            <option value="4">4</option>
            <option value="3">3</option>
            <option value="2">2</option>
            <option value="1">1 - Unacceptable</option>
          </select>
        </label>
        <label>
          <span>Facilities &amp; fields</span>
          <select name="facilities_score" defaultValue="5" required>
            <option value="5">5 - Outstanding</option>
            <option value="4">4</option>
            <option value="3">3</option>
            <option value="2">2</option>
            <option value="1">1 - Unacceptable</option>
          </select>
        </label>
        <label>
          <span>Pay accuracy</span>
          <select name="pay_score" defaultValue="5" required>
            <option value="5">5 - Outstanding</option>
            <option value="4">4</option>
            <option value="3">3</option>
            <option value="2">2</option>
            <option value="1">1 - Unacceptable</option>
          </select>
        </label>
        <label>
          <span>Organizer support</span>
          <select name="support_score" defaultValue="5" required>
            <option value="5">5 - Outstanding</option>
            <option value="4">4</option>
            <option value="3">3</option>
            <option value="2">2</option>
            <option value="1">1 - Unacceptable</option>
          </select>
        </label>
        <label className="reviewForm__cash">
          <span>Cash tournament</span>
          <input
            type="checkbox"
            name="ref_cash_tournament"
            onChange={(event) => setCashTournament(event.currentTarget.checked)}
          />
        </label>
        <label className="reviewForm__cash">
          <span>Cash at field</span>
          <input type="checkbox" name="ref_cash_at_field" disabled={!cashTournament} />
        </label>
        <label>
          <span>Games worked</span>
          <input type="number" name="worked_games" min={0} max={30} placeholder="e.g. 4" />
        </label>
      </div>

      <div className="reviewForm__grid" style={{ marginTop: 16 }}>
        <label>
          <span>Level of competition</span>
          <input name="level_of_competition" type="text" placeholder="e.g. premier, gold, academy" />
        </label>
        <label>
          <span>Referee food</span>
          <select name="referee_food" defaultValue="">
            <option value="">Select</option>
            <option value="snacks">Snacks</option>
            <option value="meal">Meal</option>
          </select>
        </label>
        <label>
          <span>Facilities</span>
          <select name="facilities" defaultValue="">
            <option value="">Select</option>
            <option value="restrooms">Restrooms</option>
            <option value="portables">Portables</option>
          </select>
        </label>
        <label>
          <span>Referee tents</span>
          <select name="referee_tents" defaultValue="">
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label>
          <span>Travel lodging</span>
          <select name="travel_lodging" defaultValue="">
            <option value="">Select</option>
            <option value="hotel">Hotel</option>
            <option value="stipend">Stipend</option>
          </select>
        </label>
        <label>
          <span>Game schedule</span>
          <select name="ref_game_schedule" defaultValue="">
            <option value="">Select</option>
            <option value="too close">Too close</option>
            <option value="just right">Just right</option>
            <option value="too much down time">Too much down time</option>
          </select>
        </label>
        <label>
          <span>Referee parking</span>
          <select name="ref_parking" defaultValue="">
            <option value="">Select</option>
            <option value="close">Close</option>
            <option value="a stroll">A stroll</option>
            <option value="a hike">A hike</option>
          </select>
        </label>
        <label>
          <span>Parking cost</span>
          <select name="ref_parking_cost" defaultValue="">
            <option value="">Select</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        <label>
          <span>Mentors</span>
          <select name="ref_mentors" defaultValue="">
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label>
          <span>Assigned appropriately</span>
          <select name="assigned_appropriately" defaultValue="">
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
      </div>

      <label className="reviewForm__textarea">
        <span>What should other referees know?</span>
        <textarea
          name="shift_detail"
          rows={5}
          maxLength={1200}
          placeholder="Crew size, travel between fields, pay timing, security support, hospitality, etc."
          required
        />
      </label>

      {errorMessage && <p className="reviewForm__error">{errorMessage}</p>}
      {state === "success" && (
        <p className="reviewForm__success">
          Thanks for submitting. Your report is in the queue for moderator review.
        </p>
      )}

      <button
        className="reviewForm__submit"
        type="submit"
        disabled={state === "saving"}
      >
        {state === "saving" ? "Submitting…" : "Submit referee review"}
      </button>
    </form>
  );
}
