/**
 * Graph snapshot export to Supabase Storage as JSON (F6.3-T6).
 *
 * Exports graph snapshot tagged with run_id.
 * PRD says Parquet (R2.10) but we use JSON for the Node.js stack.
 */

import type { DirectedGraph, SerializedGraph } from './networkx';
import { createClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/ulid';

const BUCKET_NAME = 'graph-snapshots';

export interface SnapshotMetadata {
  snapshotId: string;
  runId: string;
  storageUri: string;
  nodeCount: number;
  edgeCount: number;
  builtAt: string;
}

/**
 * Export a graph snapshot to Supabase Storage and record metadata in app.graph_snapshots.
 */
export async function exportSnapshot(
  graph: DirectedGraph,
  runId: string,
): Promise<SnapshotMetadata> {
  const serialized = graph.serialize();
  const snapshotId = generateId();
  const fileName = `${runId}/${snapshotId}.json`;
  const builtAt = new Date().toISOString();

  const supabase = await createClient();

  // Upload JSON to Supabase Storage
  const blob = new Blob([JSON.stringify(serialized)], { type: 'application/json' });
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, blob, { contentType: 'application/json', upsert: false });

  if (uploadError) {
    throw new Error(`Failed to upload snapshot: ${uploadError.message}`);
  }

  const storageUri = `${BUCKET_NAME}/${fileName}`;

  // Record metadata in graph_snapshots table
  const { error: insertError } = await supabase
    .from('graph_snapshots')
    .insert({
      snapshot_id: snapshotId,
      run_id: runId,
      storage_uri: storageUri,
      node_count: graph.nodeCount,
      edge_count: graph.edgeCount,
      built_at: builtAt,
    });

  if (insertError) {
    throw new Error(`Failed to record snapshot metadata: ${insertError.message}`);
  }

  return {
    snapshotId,
    runId,
    storageUri,
    nodeCount: graph.nodeCount,
    edgeCount: graph.edgeCount,
    builtAt,
  };
}

/**
 * Load a graph snapshot from Supabase Storage by snapshot ID.
 */
export async function loadSnapshot(snapshotId: string): Promise<{
  graph: SerializedGraph;
  metadata: SnapshotMetadata;
}> {
  const supabase = await createClient();

  // Fetch metadata
  const { data: meta, error: metaError } = await supabase
    .from('graph_snapshots')
    .select()
    .eq('snapshot_id', snapshotId)
    .single();

  if (metaError || !meta) {
    throw new Error(`Snapshot ${snapshotId} not found`);
  }

  // Download JSON from storage
  const path = meta.storage_uri.replace(`${BUCKET_NAME}/`, '');
  const { data: fileData, error: downloadError } = await supabase.storage
    .from(BUCKET_NAME)
    .download(path);

  if (downloadError || !fileData) {
    throw new Error(`Failed to download snapshot: ${downloadError?.message}`);
  }

  const text = await fileData.text();
  const graph: SerializedGraph = JSON.parse(text);

  return {
    graph,
    metadata: {
      snapshotId: meta.snapshot_id,
      runId: meta.run_id,
      storageUri: meta.storage_uri,
      nodeCount: meta.node_count,
      edgeCount: meta.edge_count,
      builtAt: meta.built_at,
    },
  };
}
