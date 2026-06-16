import { apiError } from '@/lib/api-error';

/** True when this deployment must not trigger any data-augmentation / agent /
 *  pipeline work (set on the Vercel read-only analysis instance). Local dev
 *  leaves it unset, so the tether workflow keeps working. */
export function augmentationDisabled(): boolean {
  return process.env.DISABLE_AUGMENTATION === 'true';
}

/** 410 Gone response for a disabled augmentation endpoint. */
export function augmentationGone(): Response {
  return apiError(
    'AUGMENTATION_DISABLED',
    'Data augmentation is disabled on this deployment — this is a read-only analysis instance.',
    undefined,
    410,
  );
}
