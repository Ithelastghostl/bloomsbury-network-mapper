/**
 * Known Contacts management — F7.3-T2
 * PRD ref: §16.3 — known contacts excluded from candidate eligibility.
 * Table: app.known_contacts (§11.1)
 */

import { createClient } from '@/lib/supabase/server';
import type { KnownContact } from '@/types/database';

/**
 * Add an entity to the known contacts list.
 */
export async function addKnownContact(
  canonicalEntityId: string,
  addedBy: string,
  source: string,
): Promise<KnownContact> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('known_contacts')
    .upsert(
      {
        canonical_entity_id: canonicalEntityId,
        added_by: addedBy,
        source,
      },
      { onConflict: 'canonical_entity_id' },
    )
    .select()
    .single();

  if (error) throw error;
  return data as KnownContact;
}

/**
 * Remove an entity from the known contacts list.
 */
export async function removeKnownContact(canonicalEntityId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('known_contacts')
    .delete()
    .eq('canonical_entity_id', canonicalEntityId);

  if (error) throw error;
}

/**
 * Check whether a set of entity IDs are known contacts.
 * Returns the set of IDs that ARE known contacts.
 */
export async function filterKnownContacts(entityIds: string[]): Promise<Set<string>> {
  if (entityIds.length === 0) return new Set();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('known_contacts')
    .select('canonical_entity_id')
    .in('canonical_entity_id', entityIds);

  if (error) throw error;
  return new Set((data ?? []).map((r) => r.canonical_entity_id));
}

/**
 * List all known contacts.
 */
export async function listKnownContacts(): Promise<KnownContact[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('known_contacts')
    .select()
    .order('added_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as KnownContact[];
}
