import { deleteCategoryAction, saveCategoryAction } from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Card, Field, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { categoryName } from '@/lib/labels';
import { listCategories } from '@/lib/repo';
import { CATEGORY_KINDS } from '@/lib/types';

export default async function CategoriesPage() {
  const { t } = await getI18n();
  const categories = listCategories();

  const kindSelect = (value: string) => (
    <select name="kind" defaultValue={value} className="input">
      {CATEGORY_KINDS.map((k) => (
        <option key={k} value={k}>
          {t(`categories.kinds.${k}`)}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <PageHeader title={t('categories.title')} subtitle={t('categories.kindHint')} />

      <Card title={t('categories.new')} className="mb-4">
        <form action={saveCategoryAction} className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_auto_10rem_10rem_auto] sm:items-end">
          <Field label={t('common.name')} className="col-span-2 sm:col-span-1">
            <input name="name" required className="input" />
          </Field>
          <Field label={t('common.color')}>
            <input type="color" name="color" defaultValue="#6366f1" className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-transparent" />
          </Field>
          <Field label={t('common.kind')}>{kindSelect('expense')}</Field>
          <Field label={`${t('categories.monthlyBudget')} (€)`}>
            <input name="monthlyBudget" inputMode="decimal" className="input" />
          </Field>
          <button className="btn-primary col-span-2 sm:col-span-1">{t('common.add')}</button>
        </form>
      </Card>

      <Card>
        <ul className="divide-y divide-line/70">
          {categories.map((c) => (
            <li key={c.id} className="py-3">
              <form action={saveCategoryAction} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_auto_10rem_10rem_auto_auto]">
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="displayName" value={categoryName(c, t)} />
                <Field label={c.builtin ? t('categories.builtin') : t('categories.custom')} className="col-span-2 sm:col-span-1">
                  <input name="name" defaultValue={categoryName(c, t)} className="input" />
                </Field>
                <Field label={t('common.color')}>
                  <input type="color" name="color" defaultValue={c.color} className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-transparent" />
                </Field>
                <Field label={t('common.kind')}>{kindSelect(c.kind)}</Field>
                <Field label={`${t('categories.monthlyBudget')} (€)`}>
                  <input name="monthlyBudget" inputMode="decimal" defaultValue={c.monthlyBudget ?? ''} className="input" />
                </Field>
                <button className="btn-secondary">{t('common.save')}</button>
                {!c.builtin ? (
                  <ConfirmButton formAction={deleteCategoryAction}>{t('common.delete')}</ConfirmButton>
                ) : (
                  <span className="hidden sm:block" />
                )}
              </form>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
