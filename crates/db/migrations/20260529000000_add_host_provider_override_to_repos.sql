-- User override for git host provider detection. NULL means "auto-detect from URL".
-- Stored as snake_case ProviderKind string ('git_hub' | 'azure_dev_ops' | 'git_lab').
ALTER TABLE repos ADD COLUMN host_provider_override TEXT;
