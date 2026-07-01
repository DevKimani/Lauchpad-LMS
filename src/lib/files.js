import { supabase } from './supabase'

/**
 * Resolve a stored value to a usable URL.
 *
 * - null / empty  → null
 * - External link (http/https, not a Supabase storage URL) → returned unchanged
 * - Everything else is treated as a path (or old public URL) inside the
 *   course-files bucket; a signed URL valid for 1 hour is returned.
 */
export async function getFileUrl(value) {
  if (!value) return null

  // External links such as YouTube or Canva embeds — return as-is
  if (
    (value.startsWith('http://') || value.startsWith('https://')) &&
    !value.includes('/storage/v1/object/')
  ) {
    return value
  }

  // Derive the bucket-relative path.
  // Old public URLs contain "/course-files/" as a segment; strip the prefix.
  const BUCKET_MARKER = '/course-files/'
  const path = value.includes(BUCKET_MARKER)
    ? value.slice(value.indexOf(BUCKET_MARKER) + BUCKET_MARKER.length)
    : value

  const { data, error } = await supabase.storage
    .from('course-files')
    .createSignedUrl(path, 3600)

  if (error) return null
  return data.signedUrl
}
