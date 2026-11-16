import { useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Link2,
  LogOut,
  Plus,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import {
  AgencySettings,
  AssetCategory,
  AssetItem,
  MaintenanceRecord,
  ReferenceConfig,
} from '../types/asset';
import {
  createAssetWorkbook,
  getSpreadsheetMetadata,
  pullFromGoogleSheets,
  SpreadsheetMetadata,
  syncAllToGoogleSheets,
} from '../services/googleSheets';
import { ConfirmModal } from './ConfirmModal';

interface GoogleSheetsModalProps {
  open: boolean;
  onClose: () => void;
  needsAuth: boolean;
  user: User | null;
  accessToken: string | null;
  hasSheetsScope: boolean;
  onMarkMissingScope: () => void;
  isLoggingIn: boolean;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  connectedSheet: SpreadsheetMetadata | null;
  onSetConnectedSheet: (meta: SpreadsheetMetadata | null) => void;
  settings: AgencySettings;
  reference: ReferenceConfig;
  assets: AssetItem[];
  maintenance: MaintenanceRecord[];
  onApplyPulledData: (data: {
    settings?: AgencySettings;
    categories?: AssetCategory[];
    locations?: string[];
    assets?: AssetItem[];
    maintenance?: MaintenanceRecord[];
  }) => void;
}

type PendingAction =
  | { type: 'create'; title: string }
  | { type: 'push'; spreadsheetId: string; title: string }
  | { type: 'pull'; spreadsheetId: string; title: string }
  | null;

export function GoogleSheetsModal({
  open,
  onClose,
  needsAuth,
  user,
  accessToken,
  hasSheetsScope,
  onMarkMissingScope,
  isLoggingIn,
  onSignIn,
  onSignOut,
  connectedSheet,
  onSetConnectedSheet,
  settings,
  reference,
  assets,
  maintenance,
  onApplyPulledData,
}: GoogleSheetsModalProps) {
  const [sheetUrlInput, setSheetUrlInput] = useState(
    connectedSheet?.spreadsheetId || ''
  );
  const [newSheetTitle, setNewSheetTitle] = useState(
    `ทะเบียนครุภัณฑ์_${settings.agencyName}_${settings.fiscalYear}`
  );
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
    isScopeError?: boolean;
  } | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  if (!open) return null;

  const isInsufficientScopeError = (err: unknown): boolean => {
    const msg = err instanceof Error ? err.message : String(err || '');
    return (
      msg.toLowerCase().includes('insufficient authentication scopes') ||
      msg.toLowerCase().includes('insufficient permission') ||
      msg.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')
    );
  };

  const handleInspectSheet = async () => {
    if (!accessToken) return;
    setBusy(true);
    setStatusMessage(null);
    try {
      const meta = await getSpreadsheetMetadata(accessToken, sheetUrlInput);
      onSetConnectedSheet(meta);
      setStatusMessage({
        type: 'success',
        text: `เชื่อมต่อไฟล์ "${meta.title}" สำเร็จ (พบ ${meta.sheetNames.length} แผ่นงาน)`,
      });
    } catch (err: any) {
      if (isInsufficientScopeError(err)) {
        onMarkMissingScope();
        setStatusMessage({
          type: 'error',
          isScopeError: true,
          text: 'บัญชี Google ยังไม่ได้อนุญาตสิทธิ์เข้าถึง Google Sheets (Request had insufficient authentication scopes)',
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: err?.message || 'ไม่สามารถอ่านข้อมูล Google Sheets ได้',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const executePendingAction = async () => {
    if (!pendingAction || !accessToken) return;
    setBusy(true);
    setStatusMessage(null);
    try {
      if (pendingAction.type === 'create') {
        const created = await createAssetWorkbook(accessToken, pendingAction.title, {
          settings,
          reference,
          assets,
          maintenance,
        });
        onSetConnectedSheet(created);
        setSheetUrlInput(created.spreadsheetId);
        setStatusMessage({
          type: 'success',
          text: `สร้างและส่งออกข้อมูลไปยัง Google Sheets "${created.title}" เรียบร้อยแล้ว`,
        });
      } else if (pendingAction.type === 'push') {
        const updated = await syncAllToGoogleSheets(
          accessToken,
          pendingAction.spreadsheetId,
          { settings, reference, assets, maintenance }
        );
        onSetConnectedSheet(updated);
        setStatusMessage({
          type: 'success',
          text: `อัปเดตข้อมูลทั้ง ${assets.length} รายการ และประวัติซ่อม ${maintenance.length} รายการ ลง Google Sheets เรียบร้อยแล้ว`,
        });
      } else if (pendingAction.type === 'pull') {
        const pulled = await pullFromGoogleSheets(
          accessToken,
          pendingAction.spreadsheetId,
          settings,
          reference
        );
        onSetConnectedSheet(pulled.metadata);
        onApplyPulledData(pulled);
        setStatusMessage({
          type: 'success',
          text: `นำเข้าข้อมูลจาก "${pulled.metadata.title}" สำเร็จ (ครุภัณฑ์ ${
            pulled.assets?.length ?? 0
          } รายการ, ประวัติซ่อม ${pulled.maintenance?.length ?? 0} รายการ)`,
        });
      }
    } catch (err: any) {
      if (isInsufficientScopeError(err)) {
        onMarkMissingScope();
        setStatusMessage({
          type: 'error',
          isScopeError: true,
          text: 'บัญชี Google ยังไม่ได้อนุญาตสิทธิ์เข้าถึง Google Sheets (Request had insufficient authentication scopes)',
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: err?.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ Google Sheets',
        });
      }
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  };

  const showScopeAlert =
    (!needsAuth && accessToken && !hasSheetsScope) || statusMessage?.isScopeError;

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="w-5 h-5 text-emerald-800" />
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  เชื่อมต่อฐานข้อมูล Google Sheets
                </h2>
                <p className="text-xs text-slate-500">
                  ซิงค์ทะเบียนครุภัณฑ์ ค่าเสื่อมราคา ประวัติซ่อมบำรุง และรายงานงบประมาณแบบออนไลน์
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-6">
            {/* Step 1: Google Sign-In */}
            <div className="border border-slate-200 rounded-lg p-4 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    1. บัญชี Google สำหรับเข้าถึง Google Sheets
                  </div>
                  {user && !needsAuth ? (
                    <div className="flex items-center gap-2 mt-1 text-xs text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        เชื่อมต่อแล้ว: {user.displayName || user.email} ({user.email})
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 mt-1">
                      ลงชื่อเข้าใช้ด้วยบัญชี Google เพื่อสร้างหรืออัปเดตไฟล์ Google Sheets ของหน่วยงาน
                    </p>
                  )}
                </div>

                {needsAuth || !accessToken ? (
                  <button
                    type="button"
                    onClick={onSignIn}
                    disabled={isLoggingIn}
                    className="gsi-material-button"
                  >
                    <div className="gsi-material-button-icon">
                      <svg
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        style={{ display: 'block' }}
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                        <path fill="none" d="M0 0h48v48H0z" />
                      </svg>
                    </div>
                    <span>
                      {isLoggingIn ? 'กำลังเข้าสู่ระบบ...' : 'Sign in with Google'}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>ออกจากระบบ</span>
                  </button>
                )}
              </div>
            </div>

            {showScopeAlert && (
              <div className="px-4 py-3.5 rounded-lg text-xs bg-amber-50 border border-amber-300 text-amber-950 space-y-2">
                <div className="flex items-start gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>
                    บัญชี Google ยังไม่ได้อนุญาตสิทธิ์เข้าถึง Google Sheets
                  </span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-amber-900 pl-1">
                  <li>
                    กดปุ่ม <strong>ขออนุญาตสิทธิ์ Google Sheets ใหม่</strong> ด้านล่าง
                  </li>
                  <li>
                    เลือกบัญชี Google ของคุณ (หากขึ้นหน้าแจ้งเตือนแอป ให้กด{' '}
                    <strong>ขั้นสูง / Advanced</strong> แล้วเลือกดำเนินการต่อ)
                  </li>
                  <li>
                    ในหน้าเลือกสิทธิ์ <strong>ต้องติ๊กเครื่องหมายถูก (✓)</strong> ในช่อง{' '}
                    <strong>&quot;ดู แก้ไข สร้าง และลบสเปรดชีต Google ชีตทั้งหมดของคุณ&quot;</strong>{' '}
                    ก่อนกด <strong>ดำเนินการต่อ (Continue)</strong>
                  </li>
                </ol>
                <div className="pt-1 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isLoggingIn}
                    onClick={async () => {
                      setStatusMessage(null);
                      await onSignIn();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg disabled:opacity-60"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>
                      {isLoggingIn
                        ? 'กำลังเปิดหน้าต่างขอสิทธิ์...'
                        : 'ขออนุญาตสิทธิ์ Google Sheets ใหม่'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {statusMessage && !statusMessage.isScopeError && (
              <div
                className={`px-4 py-3 rounded-lg text-xs font-medium border ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                {statusMessage.text}
              </div>
            )}

            {/* Step 2: Create New or Connect Existing Sheet */}
            {!needsAuth && accessToken && (
              <>
                <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="text-xs font-semibold text-slate-900">
                    2. สร้างไฟล์ Google Sheets ใหม่ (พร้อมโครงสร้าง 7 แผ่นงานมาตรฐาน)
                  </div>
                  <p className="text-xs text-slate-500">
                    สร้างสมุดงานใหม่ในบัญชี Google ของคุณโดยอัตโนมัติ พร้อมแท็บ ตั้งค่า, รายการอ้างอิง, ทะเบียนครุภัณฑ์, ประวัติซ่อมบำรุง, ค่าเสื่อมราคา, สรุปงบประมาณ และ GFMIS_เอกสาร5
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={newSheetTitle}
                      onChange={(e) => setNewSheetTitle(e.target.value)}
                      placeholder="ชื่อไฟล์ Google Sheets"
                      className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setPendingAction({
                          type: 'create',
                          title: newSheetTitle,
                        })
                      }
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg whitespace-nowrap shrink-0 disabled:opacity-60"
                    >
                      <Plus className="w-4 h-4" />
                      <span>สร้างและส่งออกข้อมูล</span>
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="text-xs font-semibold text-slate-900">
                    3. เชื่อมต่อไฟล์ Google Sheets ที่มีอยู่แล้ว
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={sheetUrlInput}
                      onChange={(e) => setSheetUrlInput(e.target.value)}
                      placeholder="วางลิงก์ Google Sheets (URL) หรือ Spreadsheet ID"
                      className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num"
                    />
                    <button
                      type="button"
                      disabled={busy || !sheetUrlInput.trim()}
                      onClick={handleInspectSheet}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg whitespace-nowrap shrink-0 disabled:opacity-60"
                    >
                      <Link2 className="w-4 h-4" />
                      <span>ตรวจสอบไฟล์</span>
                    </button>
                  </div>

                  {connectedSheet && (
                    <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-slate-900">
                            ไฟล์ที่เชื่อมต่ออยู่: {connectedSheet.title}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 font-mono-num">
                            ID: {connectedSheet.spreadsheetId} · แผ่นงาน:{' '}
                            {connectedSheet.sheetNames.join(', ')}
                          </div>
                        </div>
                        <a
                          href={connectedSheet.spreadsheetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline whitespace-nowrap"
                        >
                          <span>เปิดใน Google Sheets</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setPendingAction({
                              type: 'push',
                              spreadsheetId: connectedSheet.spreadsheetId,
                              title: connectedSheet.title,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg whitespace-nowrap disabled:opacity-60"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>ส่งออก/อัปเดตขึ้น Google Sheets</span>
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setPendingAction({
                              type: 'pull',
                              spreadsheetId: connectedSheet.spreadsheetId,
                              title: connectedSheet.title,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg whitespace-nowrap disabled:opacity-60"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>ดึงข้อมูลจาก Google Sheets</span>
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={handleInspectSheet}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg whitespace-nowrap"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>รีเฟรชแท็บ</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={pendingAction !== null}
        title={
          pendingAction?.type === 'create'
            ? 'ยืนยันการสร้างไฟล์ Google Sheets ใหม่'
            : pendingAction?.type === 'push'
            ? 'ยืนยันการเขียนทับข้อมูลลง Google Sheets'
            : 'ยืนยันการนำเข้าข้อมูลจาก Google Sheets'
        }
        description={
          pendingAction?.type === 'create'
            ? `ระบบจะสร้างไฟล์ Google Sheets ใหม่ชื่อ "${pendingAction.title}" ในบัญชี Google ของคุณ และเขียนข้อมูลทั้งหมดลงไป`
            : pendingAction?.type === 'push'
            ? `ระบบจะล้างข้อมูลเดิมในแท็บเป้าหมายของไฟล์ "${pendingAction.title}" แล้วเขียนข้อมูลล่าสุดจากระบบทับลงไป`
            : `ระบบจะอ่านข้อมูลจากไฟล์ "${pendingAction?.title}" และนำมาแทนที่ข้อมูลทะเบียนครุภัณฑ์และประวัติซ่อมบำรุงในหน้าจอปัจจุบัน`
        }
        details={
          pendingAction?.type === 'pull'
            ? [
                'แท็บที่จะนำเข้า: ตั้งค่า, รายการอ้างอิง, ทะเบียนครุภัณฑ์, ประวัติซ่อมบำรุง',
                'ข้อมูลที่แก้ไขไว้ในเบราว์เซอร์และยังไม่ได้ส่งออกจะถูกแทนที่',
              ]
            : [
                `ครุภัณฑ์ในทะเบียน: ${assets.length} รายการ`,
                `ประวัติการซ่อมบำรุง: ${maintenance.length} รายการ`,
                'แผ่นงานที่จะสร้าง/อัปเดต: ตั้งค่า, รายการอ้างอิง, ทะเบียนครุภัณฑ์, ประวัติซ่อมบำรุง, ค่าเสื่อมราคา, สรุปงบประมาณ, GFMIS_เอกสาร5',
              ]
        }
        confirmLabel={
          pendingAction?.type === 'pull'
            ? 'ยืนยันนำเข้าข้อมูล'
            : 'ยืนยันบันทึกขึ้น Google Sheets'
        }
        loading={busy}
        onConfirm={executePendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </>
  );
}
