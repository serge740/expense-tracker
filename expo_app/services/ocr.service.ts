import api from '@/api';

export interface OcrResult {
  amount: number | null;
  merchant: string | null;
  date: string | null;
  category: string | null;
  description: string | null;
  confidence: number;
  rawText?: string;
  receiptUrl: string;
}

export const scanReceipt = async (imageUri: string): Promise<OcrResult> => {
  const filename = imageUri.split('/').pop() ?? 'receipt.jpg';
  const type = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

  const formData = new FormData();
  formData.append('image', { uri: imageUri, name: filename, type } as any);

  const response = await api.post('/ocr/scan-receipt', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};
