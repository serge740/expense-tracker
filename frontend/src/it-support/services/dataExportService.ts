import api from '../lib/api';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const CONTENT_TYPES: Record<string, string> = {
  json: 'application/json',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};
const EXTENSIONS: Record<string, string> = { json: 'json', excel: 'xlsx', pdf: 'pdf' };

export interface ExportOptions {
  format: string;
  groups?: string[];
  recordFilter?: string;
  dateFrom?: string;
  dateTo?: string;
}

class DataExportService {
  async exportData(options: ExportOptions) {
    const dateStr = new Date().toISOString().split('T')[0];
    const format = options.format ?? 'json';
    const filenames: Record<string, string> = {
      json: `abyexpense-self-backup-${dateStr}.json`,
      excel: `abyexpense-export-${dateStr}.xlsx`,
      pdf: `abyexpense-report-${dateStr}.pdf`,
    };

    const { data } = await api.post('/it-support-api/data-export/export', options, {
      responseType: 'blob',
      headers: { 'Content-Type': 'application/json' },
    });

    const blob = new Blob([data], { type: CONTENT_TYPES[format] ?? CONTENT_TYPES.json });
    triggerDownload(blob, filenames[format] ?? `abyexpense-export-${dateStr}.${EXTENSIONS[format] ?? 'json'}`);
  }

  async importPreview(file: File, conflictStrategy = 'SKIP'): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('conflictStrategy', conflictStrategy);
    const { data } = await api.post('/it-support-api/data-export/import/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }

  async importData(file: File, options: { conflictStrategy?: string; groups?: string[] } = {}): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    if (options.conflictStrategy) formData.append('conflictStrategy', options.conflictStrategy);
    if (options.groups) formData.append('groups', JSON.stringify(options.groups));
    const { data } = await api.post('/it-support-api/data-export/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }

  async getImportHistory(): Promise<any[]> {
    const { data } = await api.get('/it-support-api/data-export/import/history');
    return data;
  }

  async rollbackImport(snapshotId: string): Promise<{ success: boolean }> {
    const { data } = await api.post(`/it-support-api/data-export/import/rollback/${snapshotId}`);
    return data;
  }
}

export default new DataExportService();
