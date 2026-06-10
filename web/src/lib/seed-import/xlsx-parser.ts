import * as XLSX from 'xlsx';
import type { HnwTargetRow, SupporterRow, ParseResult } from '@/types/seed-import';

const HEADER_ROW = 12;

function normaliseString(val: unknown): string {
  if (val == null) return '';
  return String(val).trim();
}

function normaliseName(val: unknown): string {
  const s = normaliseString(val);
  if (!s || s === '-') return '';
  return s
    .replace(/^(sir|dame|lord|lady|dr|prof|professor|mr|mrs|ms|miss|rev|hon)\b\.?\s*/i, '')
    .replace(/\s+(cbe|obe|mbe|kcb|kbe|dbe|kt|gcb|gcmg|gcvo|ch|frs|fra|fba)$/i, '')
    .trim();
}

function detectImportType(headerRow: (string | undefined)[]): 'hnw_targets' | 'supporters' | null {
  const joined = headerRow.map(h => normaliseString(h).toLowerCase()).join('|');
  if (joined.includes('tier of funder') && joined.includes('first name') && joined.includes('last name')) {
    const tierIdx = headerRow.findIndex(h => normaliseString(h).toLowerCase().startsWith('tier of funder'));
    const firstIdx = headerRow.findIndex(h => normaliseString(h).toLowerCase().startsWith('first name'));
    if (tierIdx < firstIdx) return 'hnw_targets';
    return 'supporters';
  }
  return null;
}

interface ColumnMap {
  funder_type: number;
  funder_sub_type: number;
  tier: number;
  first_name: number;
  last_name: number;
  account_name: number;
  account_owner: number;
  email: number;
  primary_affiliation: number;
  introduced_by: number;
}

function buildColumnMap(headerRow: (string | undefined)[]): ColumnMap {
  const map: Record<string, number> = {};
  const aliases: Record<string, string> = {
    'funder type': 'funder_type',
    'funder sub-type': 'funder_sub_type',
    'tier of funder': 'tier',
    'first name': 'first_name',
    'last name': 'last_name',
    'account name': 'account_name',
    'account owner': 'account_owner',
    'email': 'email',
    'primary affiliation': 'primary_affiliation',
    'introduced by': 'introduced_by',
  };

  for (let i = 0; i < headerRow.length; i++) {
    const raw = normaliseString(headerRow[i]).toLowerCase().replace(/\s*[↑↓]\s*$/, '');
    if (raw in aliases) {
      map[aliases[raw]] = i;
    }
  }

  return map as unknown as ColumnMap;
}

function parseHnwRow(cells: (string | undefined)[], colMap: ColumnMap): HnwTargetRow {
  return {
    funder_type: normaliseString(cells[colMap.funder_type]),
    funder_sub_type: normaliseString(cells[colMap.funder_sub_type]),
    tier: normaliseString(cells[colMap.tier]),
    first_name: normaliseString(cells[colMap.first_name]),
    last_name: normaliseString(cells[colMap.last_name]),
    account_name: normaliseString(cells[colMap.account_name]),
    account_owner: normaliseString(cells[colMap.account_owner]),
    email: normaliseString(cells[colMap.email]),
    primary_affiliation: normaliseString(cells[colMap.primary_affiliation]),
    introduced_by: normaliseString(cells[colMap.introduced_by]),
  };
}

function parseSupporterRow(cells: (string | undefined)[], colMap: ColumnMap): SupporterRow {
  return {
    funder_type: normaliseString(cells[colMap.funder_type]),
    funder_sub_type: normaliseString(cells[colMap.funder_sub_type]),
    first_name: normaliseString(cells[colMap.first_name]),
    last_name: normaliseString(cells[colMap.last_name]),
    account_name: normaliseString(cells[colMap.account_name]),
    primary_affiliation: normaliseString(cells[colMap.primary_affiliation]),
    account_owner: normaliseString(cells[colMap.account_owner]),
    email: normaliseString(cells[colMap.email]),
    introduced_by: normaliseString(cells[colMap.introduced_by]),
    tier: normaliseString(cells[colMap.tier]),
  };
}

function isRowEmpty(row: HnwTargetRow | SupporterRow): boolean {
  return !row.first_name && !row.last_name && !('account_name' in row && row.account_name);
}

export function parseXlsx(buffer: Buffer, fileName: string): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const allRows: (string | undefined)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: undefined,
  });

  if (allRows.length <= HEADER_ROW) {
    return {
      import_type: 'hnw_targets',
      file_name: fileName,
      rows: [],
      skipped_rows: 0,
      errors: [{ row: 0, message: 'File has fewer rows than expected — missing header row' }],
    };
  }

  const headerRow = allRows[HEADER_ROW - 1];
  const importType = detectImportType(headerRow);
  if (!importType) {
    return {
      import_type: 'hnw_targets',
      file_name: fileName,
      rows: [],
      skipped_rows: 0,
      errors: [{ row: HEADER_ROW, message: 'Could not detect spreadsheet format from header row' }],
    };
  }

  const colMap = buildColumnMap(headerRow);
  const dataRows = allRows.slice(HEADER_ROW);
  const rows: (HnwTargetRow | SupporterRow)[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  let skipped = 0;

  const seen = new Set<string>();

  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i];
    if (!cells || cells.every(c => c == null || String(c).trim() === '')) {
      skipped++;
      continue;
    }

    const rowNum = HEADER_ROW + 1 + i;
    const parsed = importType === 'hnw_targets'
      ? parseHnwRow(cells, colMap)
      : parseSupporterRow(cells, colMap);

    if (isRowEmpty(parsed)) {
      skipped++;
      continue;
    }

    const firstName = normaliseName(parsed.first_name);
    const lastName = normaliseName(parsed.last_name);

    if (!firstName && !lastName) {
      if ('account_name' in parsed && parsed.account_name) {
        // Organisation row (e.g., "Admin" for a trust) — still valid
      } else {
        errors.push({ row: rowNum, message: 'Missing both first_name and last_name' });
        continue;
      }
    }

    const dedupKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
    if (seen.has(dedupKey) && dedupKey !== '|') {
      errors.push({ row: rowNum, message: `Duplicate within import: ${firstName} ${lastName}` });
      continue;
    }
    if (dedupKey !== '|') seen.add(dedupKey);

    rows.push(parsed);
  }

  return { import_type: importType, file_name: fileName, rows, skipped_rows: skipped, errors };
}

export { normaliseName, normaliseString };
