'use client';

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
  return (
    <button
      type="submit"
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
