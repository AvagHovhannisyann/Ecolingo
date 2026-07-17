-- Diagnostic results (spec §7.5, IDEA-005/006): deterministic 0..1 scores
-- from the onboarding diagnostic; null until the learner takes it.
alter table public.profiles
  add column math_readiness real check (math_readiness between 0 and 1),
  add column graph_reading real check (graph_reading between 0 and 1);
