-- CHECK treats NULL as satisfied: require a non-null positive version explicitly.
ALTER TABLE email_messages DROP CONSTRAINT email_quote_version_check;
ALTER TABLE email_messages ADD CONSTRAINT email_quote_version_check CHECK (
  (quote_id IS NULL AND quote_version IS NULL) OR
  (quote_id IS NOT NULL AND quote_version IS NOT NULL AND quote_version > 0)
);
