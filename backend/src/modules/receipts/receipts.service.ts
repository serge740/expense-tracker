import { Injectable, HttpException } from '@nestjs/common';
import OpenAI from 'openai';
import * as mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { buildReceiptReportPdf } from './receipt-report-pdf';

export interface ExtractedInfo {
  amount: number | null;
  merchant: string | null;
  date: string | null;
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

const VALID_CATEGORIES = new Set([
  'food', 'transport', 'shopping', 'health',
  'entertainment', 'travel', 'groceries', 'salary', 'other',
]);

const VISION_PROMPT = `You are a receipt and expense image analyzer.

Look at this image carefully. It may be a receipt, invoice, bill, or any expense-related image.

Return ONLY a raw JSON object (no markdown, no code fences, no explanation) with these fields:
{
  "amount": <the total amount paid as a number, or null if not visible>,
  "merchant": <the business or store name as a string, or null>,
  "date": <the date in YYYY-MM-DD format as a string, or null>,
  "category": <one of exactly: food, transport, shopping, health, entertainment, travel, groceries, salary, other>,
  "description": <a single sentence describing what was purchased, or null>
}

If you cannot read any text, still return your best estimate based on what you can see.`;

function textPrompt(text: string): string {
  return `You are a receipt and expense document analyzer.

Below is text extracted from a document (PDF or Word file). It may be a receipt, invoice, bill, or any expense-related document.

---
${text.slice(0, 6000)}
---

Return ONLY a raw JSON object (no markdown, no code fences, no explanation) with these fields:
{
  "amount": <the total amount paid as a number, or null if not visible>,
  "merchant": <the business or store name as a string, or null>,
  "date": <the date in YYYY-MM-DD format as a string, or null>,
  "category": <one of exactly: food, transport, shopping, health, entertainment, travel, groceries, salary, other>,
  "description": <a single sentence describing what was purchased, or null>
}

If the text is empty or unreadable, return your best estimate or nulls.`;
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
        max_tokens: 400,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
              { type: 'text', text: VISION_PROMPT },
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
        max_tokens: 400,
        temperature: 0,
        messages: [{ role: 'user', content: textPrompt(text) }],
      });
      const rawContent = response.choices[0]?.message?.content?.trim() ?? '';
      const parsed = parseJsonFromLlm(rawContent);
      return this.toExtracted(parsed, text, 0.85);
    } catch (err: any) {
      return this.handleExtractionError(err, text);
    }
  }

  private toExtracted(parsed: any, rawText: string, confidence: number): ExtractedInfo {
    return {
      amount:      typeof parsed.amount      === 'number' ? parsed.amount      : null,
      merchant:    typeof parsed.merchant    === 'string' ? parsed.merchant    : null,
      date:        typeof parsed.date        === 'string' ? parsed.date        : null,
      category:    VALID_CATEGORIES.has(parsed.category) ? parsed.category    : 'other',
      description: typeof parsed.description === 'string' ? parsed.description : null,
      confidence,
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
