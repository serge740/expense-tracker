import api from '@/api';

export interface MonthlyData {
  month: string;
  year: number;
  total: number;
  heightPct: number;
}

export interface CategoryBreakdown {
  category: string;
  label: string;
  amount: number;
  percentage: number;
}

export interface ReportSummary {
  totalIncome: number;
  totalExpense: number;
  net: number;
}

export const CATEGORY_COLOR: Record<string, string> = {
  food:          '#FF8C42',
  transport:     '#60A5FA',
  shopping:      '#A78BFA',
  health:        '#F472B6',
  entertainment: '#FBBF24',
  travel:        '#7B7FD4',
  groceries:     '#4ADE80',
  salary:        '#4ADE80',
  other:         '#94A3B8',
};

export const getMonthlyReport = (months = 6, year?: number): Promise<MonthlyData[]> =>
  api.get('/reports/monthly', { params: { months, year } }).then(r => r.data);

export interface DateRangeParams {
  month?: number;
  year?: number;
  startDate?: string;  // ISO string — overrides month/year when provided
  endDate?: string;    // ISO string
}

export const getCategoryBreakdown = (params: DateRangeParams): Promise<CategoryBreakdown[]> =>
  api.get('/reports/by-category', { params }).then(r => r.data);

export const getReportSummary = (params: DateRangeParams): Promise<ReportSummary> =>
  api.get('/reports/summary', { params }).then(r => r.data);

export const getTopExpenses = (month?: number, year?: number, limit = 4): Promise<any[]> =>
  api.get('/reports/top-expenses', { params: { month, year, limit } }).then(r => r.data);

export interface AiAdvice {
  verdict: 'good' | 'fair' | 'poor';
  summary: string;
  advice: string;
  tips: string[];
}

export const getAiAdvice = (params: DateRangeParams & { currency?: string }): Promise<AiAdvice> =>
  api.get('/reports/ai-advice', { params }).then(r => r.data);
