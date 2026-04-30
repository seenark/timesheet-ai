export const INDEX_DEFINITIONS = [
  "DEFINE INDEX idx_organization_slug ON organization COLUMN slug UNIQUE;",

  "DEFINE INDEX idx_project_org ON project COLUMN organizationId;",
  "DEFINE INDEX idx_project_code ON project COLUMN code;",

  "DEFINE INDEX idx_user_org ON canonical_user COLUMN organizationId;",
  "DEFINE INDEX idx_user_email ON canonical_user COLUMN primaryEmail;",

  "DEFINE INDEX idx_identity_source ON external_identity COLUMNS source, externalId;",
  "DEFINE INDEX idx_identity_canonical ON external_identity COLUMN canonicalUserId;",
  "DEFINE INDEX idx_identity_status ON external_identity COLUMN status;",

  "DEFINE INDEX idx_event_org_time ON normalized_event COLUMNS organizationId, eventTime;",
  "DEFINE INDEX idx_event_user ON normalized_event COLUMN canonicalUserId;",
  "DEFINE INDEX idx_event_project ON normalized_event COLUMN projectId;",
  "DEFINE INDEX idx_event_source ON normalized_event COLUMNS source, sourceEventType;",

  "DEFINE INDEX idx_workunit_user_date ON work_unit COLUMNS canonicalUserId, date;",
  "DEFINE INDEX idx_workunit_project_date ON work_unit COLUMNS projectId, date;",

  "DEFINE INDEX idx_summary_scope_date ON daily_summary COLUMNS scopeType, scopeId, date;",

  "DEFINE INDEX idx_job_status ON job_run COLUMNS status, jobType;",

  "DEFINE INDEX idx_audit_target ON audit_log COLUMNS targetType, targetId;",
  "DEFINE INDEX idx_audit_timestamp ON audit_log COLUMN timestamp;",

  "DEFINE INDEX idx_raw_event_dedupe ON raw_event_payload COLUMNS connectionId, externalEventId;",
] as const;
