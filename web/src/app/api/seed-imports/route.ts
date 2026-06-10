import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/ulid';
import { apiError, forbidden, serverError } from '@/lib/api-error';
import { withIdempotency } from '@/lib/with-idempotency';
import { parseXlsx } from '@/lib/seed-import/xlsx-parser';

export const POST = withIdempotency(async (request: Request) => {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return forbidden('Authentication required');
    const role = user.app_metadata?.role as string | undefined;
    if (role !== 'admin' && role !== 'engineering_admin') {
      return forbidden('Admin role required');
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return apiError('bad_request', 'file is required');

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseXlsx(buffer, file.name);

    if (parsed.errors.length > 0 && parsed.rows.length === 0) {
      return apiError('bad_request', 'Failed to parse spreadsheet', { errors: parsed.errors });
    }

    const importId = generateId();

    const { error: importError } = await supabase.from('seed_imports').insert({
      import_id: importId,
      import_type: parsed.import_type,
      file_name: parsed.file_name,
      row_count: parsed.rows.length,
      status: 'parsed',
      imported_by: user.id,
      error: parsed.errors.length > 0 ? { parse_errors: parsed.errors } : null,
    });

    if (importError) return serverError('Failed to create import record', importError.message);

    const importRows = parsed.rows.map((row, i) => ({
      row_id: generateId(),
      import_id: importId,
      row_number: i + 1,
      raw_data: row,
      first_name: row.first_name,
      last_name: row.last_name,
      tier: row.tier || null,
      primary_affiliation: ('primary_affiliation' in row ? row.primary_affiliation : null) || null,
      introduced_by_raw: row.introduced_by || null,
      email: row.email || null,
      funder_type: row.funder_type || null,
      sub_type: ('funder_sub_type' in row ? row.funder_sub_type : null) || null,
      status: 'pending',
    }));

    const { error: rowsError } = await supabase.from('seed_import_rows').insert(importRows);
    if (rowsError) return serverError('Failed to store import rows', rowsError.message);

    return Response.json({
      import_id: importId,
      import_type: parsed.import_type,
      row_count: parsed.rows.length,
      skipped_rows: parsed.skipped_rows,
      parse_errors: parsed.errors,
      status: 'parsed',
    }, { status: 201 });
  } catch (err) {
    return serverError('Internal server error', err instanceof Error ? err.message : undefined);
  }
});

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('seed_imports')
      .select('*')
      .order('imported_at', { ascending: false })
      .limit(50);

    if (error) return serverError('Failed to list imports', error.message);
    return Response.json(data);
  } catch (err) {
    return serverError('Internal server error', err instanceof Error ? err.message : undefined);
  }
}
