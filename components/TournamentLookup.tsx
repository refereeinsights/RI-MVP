import TournamentLookupClient from "./TournamentLookupClient";

export default function TournamentLookup({
  onSelectFieldName,
  fallbackFieldName,
  label = "Tournament",
  description,
}: {
  onSelectFieldName: string;
  fallbackFieldName: string;
  label?: string;
  description?: string;
}) {
  const inputId = `lookup-${fallbackFieldName}`;
  return (
    <div style={{ fontSize: 12, fontWeight: 700, display: "flex", flexDirection: "column", gap: 4 }}>
      <label htmlFor={inputId}>{label}</label>
      <TournamentLookupClient
        onSelectFieldName={onSelectFieldName}
        fallbackFieldName={fallbackFieldName}
        description={description}
        inputId={inputId}
      />
    </div>
  );
}
