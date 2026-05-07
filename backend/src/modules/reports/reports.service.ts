import { Injectable, HttpException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import OpenAI from 'openai';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const CATEGORY_LABELS: Record<string, string> = {
  food: 'Food', transport: 'Transport', shopping: 'Shopping',
  health: 'Health', entertainment: 'Entertainment', travel: 'Travel',
  groceries: 'Groceries', salary: 'Salary', other: 'Other',
};

export interface AiAdvice {
  verdict: 'good' | 'fair' | 'poor';
  summary: string;
  advice: string;
  tips: string[];
}

@Injectable()
export class ReportsService {
  private openai: OpenAI;

  constructor(private readonly prisma: PrismaService) {
    this.openai = new OpenAI({ apiKey: (process.env.OPEN_AI_KEY ?? '').trim() });
  }

  async monthly(clientId: string, year: number, months: number) {
    const now = new Date();
    const results: { month: string; year: number; total: number; heightPct: number }[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end   = new Date(d.getFullYear(), d.getMonth() + 1, 1);

      const agg = await this.prisma.transaction.aggregate({
        where: { clientId, type: 'EXPENSE', date: { gte: start, lt: end } },
        _sum: { amount: true },
      });

      results.push({
        month: MONTH_NAMES[d.getMonth()],
        year: d.getFullYear(),
        total: Number(agg._sum.amount ?? 0),
        heightPct: 0,
      });
    }

    const max = Math.max(...results.map(r => r.total), 1);
    return results.map(r => ({ ...r, heightPct: Math.round((r.total / max) * 100) }));
  }

  private resolveDateRange(month: number, year: number, startDate?: string, endDate?: string): [Date, Date] {
    if (startDate && endDate) return [new Date(startDate), new Date(endDate)];
    return [new Date(year, month - 1, 1), new Date(year, month, 1)];
  }

  async byCategory(clientId: string, month: number, year: number, startDate?: string, endDate?: string) {
    const [start, end] = this.resolveDateRange(month, year, startDate, endDate);

    const groups = await this.prisma.transaction.groupBy({
      by: ['category'],
      where: { clientId, type: 'EXPENSE', date: { gte: start, lt: end } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    });

    const total = groups.reduce((s, g) => s + Number(g._sum.amount ?? 0), 0);

    return groups.map(g => ({
      category: g.category,
      label: CATEGORY_LABELS[g.category] ?? g.category,
      amount: Number(g._sum.amount ?? 0),
      percentage: total > 0 ? Math.round((Number(g._sum.amount ?? 0) / total) * 100) : 0,
    }));
  }

  async summary(clientId: string, month: number, year: number, startDate?: string, endDate?: string) {
    const [start, end] = this.resolveDateRange(month, year, startDate, endDate);

    const [inc, exp] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { clientId, type: 'INCOME', date: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: { clientId, type: 'EXPENSE', date: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
    ]);

    const totalIncome  = Number(inc._sum.amount ?? 0);
    const totalExpense = Number(exp._sum.amount ?? 0);
    return { totalIncome, totalExpense, net: totalIncome - totalExpense };
  }

  async topExpenses(clientId: string, month: number, year: number, limit: number) {
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 1);

    const txns = await this.prisma.transaction.findMany({
      where: { clientId, type: 'EXPENSE', date: { gte: start, lt: end } },
      orderBy: { amount: 'desc' },
      take: limit,
    });

    return txns.map(t => ({
      id: t.id,
      category: t.category,
      title: t.title,
      amount: -Number(t.amount),
      date: t.date,
    }));
  }

  async aiAdvice(
    clientId: string,
    month: number,
    year: number,
    startDate?: string,
    endDate?: string,
    currency = 'USD',
  ): Promise<AiAdvice> {
    const apiKey = (process.env.OPEN_AI_KEY ?? '').trim();
    if (!apiKey) throw new HttpException('OpenAI API key not configured on server', 500);

    const [cats, sum] = await Promise.all([
      this.byCategory(clientId, month, year, startDate, endDate),
      this.summary(clientId, month, year, startDate, endDate),
    ]);

    const periodLabel = startDate && endDate
      ? `${new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : `${MONTH_NAMES[month - 1]} ${year}`;

    const catLines = cats.length > 0
      ? cats.map(c => `  - ${CATEGORY_LABELS[c.category] ?? c.category}: ${currency} ${c.amount.toFixed(2)} (${c.percentage}%)`).join('\n')
      : '  - No expenses recorded';

    const netDir = sum.net >= 0 ? 'surplus' : 'deficit';

    const prompt = `You are a personal finance advisor. Analyze this expense report and give honest, actionable advice.

Period: ${periodLabel}
Currency: ${currency}
Total Income: ${currency} ${sum.totalIncome.toFixed(2)}
Total Spent: ${currency} ${sum.totalExpense.toFixed(2)}
Net Balance: ${currency} ${Math.abs(sum.net).toFixed(2)} (${netDir})

Spending by Category:
${catLines}

Return ONLY a JSON object with no markdown or code fences:
{
  "verdict": "good" or "fair" or "poor",
  "summary": "2-3 sentences on the person's overall financial health this period",
  "advice": "Main recommendation paragraph on spending and saving habits",
  "tips": ["tip 1", "tip 2", "tip 3", "tip 4"]
}`;

    let raw = '';
    try {
      const res = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 600,
        temperature: 0.4,
        messages: [{ role: 'user', content: prompt }],
      });
      raw = res.choices[0]?.message?.content?.trim() ?? '';
      // Strip markdown fences if present
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      const parsed = JSON.parse(raw);
      return {
        verdict: ['good', 'fair', 'poor'].includes(parsed.verdict) ? parsed.verdict : 'fair',
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        advice:  typeof parsed.advice  === 'string' ? parsed.advice  : '',
        tips:    Array.isArray(parsed.tips) ? parsed.tips.filter((t: any) => typeof t === 'string') : [],
      };
    } catch (err: any) {
      console.error('[Reports] AI advice error:', err?.message ?? err, raw);
      throw new HttpException('AI advice generation failed', 500);
    }
  }
}
