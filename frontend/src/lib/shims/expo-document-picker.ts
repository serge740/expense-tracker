/** expo-document-picker for the browser: the file chooser, limited to the allowed kinds of file. */
import { chooseFiles } from './expo-image-picker';

export interface DocumentAsset {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  file: File;
}
export interface DocumentResult { canceled: boolean; assets: DocumentAsset[] | null }

export async function getDocumentAsync(opts: { type?: string | string[]; copyToCacheDirectory?: boolean; multiple?: boolean } = {}): Promise<DocumentResult> {
  const accept = Array.isArray(opts.type) ? opts.type.join(',') : opts.type ?? '*/*';
  const files = await chooseFiles(accept === '*/*' ? '' : accept, { multiple: opts.multiple });
  if (!files.length) return { canceled: true, assets: null };
  return {
    canceled: false,
    assets: files.map(file => ({ uri: URL.createObjectURL(file), name: file.name, mimeType: file.type || undefined, size: file.size, file })),
  };
}
