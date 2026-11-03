'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { connectT212Action, disconnectT212Action, syncT212Action } from '@/app/actions';
import { Field } from '@/components/ui';
import { useI18n } from '@/i18n/client';

function Submit({ label, className = 'btn-primary' }: { label: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending}>
      {pending ? '…' : label}
    </button>
  );
}

function Message({ state, okKey }: { state: { ok: boolean; code?: string } | null; okKey: string }) {
  const { t } = useI18n();
  if (!state) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? 'text-positive' : 'text-negative'}`}>
      {state.ok ? t(okKey) : t(`t212.errors.${state.code ?? 'network'}`)}
    </p>
  );
}

/** Connect form (paste key + secret) shown when no key is stored, or to replace one. */
export function T212ConnectForm({ env, replacing = false }: { env: string; replacing?: boolean }) {
  const { t } = useI18n();
  const [state, action] = useActionState(connectT212Action, null);
  return (
    <form action={action} className="space-y-3" autoComplete="off">
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Field label={t('t212.env')}>
          <select name="env" defaultValue={env} className="input">
            <option value="live">{t('t212.envLive')}</option>
            <option value="demo">{t('t212.envDemo')}</option>
          </select>
        </Field>
        <Field label={t('t212.apiKey')}>
          <input name="apiKey" type="password" required autoComplete="off" spellCheck={false} className="input font-mono" />
        </Field>
      </div>
      <Field label={`${t('t212.apiSecret')} (${t('t212.apiSecretHint')})`}>
        <input name="apiSecret" type="password" autoComplete="off" spellCheck={false} className="input font-mono" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Submit label={replacing ? t('t212.replace') : t('t212.connect')} />
        <Message state={state} okKey="t212.connected" />
      </div>
    </form>
  );
}

export function T212Actions() {
  const { t } = useI18n();
  const [state, action] = useActionState(syncT212Action, null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={action}>
        <Submit label={`↻ ${t('t212.syncNow')}`} />
      </form>
      <form action={disconnectT212Action}>
        <button
          className="btn-danger"
          onClick={(e) => {
            if (!window.confirm(t('t212.disconnectConfirm'))) e.preventDefault();
          }}
        >
          {t('t212.disconnect')}
        </button>
      </form>
      <Message state={state} okKey="t212.synced" />
    </div>
  );
}
