import { Injectable, HttpException } from '@nestjs/common';
import OpenAI from 'openai';
import * as mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { buildReceiptReportPdf } from './receipt-report-pdf';
import { LEGACY_CATEGORY, canonicalCategory } from '../../common/utils/categories';
import { chooseDate, cleanAmount, cleanCurrency, todayText } from './receipt-fields';

export interface ExtractedInfo {
  amount: number | null;
  merchant: string | null;
  date: string | null;
  /** The currency printed on it (RWF, USD…), when it says. */
  currency?: string | null;
  /** True when the date was corrected or could not be trusted and was left empty. */
  dateUncertain?: boolean;
  category: string | null;
  description: string | null;
  confidence: number;
  rawText?: string;
}

export interface ProcessedReceipt extends ExtractedInfo {
  receiptUrl: string;
  receiptReportUrl: string;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// What the model may answer with. Older names are still accepted and mapped (groceries -> Food, and so on).
const VALID_CATEGORIES = new Set([
  'food', 'transport', 'bills', 'shopping', 'health', 'entertainment', 'gifts', 'business', 'insurance', 'salary', 'other',
  ...Object.keys(LEGACY_CATEGORY),
]);

const visionPrompt = () => `You are a receipt and expense image analyzer.

Look at this image carefully. It may be a receipt, invoice, bill, or any expense-related image.

TODAY'S DATE: ${todayText(new Date())}

Return ONLY a raw JSON object (no markdown, no code fences, no explanation) with these fields:
{
  "amount": <the final total the customer paid (after tax, discount and tips; NOT a subtotal, a change due, a cash tendered figure or a single item) as a plain number with no thousands separators, or null if not visible>,
  "currency": <the 3-letter currency code printed or clearly implied (RWF, USD, EUR, KES…), or null>,
  "merchant": <the business or store name as printed, or null>,
  "date_as_printed": <the purchase date exactly as it is printed, character for character, or null>,
  "date": <that same date as YYYY-MM-DD, or null>,
  "category": <one of exactly: food (groceries, eating out, drinks), transport (fuel, taxis, flights, hotels), bills (rent, electricity, water, internet, airtime, subscriptions), shopping, health (medical, school fees, gym, haircut), entertainment, gifts (gifts, donations, family support), business, insurance (insurance, bank fees, taxes), salary, other>,
  "description": <a single sentence describing what was purchased, or null>
}

Rules for the date:
- Use the date of the purchase or payment (labelled Date, Issued, Paid, Transaction date), never a due date, an expiry date, a print/reprint time or a date inside a product name.
- Numeric dates such as 03/04/2026 are DAY/MONTH/YEAR unless a number above 12 shows it is MONTH/DAY.
- Never guess a missing day, month or year. If it is not readable, use null for both date fields.
- The year is a four-digit number; expand two digits (26) to 20xx.

Never invent values: use null for anything you cannot read.`;

function textPrompt(text: string): string {
  return `You are a receipt and expense document analyzer.

Below is text extracted from a document (PDF or Word file). It may be a receipt, invoice, bill, or any expense-related document.

---
${text.slice(0, 6000)}
---

TODAY'S DATE: ${todayText(new Date())}

Return ONLY a raw JSON object (no markdown, no code fences, no explanation) with these fields:
{
  "amount": <the final total the customer paid (after tax, discount and tips; NOT a subtotal, a change due, a cash tendered figure or a single item) as a plain number with no thousands separators, or null if not visible>,
  "currency": <the 3-letter currency code printed or clearly implied (RWF, USD, EUR, KES…), or null>,
  "merchant": <the business or store name as printed, or null>,
  "date_as_printed": <the purchase date exactly as it is printed, character for character, or null>,
  "date": <that same date as YYYY-MM-DD, or null>,
  "category": <one of exactly: food (groceries, eating out, drinks), transport (fuel, taxis, flights, hotels), bills (rent, electricity, water, internet, airtime, subscriptions), shopping, health (medical, school fees, gym, haircut), entertainment, gifts (gifts, donations, family support), business, insurance (insurance, bank fees, taxes), salary, other>,
  "description": <a single sentence describing what was purchased, or null>
}

Rules for the date:
- Use the date of the purchase or payment (labelled Date, Issued, Paid, Transaction date), never a due date, an expiry date, a print/reprint time or a date inside a product name.
- Numeric dates such as 03/04/2026 are DAY/MONTH/YEAR unless a number above 12 shows it is MONTH/DAY.
- Never guess a missing day, month or year. If it is not readable, use null for both date fields.
- The year is a four-digit number; expand two digits (26) to 20xx.

If the text is empty or unreadable, return nulls.`;
}

function parseJsonFromLlm(raw: string): any {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(text);
}

@Injectable()
export class ReceiptsService {
  private openai: OpenAI;

  constructor(private readonly cloudinaryService: CloudinaryService) {
    const apiKey = (process.env.OPEN_AI_KEY ?? '').trim();
    if (!apiKey) {
      console.error('[Receipts] OPEN_AI_KEY is not set in environment variables');
    }
    this.openai = new OpenAI({ apiKey });
  }

