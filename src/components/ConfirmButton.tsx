'use client';

import { useFormStatus } from 'react-dom';
import { useI18n } from '@/i18n/client';

/** Submit button that asks for confirmation before a destructive server action. */
export function ConfirmButton({
  children,
  className = 'btn-danger',
  formAction,
}: {
  children: React.ReactNode;
  className?: string;
  formAction?: (fd: FormData) => void | Promise<void>;
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
        if (!window.confirm(t('common.confirmDelete'))) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
