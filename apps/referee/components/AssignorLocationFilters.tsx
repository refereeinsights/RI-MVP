"use client";

import { useMemo, useState } from "react";
import CityMultiSelect from "./CityMultiSelect";

type Props = {
  citiesByState: Record<string, string[]>;
  initialCities: string[];
  stateSelections?: string[];
  isAllStates?: boolean;
};

export default function AssignorLocationFilters({
  citiesByState,
  initialCities,
  stateSelections,
  isAllStates,
}: Props) {
  const [selectedCities, setSelectedCities] = useState<string[]>(initialCities);

  const cityOptions = useMemo(() => {
    if (isAllStates || !stateSelections || stateSelections.length === 0) return [];
    const values = stateSelections.flatMap((st) => citiesByState[st] ?? []);
    const unique = Array.from(new Set(values));
    return unique.map((value) => ({ value, label: toTitleCase(value) }));
  }, [citiesByState, isAllStates, stateSelections]);

  const summaryLabel =
    (isAllStates || !stateSelections || stateSelections.length === 0) || cityOptions.length === 0
      ? "Select state first"
      : selectedCities.length === 0
      ? "All cities"
      : selectedCities.length <= 2
      ? selectedCities.map((c) => toTitleCase(c)).join(", ")
      : `${selectedCities.length} cities`;

  return (
    <>
      <div>
        <span className="label">Cities</span>
        <CityMultiSelect
          disabled={isAllStates || !stateSelections || stateSelections.length === 0 || cityOptions.length === 0}
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