  async process(buffer: Buffer, mimetype: string, filename: string): Promise<ProcessedReceipt> {
    const apiKey = (process.env.OPEN_AI_KEY ?? '').trim();
    if (!apiKey) throw new HttpException('OpenAI API key not configured on server', 500);

    const isImage = mimetype.startsWith('image/');
    const isPdf = mimetype === 'application/pdf';
    const isDocx = mimetype === DOCX_MIME;
    if (!isImage && !isPdf && !isDocx) {
      throw new HttpException('Unsupported file type. Use an image, PDF, or .docx file.', 400);
    }

    // Keep the original — upload immediately so it's preserved even if extraction fails.
    const receiptUrl = await this.cloudinaryService.uploadReceiptBuffer(buffer, mimetype, {
      folder: 'expense-tracker/receipts',
      resourceType: isDocx ? 'auto' : 'image',
    });

    const extracted = isImage
      ? await this.extractFromImage(buffer, mimetype)
      : await this.extractFromText(isPdf ? await this.readPdfText(buffer) : await this.readDocxText(buffer));

    const reportBuffer = await buildReceiptReportPdf({
      amount: extracted.amount,
      merchant: extracted.merchant,
      date: extracted.date,
      category: extracted.category,
      description: extracted.description,
      rawText: extracted.rawText,
      originalUrl: receiptUrl,
      originalBuffer: isImage ? buffer : undefined,
      originalMimetype: mimetype,
    });

    const baseName = filename.replace(/\.[^./]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'receipt';
    const receiptReportUrl = await this.cloudinaryService.uploadReceiptBuffer(reportBuffer, 'application/pdf', {
      folder: 'expense-tracker/receipt-reports',
      resourceType: 'image',
      filename: `${baseName}-report-${Date.now()}`,
    });

    return { receiptUrl, receiptReportUrl, ...extracted };
  }

  private async readPdfText(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text ?? '';
    } finally {
      await parser.destroy();
    }
  }

  private async readDocxText(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? '';
  }

  private async extractFromImage(buffer: Buffer, mimetype: string): Promise<ExtractedInfo> {
    const safeType = mimetype.startsWith('image/') ? mimetype : 'image/jpeg';
    const dataUrl = `data:${safeType};base64,${buffer.toString('base64')}`;
    let rawContent = '';
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 500,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
              { type: 'text', text: visionPrompt() },
            ],
          },
        ],
      });
      rawContent = response.choices[0]?.message?.content?.trim() ?? '';
      const parsed = parseJsonFromLlm(rawContent);
      return this.toExtracted(parsed, rawContent, 0.95);
    } catch (err: any) {
      return this.handleExtractionError(err, rawContent);
    }
  }

  private async extractFromText(text: string): Promise<ExtractedInfo> {
    if (!text.trim()) {
      return { amount: null, merchant: null, date: null, category: 'other', description: null, confidence: 0.2, rawText: text };
    }
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 500,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: textPrompt(text) }],
      });
      const rawContent = response.choices[0]?.message?.content?.trim() ?? '';
      const parsed = parseJsonFromLlm(rawContent);
      return this.toExtracted(parsed, text, 0.85);
    } catch (err: any) {
      return this.handleExtractionError(err, text);
    }
  }

  private toExtracted(parsed: any, rawText: string, confidence: number, now = new Date()): ExtractedInfo {
    const when = chooseDate(parsed.date, parsed.date_as_printed, now);
    const amount = cleanAmount(parsed.amount);
    // Fewer things readable means less sure.
    const readable = [amount !== null, typeof parsed.merchant === 'string' && !!parsed.merchant.trim(), when.date !== null].filter(Boolean).length;
    return {
      amount,
      currency:    cleanCurrency(parsed.currency),
      merchant:    typeof parsed.merchant    === 'string' && parsed.merchant.trim() ? parsed.merchant.trim().slice(0, 80) : null,
      date:        when.date,
      dateUncertain: when.adjusted || (when.date === null && !!(parsed.date || parsed.date_as_printed)),
      category:    VALID_CATEGORIES.has(parsed.category) ? canonicalCategory(parsed.category).category : 'other',
      description: typeof parsed.description === 'string' && parsed.description.trim() ? parsed.description.trim().slice(0, 200) : null,
      confidence:  Math.round(confidence * (0.5 + readable / 6) * 100) / 100,
      rawText,
    };
  }

  private handleExtractionError(err: any, rawText: string): ExtractedInfo {
    console.error('[Receipts] Extraction error:', err?.message ?? err);
    if (rawText) {
      return {
        amount: null, merchant: null, date: null, category: 'other',
        description: rawText.slice(0, 200), confidence: 0.3, rawText,
      };
    }
    throw new HttpException(
      err?.message?.includes('API key') ? 'API key is invalid' : 'Receipt analysis failed',
      500,
    );
  }
}
