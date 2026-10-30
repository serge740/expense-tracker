import { useRef, useState, Fragment, type ComponentType, type ReactNode } from 'react';
import {
  Check, ChevronLeft, ChevronRight, Download, Upload, UploadCloud,
  FileJson, FileSpreadsheet, FileText, RotateCcw,
  CheckCircle2, AlertTriangle, Info, Loader2,
} from 'lucide-react';
import dataExportService from '../services/dataExportService';
import Panel from '../components/Panel';
import Button from '../components/Button';
import Badge from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';

// ─── Constants ────────────────────────────────────────

const EXPORT_GROUPS = [
  { id: 'finances', label: 'Wallets & Transactions', desc: 'Wallets, transactions, budgets, saved views, trash', warn: 'Can be very large' },
  { id: 'debts', label: 'Debts & Loans', desc: 'Debts, installments and payments', warn: null },
  { id: 'scheduling', label: 'Reminders & Scheduled', desc: 'Reminders, fire history, scheduled/recurring transactions', warn: null },
  { id: 'family', label: 'Family Portal', desc: 'Families, members, invites, goals, allowances, approvals, comments', warn: null },
  { id: 'notifications', label: 'Notifications', desc: 'In-app notification history', warn: 'Can be large' },
] as const;

const RECORD_FILTERS = [
  { id: 'all', label: 'All accounts', desc: 'Active and deactivated accounts' },
  { id: 'active', label: 'Active only', desc: 'Exclude deactivated accounts' },
  { id: 'inactive', label: 'Inactive only', desc: 'Only deactivated accounts' },
] as const;

const FORMAT_OPTIONS = [
  { id: 'json', label: 'JSON — Full Backup', desc: 'Complete, re-importable backup', icon: FileJson, tone: 'info' as const },
  { id: 'excel', label: 'Excel — Spreadsheet', desc: 'A few key sheets, human-readable', icon: FileSpreadsheet, tone: 'ok' as const },
  { id: 'pdf', label: 'PDF — Summary Report', desc: 'Account & activity counts', icon: FileText, tone: 'danger' as const },
];

const GROUP_LABELS: Record<string, string> = Object.fromEntries(EXPORT_GROUPS.map((g) => [g.id, g.label]));

const CONFLICT_STRATEGIES = [
  { id: 'SKIP', label: 'Skip existing', badge: 'Recommended', tone: 'ok' as const, desc: 'Import only new records. Existing records stay untouched.' },
  { id: 'OVERWRITE', label: 'Overwrite existing', badge: 'Updates accounts', tone: 'info' as const, desc: 'Update existing Clients, Families, notification preferences and saved sub-categories with backup values.' },
  { id: 'RESTORE_DELETED', label: 'Restore deactivated', badge: 'Un-deletes accounts', tone: 'warn' as const, desc: 'Reactivate deactivated client accounts. Nothing else in this schema has a matching "undelete".' },
  { id: 'ABORT_ON_CONFLICT', label: 'Abort on conflict', badge: 'Strictest', tone: 'danger' as const, desc: 'Stop immediately if any record already exists. Safe for a clean-slate restore.' },
];

// ─── Small building blocks ────────────────────────────

