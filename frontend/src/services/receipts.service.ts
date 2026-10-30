// Ported from expo_app/services/receipts.service.ts
import api from '@/api';

export interface ProcessedReceipt {
  receiptUrl: string;
  receiptReportUrl: string;
  amount: number | null;
  merchant: string | null;
  date: string | null;
  /** The currency printed on the receipt, when it says. */
  currency?: string | null;
  /** The date was corrected or could not be read: ask the person to check it. */
  dateUncertain?: boolean;
  category: string | null;
  description: string | null;
  confidence: number;
  rawText?: string;
}

/** Uploads a receipt (image, PDF or .docx), keeps the original on Cloudinary, runs AI
 *  extraction, and returns both the original's URL and a generated PDF report's URL. */
export async function processReceipt(uri: string, filename: string, mimeType: string): Promise<ProcessedReceipt> {
  const blob = await (await fetch(uri)).blob();
  const formData = new FormData();
  formData.append('file', new File([blob], filename, { type: mimeType || blob.type }));

  // No Content-Type: the browser adds multipart/form-data with the right boundary.
  const response = await api.post<ProcessedReceipt>('/receipts/process', formData, {
    headers: { 'Content-Type': undefined as unknown as string },
  });
  return response.data;
}
