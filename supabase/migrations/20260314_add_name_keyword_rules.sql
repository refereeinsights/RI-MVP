-- Add high-confidence name keyword rules for common sports.
insert into public.sport_validation_rules (rule_name, rule_type, pattern, detected_sport, confidence_score, auto_confirm, priority, active, notes)
values
  ('name-basketball', 'name_contains', 'basketball', 'basketball', 0.96, true, 125, true, 'Keyword in name'),
  ('name-softball', 'name_contains', 'softball', 'softball', 0.96, true, 125, true, 'Keyword in name'),
  ('name-baseball', 'name_contains', 'baseball', 'baseball', 0.96, true, 125, true, 'Keyword in name'),
  ('name-hockey', 'name_contains', 'hockey', 'hockey', 0.96, true, 125, true, 'Keyword in name'),
  ('name-lacrosse', 'name_contains', 'lacrosse', 'lacrosse', 0.96, true, 125, true, 'Keyword in name'),
  ('name-volleyball', 'name_contains', 'volleyball', 'volleyball', 0.96, true, 125, true, 'Keyword in name'),
  ('name-football', 'name_contains', 'football', 'football', 0.96, true, 125, true, 'Keyword in name'),
  ('name-futsal', 'name_contains', 'futsal', 'futsal', 0.96, true, 125, true, 'Keyword in name')
on conflict (rule_name) do update set
  rule_type = excluded.rule_type,
  pattern = excluded.pattern,
  detected_sport = excluded.detected_sport,
  confidence_score = excluded.confidence_score,
  auto_confirm = excluded.auto_confirm,
  priority = excluded.priority,
  active = excluded.active,
  notes = excluded.notes,
  updated_at = now();
