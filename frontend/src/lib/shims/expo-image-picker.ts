/**
 * expo-image-picker for the browser: the file chooser. On a phone the "camera" choice opens the camera;
 * on a computer it opens the normal file chooser.
 */
export interface PickerAsset {
  uri: string; // a blob: address that stays valid while the page is open
  fileName: string | null;
  mimeType: string;
  width: number;
  height: number;
  fileSize: number;
  file: File;
}
export interface PickerResult { canceled: boolean; assets: PickerAsset[] }
export interface Permission { granted: boolean; status: 'granted' | 'denied' | 'undetermined'; canAskAgain: boolean; expires: 'never' }

const granted: Permission = { granted: true, status: 'granted', canAskAgain: true, expires: 'never' };

/** The browser asks for access itself when the camera or file chooser opens. */
export const requestCameraPermissionsAsync = async (): Promise<Permission> => granted;
export const requestMediaLibraryPermissionsAsync = async (): Promise<Permission> => granted;
export const getCameraPermissionsAsync = requestCameraPermissionsAsync;
export const getMediaLibraryPermissionsAsync = requestMediaLibraryPermissionsAsync;

/** Opens the file chooser and resolves with the chosen files, or an empty list if it was closed. */
export function chooseFiles(accept: string, opts: { capture?: 'user' | 'environment'; multiple?: boolean } = {}): Promise<File[]> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (opts.multiple) input.multiple = true;
    if (opts.capture) input.setAttribute('capture', opts.capture);
    input.style.cssText = 'position:fixed;left:-9999px;opacity:0';
    let settled = false;
    const done = (files: File[]) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      input.remove();
      resolve(files);
    };
    // Closing the chooser without a choice: the "cancel" event, or the window getting focus back with nothing chosen.
    const onFocus = () => setTimeout(() => { if (!input.files?.length) done([]); }, 900);
    input.addEventListener('change', () => done(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => done([]));
    window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    input.click();
  });
}

function measure(file: File): Promise<{ width: number; height: number }> {
  return new Promise(resolve => {
    if (!file.type.startsWith('image/')) return resolve({ width: 0, height: 0 });
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve({ width: 0, height: 0 }); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

async function toResult(files: File[]): Promise<PickerResult> {
  if (!files.length) return { canceled: true, assets: [] };
  const assets = await Promise.all(files.map(async file => ({
    uri: URL.createObjectURL(file),
    fileName: file.name || null,
    mimeType: file.type || 'application/octet-stream',
    fileSize: file.size,
    file,
    ...(await measure(file)),
  })));
  return { canceled: false, assets };
}

export interface PickerOptions {
  mediaTypes?: string[] | string;
  allowsEditing?: boolean;
  allowsMultipleSelection?: boolean;
  aspect?: [number, number];
  quality?: number;
}

export async function launchImageLibraryAsync(opts: PickerOptions = {}): Promise<PickerResult> {
  return toResult(await chooseFiles('image/*', { multiple: !!opts.allowsMultipleSelection }));
}

export async function launchCameraAsync(_opts: PickerOptions = {}): Promise<PickerResult> {
  return toResult(await chooseFiles('image/*', { capture: 'environment' }));
}

export const MediaTypeOptions = { Images: 'images', Videos: 'videos', All: 'all' } as const;
