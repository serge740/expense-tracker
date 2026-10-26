/**
 * Saves a file to the device. The file is fetched and handed to the browser as a download; if the file's host does
 * not allow reading it from this page, the browser is pointed at the address and downloads or opens it itself.
 */
export async function downloadFromUrl(url: string, filename: string): Promise<void> {
  let href = url;
  let revoke: string | null = null;
  try {
    const blob = await (await fetch(url)).blob();
    href = revoke = URL.createObjectURL(blob);
  } catch { /* cross-site file: fall back to a direct link */ }
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(revoke!), 10_000);
}

/** A file name's extension from a URL, ignoring any query string; "jpg" if there is none. */
export function extensionOf(url: string, fallback = 'jpg'): string {
  const ext = url.split('?')[0].split('#')[0].split('.').pop() ?? '';
  return /^[a-z0-9]{2,5}$/i.test(ext) ? ext.toLowerCase() : fallback;
}