function StepIndicator({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className="mb-6 flex items-center px-1">
      {[1, 2, 3].map((n, i) => {
        const done = current > n;
        const active = current === n;
        return (
          <Fragment key={n}>
            {i > 0 && <div className={`mx-2.5 mb-[18px] h-px flex-1 ${current > i ? 'bg-success' : 'bg-border'}`} />}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold ${
                  done ? 'bg-success text-white' : active ? 'bg-accent text-white ring-4 ring-accent-soft' : 'bg-panel-3 text-fg-4'
                }`}
              >
                {done ? <Check size={13} /> : n}
              </div>
              <span className={`whitespace-nowrap text-[10px] font-bold uppercase tracking-wide ${active ? 'text-accent-fg' : done ? 'text-success' : 'text-fg-4'}`}>{labels[i]}</span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

interface OptionCardProps {
  selected: boolean;
  onClick: () => void;
  icon?: ComponentType<{ size?: number }>;
  tone?: string;
  title: string;
  desc: string;
  badge?: string;
  badgeTone?: string;
}

function OptionCard({ selected, onClick, icon: Icon, tone, title, desc, badge, badgeTone }: OptionCardProps) {
  const toneMap: Record<string, string> = { ok: 'bg-success-soft text-success', info: 'bg-info-soft text-info', danger: 'bg-danger-soft text-danger', warn: 'bg-warning-soft text-warning' };
  const iconToneClass = (tone && toneMap[tone]) || 'bg-accent-soft text-accent';
  return (
    <div
      onClick={onClick}
      className={`mb-1.5 flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition last:mb-0 ${selected ? 'border-accent bg-accent-soft' : 'border-border hover:bg-panel-2'}`}
    >
      <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] ${selected ? 'border-accent bg-accent' : 'border-border-strong'}`}>
        {selected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
      </div>
      {Icon && (
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconToneClass}`}>
          <Icon size={16} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-bold text-fg">{title}</span>
          {badge && <Badge tone={badgeTone as any}>{badge}</Badge>}
        </div>
        <div className="mt-0.5 text-[12px] text-fg-3">{desc}</div>
      </div>
    </div>
  );
}

function GroupRow({ checked, onClick, title, desc, warn }: { checked: boolean; onClick: () => void; title: string; desc: string; warn?: string | null }) {
  return (
    <div onClick={onClick} className={`flex cursor-pointer items-start gap-3 border-b border-border px-5 py-3 last:border-b-0 ${checked ? 'bg-accent-soft' : 'hover:bg-panel-2'}`}>
      <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-[1.5px] ${checked ? 'border-accent bg-accent' : 'border-border-strong'}`}>
        {checked && <Check size={10} className="text-white" strokeWidth={3} />}
      </div>
      <div className="flex-1">
        <div className="text-[13px] font-bold text-fg">{title}</div>
        <div className="mt-0.5 text-[12px] text-fg-3">{desc}</div>
      </div>
      {warn && <Badge tone="warn">{warn}</Badge>}
    </div>
  );
}

function ResultRow({ r }: { r: any }) {
  const [open, setOpen] = useState(false);
  const hasWarnings = r.warnings?.length > 0;
  const dotColor = r.failed > 0 ? 'bg-danger' : hasWarnings ? 'bg-warning' : 'bg-success';
  if (!r.created && !r.updated && !r.skipped && !r.failed) return null;
  return (
    <div className="mb-1.5 overflow-hidden rounded-lg border border-border last:mb-0">
      <button type="button" onClick={() => hasWarnings && setOpen((o) => !o)} className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left ${hasWarnings ? 'cursor-pointer' : 'cursor-default'}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
        <span className="flex-1 text-[12.5px] font-bold text-fg">{r.entity}</span>
        <span className="flex gap-2.5 text-[11.5px] font-mono">
          {r.created > 0 && <span className="text-success">+{r.created}</span>}
          {r.updated > 0 && <span className="text-info">↑{r.updated}</span>}
          {r.skipped > 0 && <span className="text-warning">{r.skipped}</span>}
          {r.failed > 0 && <span className="text-danger">{r.failed}</span>}
        </span>
        {hasWarnings && <ChevronRight size={13} className={`shrink-0 text-fg-4 transition-transform ${open ? 'rotate-90' : ''}`} />}
      </button>
      {open && hasWarnings && (
        <div className="border-t border-border bg-warning-soft px-3.5 py-2.5">
          {r.warnings.map((w: string, i: number) => <p key={i} className="text-[11.5px] leading-relaxed text-warning">{w}</p>)}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────

export default function DataExportPage() {
  const [tab, setTab] = useState<'export' | 'import'>('export');

  const [exportStep, setExportStep] = useState(1);
  const [exportDone, setExportDone] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState('');
  const [groups, setGroups] = useState<string[]>([]);
  const [format, setFormat] = useState('json');
  const [recordFilter, setRecordFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [importStep, setImportStep] = useState(1);
  const [importDone, setImportDone] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [conflictStrategy, setConflictStrategy] = useState('SKIP');
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewStrategy, setPreviewStrategy] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [history, setHistory] = useState<any[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<any>(null);
  const [toast, setToast] = useState('');

  const runExport = async () => {
    setExportLoading(true); setExportError('');
    try {
      await dataExportService.exportData({ format, groups, recordFilter, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined });
      setExportDone(true);
    } catch (err: any) {
      setExportError(err.response?.data?.message || 'Export failed. Please try again.');
    } finally {
      setExportLoading(false);
    }
  };

  const resetExport = () => {
    setExportDone(false); setExportStep(1); setExportError('');
    setGroups([]); setFormat('json'); setRecordFilter('all'); setDateFrom(''); setDateTo('');
  };

  const loadPreview = async (f: File, strategy: string) => {
    setPreview(null); setPreviewError(''); setPreviewLoading(true);
    try {
      const data = await dataExportService.importPreview(f, strategy);
      setPreview(data); setPreviewStrategy(strategy);
    } catch (err: any) {
      setPreviewError(err.response?.data?.message || 'Could not read file. Make sure it is a valid AbyExpense self-backup.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.json')) {
      setPreviewError('Unsupported file type. Upload a .json self-backup file.');
      return;
    }
    setFile(f); setPreview(null); setPreviewStrategy(null); setResults(null); setImportError(''); setPreviewError('');
    loadPreview(f, conflictStrategy);
  };

  const runImport = async () => {
    if (!file) return;
    setImportLoading(true); setImportError('');
    try {
      const data = await dataExportService.importData(file, { conflictStrategy });
      setResults(data);
      setImportDone(true);
      loadHistory();
    } catch (err: any) {
      const conflicts = err.response?.data?.conflicts;
      setImportError(conflicts?.length ? `Import aborted — conflicts in: ${conflicts.join(', ')}` : (err.response?.data?.message || 'Import failed.'));
    } finally {
      setImportLoading(false);
    }
  };

  const resetImport = () => {
    setImportDone(false); setImportStep(1); setImportError('');
    setFile(null); setPreview(null); setPreviewError(''); setPreviewStrategy(null); setResults(null);
    setConflictStrategy('SKIP');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const loadHistory = async () => {
    if (historyLoading) return;
    setHistoryLoading(true);
    try { setHistory(await dataExportService.getImportHistory()); }
    catch { /* history panel just stays empty */ }
    finally { setHistoryLoading(false); }
  };

  const confirmRollback = async () => {
    try {
      await dataExportService.rollbackImport(rollbackTarget.id);
      setToast('Import rolled back');
      setRollbackTarget(null);
      loadHistory();
      setTimeout(() => setToast(''), 3000);
    } catch (err: any) {
      setToast(err.response?.data?.message || 'Rollback failed');
      setTimeout(() => setToast(''), 3000);
    }
  };

  const isExport = tab === 'export';
  const curStep = isExport ? exportStep : importStep;
  const isDone = isExport ? exportDone : importDone;

  const handleBack = () => (isExport ? setExportStep((s) => Math.max(1, s - 1)) : setImportStep((s) => Math.max(1, s - 1)));

  const handleNext = async () => {
    if (isExport) {
      if (exportStep === 3) { await runExport(); return; }
      setExportStep((s) => s + 1);
      return;
    }
    if (importStep === 3) { await runImport(); return; }
    if (importStep === 2 && file && (!preview || previewStrategy !== conflictStrategy)) loadPreview(file, conflictStrategy);
    setImportStep((s) => s + 1);
  };

  const nextDisabled =
    (isExport && exportLoading) ||
    (!isExport && importLoading) ||
    (!isExport && importStep === 2 && !file) ||
    (!isExport && importStep === 3 && (previewLoading || !!previewError));

  const nextLabel = exportLoading ? 'Exporting…' : importLoading ? 'Importing…' : curStep === 3 ? (isExport ? 'Export Now' : 'Import Now') : 'Continue';

  const selGroups = EXPORT_GROUPS.filter((g) => groups.includes(g.id));
  const selFormat = FORMAT_OPTIONS.find((f) => f.id === format) ?? FORMAT_OPTIONS[0];
  const selFilter = RECORD_FILTERS.find((f) => f.id === recordFilter) ?? RECORD_FILTERS[0];
  const selStrategy = CONFLICT_STRATEGIES.find((s) => s.id === conflictStrategy) ?? CONFLICT_STRATEGIES[0];
  const largeGroups = selGroups.filter((g) => g.warn?.toLowerCase().includes('large'));

  const EXPORT_LABELS = ['Select Data', 'Format & Range', 'Review'];
  const IMPORT_LABELS = ['Strategy', 'Upload File', 'Preview'];

  const renderExportStep1 = () => (
    <div>
      <Panel
        title="Data Groups"
        action={
          <div className="flex items-center gap-2">
            <Badge tone="info">{groups.length}/5 selected</Badge>
            <button type="button" className="text-[11.5px] font-bold text-accent hover:underline" onClick={() => setGroups(EXPORT_GROUPS.map((g) => g.id))}>All</button>
            <button type="button" className="text-[11.5px] font-bold text-fg-4 hover:underline" onClick={() => setGroups([])}>None</button>
          </div>
        }
        className="mb-3"
      >
        <div className="flex items-start gap-3 border-b border-border bg-panel-2 px-5 py-3">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-success">
            <Check size={10} className="text-white" strokeWidth={3} />
          </span>
          <div>
            <span className="text-[13px] font-bold text-fg-2">Accounts</span>
            <span className="ml-2 text-[12px] text-fg-4">always included</span>
            <div className="mt-0.5 text-[12px] text-fg-4">Client accounts, saved sub-categories, notification preferences</div>
          </div>
        </div>
        {EXPORT_GROUPS.map((g) => (
          <GroupRow key={g.id} checked={groups.includes(g.id)} onClick={() => setGroups((prev) => (prev.includes(g.id) ? prev.filter((x) => x !== g.id) : [...prev, g.id]))} title={g.label} desc={g.desc} warn={g.warn} />
        ))}
      </Panel>

      <Panel title="Record Filter" sub="Applies to client accounts">
        <div className="p-3">
          {RECORD_FILTERS.map((f) => (
            <OptionCard key={f.id} selected={recordFilter === f.id} onClick={() => setRecordFilter(f.id)} title={f.label} desc={f.desc} />
          ))}
        </div>
      </Panel>
    </div>
  );

  const renderExportStep2 = () => (
    <div>
      <Panel title="Export Format" className="mb-3">
        <div className="p-3">
          {FORMAT_OPTIONS.map((opt) => (
            <OptionCard key={opt.id} selected={format === opt.id} onClick={() => setFormat(opt.id)} icon={opt.icon} tone={opt.tone} title={opt.label} desc={opt.desc} />
          ))}
        </div>
      </Panel>

      <Panel title="Date Range" sub="Optional — applies to Transactions and Notifications">
        <div className="flex gap-3 p-4">
          <label className="flex-1">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-fg-3">From</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-[13px] text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft" />
          </label>
          <label className="flex-1">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-fg-3">To</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2 text-[13px] text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft" />
          </label>
        </div>
      </Panel>
    </div>
  );

  const renderExportStep3 = () => (
    <Panel title="Review Export">
      <div className="divide-y divide-border">
        <div className="px-5 py-3.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-fg-4">Data Groups</div>
          <div className="mt-1 text-[13px] font-bold text-fg">{groups.length === 0 ? 'Accounts only' : `Accounts + ${groups.length} more (${selGroups.map((g) => g.label).join(', ')})`}</div>
        </div>
        <div className="flex gap-6 px-5 py-3.5">
          <div className="flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-fg-4">Format</div>
            <div className="mt-1 text-[13px] font-bold text-fg">{selFormat.label}</div>
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-fg-4">Accounts</div>
            <div className="mt-1 text-[13px] font-bold text-fg">{selFilter.label}</div>
          </div>
        </div>
        <div className="px-5 py-3.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-fg-4">Date Range</div>
          <div className="mt-1 text-[13px] font-bold text-fg">{(dateFrom || dateTo) ? `${dateFrom || '—'} → ${dateTo || '—'}` : 'All dates'}</div>
        </div>
      </div>
      {largeGroups.length > 0 && (
        <div className="flex gap-2 border-t border-border bg-panel-2 px-5 py-3">
          <Info size={14} className="mt-0.5 shrink-0 text-fg-4" />
          <p className="text-[12px] text-fg-3">{largeGroups.map((g) => g.label).join(', ')} can produce a large file.</p>
        </div>
      )}
      {exportError && <div className="border-t border-border bg-danger-soft px-5 py-3 text-[12.5px] text-danger">{exportError}</div>}
    </Panel>
  );

  const renderExportDone = () => (
    <div className="rounded-xl border border-border bg-panel px-6 py-12 text-center">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-soft">
        <CheckCircle2 size={26} className="text-success" />
      </span>
      <div className="text-[17px] font-bold text-fg">Export complete</div>
      <div className="mt-1.5 text-[12.5px] text-fg-3">{groups.length + 1} data group{groups.length + 1 !== 1 ? 's' : ''} exported as {selFormat.label}</div>
      <Button variant="secondary" className="mt-5" onClick={resetExport}>New export</Button>
    </div>
  );

  const renderImportStep1 = () => (
    <Panel title="Import Strategy" sub="What happens when a record already exists?">
      <div className="p-3">
        {CONFLICT_STRATEGIES.map((s) => (
          <OptionCard key={s.id} selected={conflictStrategy === s.id} onClick={() => setConflictStrategy(s.id)} title={s.label} desc={s.desc} badge={s.badge} badgeTone={s.tone} />
        ))}
      </div>
    </Panel>
  );

  const renderImportStep2 = () => (
    <Panel title="Upload File">
      <div className="p-5">
        <p className="mb-3.5 text-[12.5px] leading-relaxed text-fg-3">
          Upload a <code className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[11.5px]">.json</code> self-backup file to restore this app's own data.
        </p>
        {!file ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition ${drag ? 'border-accent bg-accent-soft' : 'border-border bg-panel-2'}`}
          >
            <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <UploadCloud size={20} />
            </span>
            <div className="text-[13px] font-bold text-fg">Drop file here or click to browse</div>
            <div className="mt-1 text-[11.5px] text-fg-4">.json self-backup file</div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-panel-2 p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-soft font-mono text-[9px] font-bold text-success">JSON</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-bold text-fg">{file.name}</div>
              <div className="mt-0.5 text-[11.5px] text-fg-4">{(file.size / 1024).toFixed(1)} KB</div>
            </div>
            <Button variant="secondary" className="px-3 py-1.5 text-[12px]" onClick={() => { setFile(null); setPreview(null); setPreviewError(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}>Remove</Button>
          </div>
        )}
        {previewError && <div className="mt-3 rounded-lg bg-danger-soft px-3.5 py-2.5 text-[12px] text-danger">{previewError}</div>}
        <input ref={fileInputRef} type="file" accept=".json" onChange={(e) => { const f = e.target.files?.[0] ?? null; if (f) handleFile(f); }} className="hidden" />
      </div>
    </Panel>
  );

  const renderImportStep3 = () => {
    const entityKeys: string[] = preview ? Object.keys(preview.wouldCreate ?? {}) : [];
    return (
      <Panel title="Import Preview" sub={`"${selStrategy.label}"`}>
        {previewLoading && <div className="px-5 py-8 text-center text-[12.5px] text-fg-4">Analysing file…</div>}
        {!previewLoading && previewError && <div className="px-5 py-4 text-[12.5px] text-danger">{previewError}</div>}
        {!previewLoading && !previewError && preview && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-panel-2">
                  <th className="px-5 py-2.5 text-[10px] font-bold uppercase tracking-wide text-fg-4">Entity</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-success">Create</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-info">Update</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-warning">Skip</th>
                </tr>
              </thead>
              <tbody>
                {entityKeys.map((key) => {
                  const c = preview.wouldCreate?.[key] ?? 0;
                  const u = preview.wouldUpdate?.[key] ?? 0;
                  const s = preview.wouldSkip?.[key] ?? 0;
                  if (!c && !u && !s) return null;
                  return (
                    <tr key={key} className="border-b border-border/60">
                      <td className="px-5 py-2.5 text-[12.5px] font-medium text-fg">{GROUP_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').trim()}</td>
                      <td className={`px-5 py-2.5 text-right font-mono text-[12.5px] font-bold ${c > 0 ? 'text-success' : 'text-border-strong'}`}>{c > 0 ? `+${c}` : '—'}</td>
                      <td className={`px-5 py-2.5 text-right font-mono text-[12.5px] font-bold ${u > 0 ? 'text-info' : 'text-border-strong'}`}>{u > 0 ? `↑${u}` : '—'}</td>
                      <td className={`px-5 py-2.5 text-right font-mono text-[12.5px] font-bold ${s > 0 ? 'text-warning' : 'text-border-strong'}`}>{s > 0 ? s : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex gap-2 border-t border-border px-5 py-3">
          <Info size={13} className="mt-0.5 shrink-0 text-fg-4" />
          <p className="text-[11.5px] text-fg-3">Wallets, transactions, debts, reminders, schedules, family-portal records and notifications are never overwritten, regardless of strategy.</p>
        </div>
        {importError && <div className="border-t border-border bg-danger-soft px-5 py-3 text-[12.5px] text-danger">{importError}</div>}
      </Panel>
    );
  };

  const renderImportDone = () => (
    <div>
      <div className={`rounded-xl border border-border bg-panel px-6 py-12 text-center ${results ? 'mb-3' : ''}`}>
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-soft">
          <CheckCircle2 size={26} className="text-success" />
        </span>
        <div className="text-[17px] font-bold text-fg">Import complete</div>
        <div className="mt-1.5 text-[12.5px] text-fg-3">Data restored using "{selStrategy.label}"</div>
        <Button variant="secondary" className="mt-5" onClick={resetImport}>Import another file</Button>
      </div>
      {results && (
        <Panel
          title="Results"
          sub={[
            results.summary.created > 0 && `${results.summary.created} created`,
            results.summary.updated > 0 && `${results.summary.updated} updated`,
            results.summary.skipped > 0 && `${results.summary.skipped} skipped`,
            results.summary.failed > 0 && `${results.summary.failed} failed`,
          ].filter(Boolean).join(' · ')}
        >
          <div className="p-3">{results.results.map((r: any, i: number) => <ResultRow key={i} r={r} />)}</div>
        </Panel>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-bold text-fg">Data Export &amp; Import</h1>
          <p className="mt-1 text-[13px] text-fg-3">Self-backup AbyExpense's own data — accounts, finances, debts, family portal and more.</p>
        </div>
        <div className="flex rounded-xl border border-border bg-panel-2 p-1">
          <button type="button" onClick={() => setTab('export')} className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold transition ${tab === 'export' ? 'bg-panel text-fg shadow-sm' : 'text-fg-4 hover:text-fg'}`}>
            <Download size={14} /> Export
          </button>
          <button type="button" onClick={() => { setTab('import'); if (!history) loadHistory(); }} className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold transition ${tab === 'import' ? 'bg-panel text-fg shadow-sm' : 'text-fg-4 hover:text-fg'}`}>
            <Upload size={14} /> Import
          </button>
        </div>
      </div>

      {!isDone && <StepIndicator current={curStep} labels={isExport ? EXPORT_LABELS : IMPORT_LABELS} />}

      {isExport ? (
        exportDone ? renderExportDone() : exportStep === 1 ? renderExportStep1() : exportStep === 2 ? renderExportStep2() : renderExportStep3()
      ) : (
        importDone ? renderImportDone() : importStep === 1 ? renderImportStep1() : importStep === 2 ? renderImportStep2() : renderImportStep3()
      )}

      {!isDone && (
        <div className="mt-4 flex items-center justify-between">
          <Button variant="secondary" onClick={handleBack} className={curStep > 1 ? '' : 'invisible'}>
            <ChevronLeft size={14} /> Back
          </Button>
          <Button onClick={handleNext} disabled={nextDisabled}>
            {(importLoading || exportLoading) && <Loader2 size={14} className="animate-spin" />}
            {nextLabel}
            {curStep < 3 && <ChevronRight size={14} />}
          </Button>
        </div>
      )}

      {!isExport && (
        <Panel
          className="mt-7"
          title="Import History"
          action={<button type="button" onClick={loadHistory} disabled={historyLoading} className="text-[11.5px] font-bold text-accent hover:underline disabled:opacity-50">{historyLoading ? 'Loading…' : 'Refresh'}</button>}
        >
          {!history && !historyLoading && <div className="px-5 py-6 text-center text-[12.5px] text-fg-4">Switch to the Import tab to load history.</div>}
          {historyLoading && <div className="px-5 py-6 text-center text-[12.5px] text-fg-4">Loading…</div>}
          {history && history.length === 0 && <div className="px-5 py-6 text-center text-[12.5px] text-fg-4">No imports recorded yet.</div>}
          {history && history.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-border bg-panel-2">
                    {['Date', 'File', 'Strategy', 'Created', 'Updated', 'Skipped', 'Status', ''].map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-fg-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((snap: any) => (
                    <tr key={snap.id} className={`border-b border-border/60 ${snap.status === 'rolled_back' ? 'opacity-55' : ''}`}>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11.5px] text-fg-4">{new Date(snap.createdAt).toLocaleString()}</td>
                      <td className="max-w-[160px] truncate px-4 py-2.5 text-[12px] font-semibold" title={snap.fileName}>{snap.fileName}</td>
                      <td className="px-4 py-2.5 text-[11.5px] text-fg-3">{snap.strategy}</td>
                      <td className="px-4 py-2.5 font-mono text-[11.5px] font-bold text-success">{snap.summary?.created > 0 ? `+${snap.summary.created}` : '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-[11.5px] font-bold text-info">{snap.summary?.updated > 0 ? `↑${snap.summary.updated}` : '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-[11.5px] text-fg-4">{snap.summary?.skipped > 0 ? snap.summary.skipped : '—'}</td>
                      <td className="px-4 py-2.5"><Badge tone={snap.status === 'rolled_back' ? 'mute' : 'ok'}>{snap.status === 'rolled_back' ? 'Rolled back' : 'Active'}</Badge></td>
                      <td className="px-4 py-2.5">
                        {snap.status === 'active' && snap.summary?.created > 0 && (
                          <button type="button" onClick={() => setRollbackTarget(snap)} className="flex items-center gap-1 rounded-lg border border-danger/30 px-2.5 py-1 text-[11.5px] font-bold text-danger hover:bg-danger-soft">
                            <RotateCcw size={11} /> Rollback
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {rollbackTarget && (
        <ConfirmDialog
          icon={RotateCcw}
          title="Rollback this import?"
          description={`This will permanently delete the ${rollbackTarget.summary?.created} record(s) created by importing "${rollbackTarget.fileName}" on ${new Date(rollbackTarget.createdAt).toLocaleString()}.`}
          details={<p className="text-[12.5px] leading-relaxed text-fg-3">Records that were <em>updated</em> (not created) are not reverted.</p>}
          confirmLabel="Yes, rollback"
          onConfirm={confirmRollback}
          onClose={() => setRollbackTarget(null)}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-border bg-panel px-4 py-3 text-[13px] font-semibold text-fg shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
