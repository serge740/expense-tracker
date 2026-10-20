import api from '@/api';

export interface ProcessedReceipt {
  receiptUrl: string;
  receiptReportUrl: string;
  amount: number | null;
  merchant: string | null;
  date: string | null;
  category: string | null;
  description: string | null;
  confidence: number;
  rawText?: string;
}

/** Uploads a receipt (image, PDF or .docx), keeps the original on Cloudinary, runs AI
 *  extraction, and returns both the original's URL and a generated PDF report's URL. */
export async function processReceipt(uri: string, filename: string, mimeType: string): Promise<ProcessedReceipt> {
  const formData = new FormData();
  formData.append('file', { uri, name: filename, type: mimeType } as any);

  const response = await api.post<ProcessedReceipt>('/receipts/process', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}
