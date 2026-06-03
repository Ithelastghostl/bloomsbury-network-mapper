import { getAdminClient } from '@/lib/supabase/admin';
import { fetchEntityById } from '@/lib/crm/queries';
import { WEALTH_BAND_LABELS } from '@/lib/crm/types';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { EntityDetail } from './entity-detail';

export default async function EntityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getAdminClient();
  const entity = await fetchEntityById(supabase, id);

  if (!entity) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link href="/crm" className="text-sm text-text-muted hover:text-gold transition-colors">
          ← Back to all
        </Link>
      </div>
      <EntityDetail entity={entity} />
    </div>
  );
}
