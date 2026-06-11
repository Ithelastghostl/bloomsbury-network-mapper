/**
 * Suggested analyst tags (IDEA 9). A small, fixed pick-list of common hygiene /
 * disposition tags surfaced in the tag editor. Analysts can still apply any
 * free-text tag; this list just makes the frequent ones one click away.
 */
export const SUGGESTED_TAGS = [
  'conflict of interest',
  'already in contact',
  'do not approach',
  'needs verification',
  'warm — known personally',
  'high priority',
  'researched',
  'duplicate suspected',
] as const;

export type SuggestedTag = (typeof SUGGESTED_TAGS)[number];
