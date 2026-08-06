ALTER TABLE public.ai_run_documents
  DROP CONSTRAINT IF EXISTS ai_run_documents_document_type_check;

ALTER TABLE public.ai_run_documents
  ADD CONSTRAINT ai_run_documents_document_type_check
  CHECK (document_type IN (
    'internal_brief',
    'brand_instructions',
    'research_brief',
    'creative_direction',
    'pre_humanizer_pack',
    'pre_qa_pack',
    'qa_report'
  ));
