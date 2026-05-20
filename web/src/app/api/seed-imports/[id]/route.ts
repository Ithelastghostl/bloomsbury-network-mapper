import { createClient } from '@/lib/supabase/server';
import { apiError, serverError } from '@/lib/api-error';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: importRecord, error } = await supabase
      .from('seed_imports')
      .select('*')
      .eq('import_id', id)
      .single();

    if (error || !importRecord) {
      return apiError('not_found', 'Import not found', undefined, 404);
    }

    const { data: rows, error: rowsError } = await supabase
      .from('seed_import_rows')
      .select('*')
      .eq('import_id', id)
      .order('row_number');

    if (rowsError) return serverError('Failed to fetch import rows', rowsError.message);

    return Response.json({ ...importRecord, rows });
  } catch (err) {
    return serverError('Internal server error', err instanceof Error ? err.message : undefined);
  }
}
