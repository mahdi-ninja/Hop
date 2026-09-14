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

export function CreateLinkForm({
  shortHost,
  onCreated,
  onCancel,
}: {
  shortHost: string;
  onCreated: (link: ApiLink) => void;
  onCancel: () => void;
}) {
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
    <form onSubmit={submit} className="space-y-5" noValidate>
      {formError && <ErrorBanner message={formError} />}
      <Field label="Destination URL" htmlFor="create-url" error={fieldErrors.url}>
        <input
          id="create-url"
          type="url"
          required
          inputMode="url"
          autoComplete="off"
          placeholder="https://example.com/a/very/long/path"
          className={inputClass}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-invalid={Boolean(fieldErrors.url)}
        />
      </Field>
      <Field label="Custom slug" hint="Optional. Leave empty for a random one." htmlFor="create-slug" error={fieldErrors.slug}>
        <div className="flex items-center rounded-xl bg-ground ring-1 ring-line ring-inset focus-within:bg-surface focus-within:ring-2 focus-within:ring-accent">
          <span className="pl-4 font-mono text-sm text-faint">{shortHost}/</span>
          <input
            id="create-slug"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={64}
            placeholder="launch-2026"
            className="h-11 min-w-0 flex-1 bg-transparent pr-4 pl-0.5 font-mono text-[15px] text-ink placeholder:text-faint focus:outline-none"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            aria-invalid={Boolean(fieldErrors.slug)}
          />
        </div>
      </Field>
      <Field label="Title" hint="Optional. We'll fetch it from the page." htmlFor="create-title" error={fieldErrors.title}>
        <input
          id="create-title"
          type="text"
          maxLength={200}
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button onClick={onCancel} disabled={submitting} variant="ghost">
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="lg" disabled={submitting || !url.trim()}>
          {submitting ? 'Shortening…' : 'Shorten link'}
        </Button>
      </div>
    </form>
  );
}
