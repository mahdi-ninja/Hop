import { useState, type FormEvent } from 'react';
import { api, ApiError, errorMessage } from '../api/client';
import type { ApiLink } from '../api/types';
import { Button, ErrorBanner, Field, inputClass } from './ui';

type FieldName = 'url' | 'slug' | 'title';

const FIELD_BY_CODE: Record<string, FieldName> = {
  INVALID_URL: 'url',
  INVALID_SLUG: 'slug',
  RESERVED_SLUG: 'slug',
  SLUG_TAKEN: 'slug',
};

export function CreateLinkForm({ onCreated, onCancel }: { onCreated: (link: ApiLink) => void; onCancel: () => void }) {
  const [url, setUrl] = useState('');
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      const link = await api.createLink({
        url: url.trim(),
        ...(slug.trim() ? { slug: slug.trim() } : {}),
        ...(title.trim() ? { title: title.trim() } : {}),
      });
      onCreated(link);
    } catch (err) {
      const field = err instanceof ApiError ? FIELD_BY_CODE[err.code] : undefined;
      if (field) setFieldErrors({ [field]: errorMessage(err) });
      else setFormError(errorMessage(err));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {formError && <ErrorBanner message={formError} />}
      <Field label="Destination URL" error={fieldErrors.url}>
        <input
          type="url"
          required
          inputMode="url"
          autoComplete="off"
          placeholder="https://example.com/some/long/path"
          className={inputClass}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-invalid={Boolean(fieldErrors.url)}
        />
      </Field>
      <Field label="Custom slug" hint="optional — random if empty" error={fieldErrors.slug}>
        <input
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={64}
          placeholder="e.g. launch-2026"
          className={`${inputClass} font-mono`}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          aria-invalid={Boolean(fieldErrors.slug)}
        />
      </Field>
      <Field label="Title" hint="optional — fetched from the page if empty" error={fieldErrors.title}>
        <input
          type="text"
          maxLength={200}
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={submitting || !url.trim()}>
          {submitting ? 'Creating…' : 'Create link'}
        </Button>
      </div>
    </form>
  );
}
