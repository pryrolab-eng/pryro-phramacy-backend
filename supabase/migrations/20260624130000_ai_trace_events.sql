-- AI trace events: audit log for all AI drug safety and analytics calls
-- Serves as observability + audit trail for NVIDIA Nemotron / local rule usage

CREATE TABLE IF NOT EXISTS public.ai_trace_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id    text NOT NULL,
  tenant_id   uuid,  -- pharmacy_id (nullable for platform-level calls)
  feature     text NOT NULL,  -- 'drug_safety' | 'analytics'
  model       text NOT NULL,  -- e.g. 'nvidia/nemotron-3-ultra-550b-a55b'
  input_tokens  int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  latency_ms    int NOT NULL DEFAULT 0,
  success     boolean NOT NULL DEFAULT false,
  fallback    boolean NOT NULL DEFAULT false,  -- true = used local rules instead
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_trace_events_tenant_id   ON public.ai_trace_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_trace_events_feature    ON public.ai_trace_events(feature);
CREATE INDEX IF NOT EXISTS idx_ai_trace_events_created_at ON public.ai_trace_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_trace_events_success    ON public.ai_trace_events(success);

COMMENT ON TABLE public.ai_trace_events IS
  'Audit trail for AI calls — drug safety (Nemotron + local fallback) and analytics. '
  'Use for observability, cost tracking, and compliance auditing.';