'use client';

import { useFormStatus } from 'react-dom';
import { useI18n } from '@/i18n/client';

/** Submit button that asks for confirmation (the generic delete question unless `message` says otherwise) before a destructive server action. */
export function ConfirmButton({
  children,
  className = 'btn-danger',
  formAction,
  message,
}: {
  children: React.ReactNode;
  className?: string;
  formAction?: (fd: FormData) => void | Promise<void>;
  message?: string;
}) {
  const { t } = useI18n();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      formAction={formAction}
      formNoValidate
      className={className}
      onClick={(e) => {
        if (!window.confirm(message ?? t('common.confirmDelete'))) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
