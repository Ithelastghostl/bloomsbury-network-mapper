import { createClient } from '@/lib/supabase/server';
import { apiError, forbidden, serverError } from '@/lib/api-error';
import { withIdempotency } from '@/lib/with-idempotency';
import { createBootstrapRun, processImport } from '@/lib/seed-import/bootstrap';
import { augmentationDisabled, augmentationGone } from '@/lib/augmentation-guard';

export const POST = withIdempotency(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    if (augmentationDisabled()) return augmentationGone();

    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return forbidden('Authentication required');
    const role = user.app_metadata?.role as string | undefined;
    if (role !== 'admin' && role !== 'engineering_admin') {
      return forbidden('Admin role required');
    }

    const { data: importRecord, error } = await supabase
      .from('seed_imports')
      .select('*')
      .eq('import_id', id)
      .single();

    if (error || !importRecord) {
      return apiError('not_found', 'Import not found', undefined, 404);
    }

    if (importRecord.status !== 'parsed') {
      return apiError('bad_request', `Import is in status "${importRecord.status}", expected "parsed"`);
    }

    await supabase.from('seed_imports').update({ status: 'processing' }).eq('import_id', id);

    const runId = await createBootstrapRun(supabase, user.id);

    const result = await processImport(supabase, id, {
      runId,
      importType: importRecord.import_type,
      userId: user.id,
    });

    await supabase.from('runs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('run_id', runId);

    return Response.json({
      run_id: runId,
      import_id: id,
      ...result,
    });
  } catch (err) {
    return serverError('Internal server error', err instanceof Error ? err.message : undefined);
  }
});
