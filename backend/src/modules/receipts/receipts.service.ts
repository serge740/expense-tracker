import { Injectable, HttpException } from '@nestjs/common';
import OpenAI from 'openai';
import * as mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { buildReceiptReportPdf } from './receipt-report-pdf';
import { LEGACY_CATEGORY, canonicalCategory } from '../../common/utils/categories';
import { chooseDate, cleanAmount, cleanCurrency, cleanTime, todayText } from './receipt-fields';
import { normalizeSubCategory } from '../../common/utils/categories';

export interface ExtractedInfo {
  amount: number | null;
  merchant: string | null;
  date: string | null;
  /** The currency printed on it (RWF, USD…), when it says. */
  currency?: string | null;
  /** The time printed on it, HH:MM (24 hour), when there is one. */
  time?: string | null;
  /** EXPENSE (money paid out, the usual case) or INCOME (money the person received). */
  type?: 'EXPENSE' | 'INCOME';
  subCategory?: string | null;
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

/** What every kind of document asks for, so a card slip, a shop till roll, a mobile-money message and an invoice are read the same way. */
const INSTRUCTIONS = () => `TODAY'S DATE: ${todayText(new Date())}

You read proof of payment of every kind: shop till receipts, restaurant bills, card-machine slips (POS), bank or mobile-money transfer confirmations and SMS screenshots (MTN MoMo, Airtel Money, M-Pesa, bank apps), invoices, utility, airtime, fuel, school-fee and rent receipts, tickets, and handwritten receipts. The text may be in English, French, Kinyarwanda or Swahili.

Return ONLY a raw JSON object (no markdown, no code fences, no explanation) with these fields:
{
  "amount": <the final amount actually paid (after tax, discount and tips) as a plain number with no thousands separators. NOT a subtotal, balance, change, cash tendered, fee-less amount or one item. For a transfer it is the amount sent. null if not visible>,
  "currency": <3-letter code printed or clearly implied (RWF, USD, EUR, KES, UGX, TZS…), or null>,
  "merchant": <who was paid: the shop, restaurant, company, school, landlord or person. On a card-machine slip the printed bank name is only the acquirer: prefer the shop name if one is printed, otherwise use that name. For a transfer use the receiver. null if not visible>,
  "date_as_printed": <the purchase or payment date exactly as printed, character for character, or null>,
  "date": <that date as YYYY-MM-DD, or null>,
  "time": <the time printed with it as HH:MM in 24-hour form (4:24 PM becomes 16:24), or null if no time is printed>,
  "type": <"EXPENSE" if the document shows money paid out (almost always), "INCOME" only if it clearly shows the account holder RECEIVED money (a salary slip, "you have received", a credit alert)>,
  "category": <the category that best fits WHAT WAS BOUGHT or paid for, judged from the items, the merchant and the document, never from the payment method or the bank. One of exactly: food (groceries, supermarket, bakery, water and drinks, restaurants, cafes, takeaway), transport (fuel, taxi, moto, bus, flights, parking, car repairs, hotels and lodging), bills (rent, electricity, water bill, internet, airtime and data bundles, TV, subscriptions), shopping (clothes, shoes, electronics, household items, furniture, cosmetics, stationery), health (pharmacy, clinic, hospital, school fees, tuition, gym, haircut and salon), entertainment (cinema, events, games, bars and nightlife, streaming), gifts (gifts, donations, tithes, family support, money sent to a person), business (business supplies, services, equipment, fees for work), insurance (insurance, bank charges, taxes, government fees), salary (money received as pay), other (only if nothing above fits)>,
  "subcategory": <a short, specific label of 1 to 3 words for what it was, such as Groceries, Restaurant, Fuel, Taxi, Airtime, Electricity, Pharmacy, School fees, Rent, Clothes; or null>,
  "description": <one short sentence saying what was paid for, based on the items (for example "Bottled water 500ml"), not on the bank or the shop's address; or null>
}

Rules:
- Dates: use the date of the purchase or payment (labelled Date, Date/Time, Issued, Paid, Transaction date), never a due date, expiry date, a reprint time or a date inside a product name. Numeric dates such as 03/04/2026 are DAY/MONTH/YEAR unless a number above 12 shows it is MONTH/DAY. Expand two-digit years (26) to 20xx.
- Never guess. If something is not readable, use null for it. Do not fill the time with 00:00.
- Amounts: read the digits carefully; "RWF 700.00" is 700, "1,250" is 1250, "1.250,50" is 1250.5.`;

const visionPrompt = () => `You are an expert at reading receipts and proofs of payment from photos and screenshots.

Look at the image carefully, including small print, stamps and the bottom of the slip.

${INSTRUCTIONS()}`;

function textPrompt(text: string): string {
  return `You are an expert at reading receipts and proofs of payment from text taken out of a PDF or Word file.

---
${text.slice(0, 6000)}
---

${INSTRUCTIONS()}`;
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
      time:        when.date ? cleanTime(parsed.time, parsed.date_as_printed) : null,
      type:        parsed.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
      subCategory: normalizeSubCategory(parsed.subcategory),
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
