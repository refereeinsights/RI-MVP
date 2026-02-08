"use client";

import { useMemo, useState } from "react";
import CityMultiSelect from "./CityMultiSelect";

type Props = {
  states: string[];
  citiesByState: Record<string, string[]>;
  initialState: string;
  initialCities: string[];
};

export default function AssignorLocationFilters({
  states,
  citiesByState,
  initialState,
  initialCities,
}: Props) {
  const [selectedState, setSelectedState] = useState(initialState);
  const [selectedCities, setSelectedCities] = useState<string[]>(initialCities);

  const cityOptions = useMemo(() => {
    const values = selectedState ? citiesByState[selectedState] ?? [] : [];
    return values.map((value) => ({ value, label: toTitleCase(value) }));
  }, [selectedState, citiesByState]);

  const summaryLabel =
    !selectedState || cityOptions.length === 0
      ? "Select state first"
      : selectedCities.length === 0
      ? "All cities"
      : selectedCities.length <= 2
      ? selectedCities.map((c) => toTitleCase(c)).join(", ")
      : `${selectedCities.length} cities`;

  function handleStateChange(next: string) {
    setSelectedState(next);
    setSelectedCities([]);
  }

  return (
    <>
      <label style={{ display: "flex", flexDirection: "column", fontWeight: 700, color: "#0b1f14" }}>
        <span style={{ marginBottom: 6 }}>State</span>
        <select
          name="state"
          value={selectedState}
          onChange={(event) => handleStateChange(event.target.value)}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.2)",
            background: "#fff",
          }}
        >
          <option value="">All</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <div>
        <span className="label">Cities</span>
        <CityMultiSelect
          disabled={!selectedState || cityOptions.length === 0}
          summaryLabel={summaryLabel}
          options={cityOptions}
          selections={selectedCities}
          onToggle={(city, checked) => {
            setSelectedCities((prev) => {
              if (checked) return prev.includes(city) ? prev : [...prev, city];
              return prev.filter((c) => c !== city);
            });
          }}
        />
      </div>
    </>
  );
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");
}
