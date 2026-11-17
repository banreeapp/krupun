import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Link2,
  Lock,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Unlock,
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
  SheetsSyncConfig,
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
  sheetsSyncConfig: SheetsSyncConfig;
  sessionAutoSyncConfirmed: boolean;
  isAutoSyncing: boolean;
  lastSheetsSyncAt: string | null;
  lastSheetsSyncError: string | null;
  nextAutoSyncAt: number | null;
  onLockAndStartAutoSync: () => Promise<void>;
  onLockOnly: () => void;
  onUnlockSheetsConfig: () => void;
  onPauseAutoSync: () => void;
  onSyncNow: () => Promise<void>;
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
  | { type: 'lock-and-autosync'; spreadsheetId: string; title: string }
  | { type: 'lock-only'; spreadsheetId: string; title: string }
  | { type: 'unlock'; title: string }
  | null;

function SyncCountdownLabel({
  nextAutoSyncAt,
  isSyncing,
}: {
  nextAutoSyncAt: number | null;
  isSyncing: boolean;
}) {
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    nextAutoSyncAt ? Math.max(0, Math.ceil((nextAutoSyncAt - Date.now()) / 1000)) : 30
  );

  useEffect(() => {
    if (!nextAutoSyncAt) return;
    const update = () => {
      setSecondsLeft(Math.max(0, Math.ceil((nextAutoSyncAt - Date.now()) / 1000)));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [nextAutoSyncAt]);

  if (isSyncing) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-800 font-medium">
        <RefreshCw className="w-3 h-3 animate-spin" />
        <span>กำลังบันทึกลง Google Sheets...</span>
      </span>
    );
  }

  if (!nextAutoSyncAt) return null;

  return (
    <span className="font-mono-num text-slate-600">
      บันทึกอัตโนมัติครั้งถัดไปในอีก {secondsLeft} วินาที
    </span>
  );
}

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
  sheetsSyncConfig,
  sessionAutoSyncConfirmed,
  isAutoSyncing,
  lastSheetsSyncAt,
  lastSheetsSyncError,
  nextAutoSyncAt,
  onLockAndStartAutoSync,
  onLockOnly,
  onUnlockSheetsConfig,
  onPauseAutoSync,
  onSyncNow,
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

  useEffect(() => {
    if (connectedSheet?.spreadsheetId) {
      setSheetUrlInput(connectedSheet.spreadsheetId);
    }
  }, [connectedSheet?.spreadsheetId]);

  if (!open) return null;

  const isLocked = sheetsSyncConfig.locked;
  const isAutoSyncActive =
    sheetsSyncConfig.autoSyncEnabled &&
    sessionAutoSyncConfirmed &&
    !needsAuth &&
    !!accessToken &&
    hasSheetsScope &&
    !!connectedSheet;

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
    if (!pendingAction) return;

    if (pendingAction.type === 'lock-only') {
      onLockOnly();
      setPendingAction(null);
      setStatusMessage({
        type: 'success',
        text: `ล็อคการตั้งค่าเชื่อมต่อไฟล์ "${pendingAction.title}" เรียบร้อยแล้ว`,
      });
      return;
    }

    if (pendingAction.type === 'unlock') {
      onUnlockSheetsConfig();
      setPendingAction(null);
      setStatusMessage({
        type: 'success',
        text: 'ปลดล็อคการตั้งค่าเชื่อมต่อ Google Sheets แล้ว สามารถแก้ไขปลายทางหรือดึงข้อมูลได้',
      });
      return;
    }

    if (!accessToken) return;
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
          { settings, reference, assets, maintenance },
          { knownMetadata: connectedSheet }
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
      } else if (pendingAction.type === 'lock-and-autosync') {
        await onLockAndStartAutoSync();
        setStatusMessage({
          type: 'success',
          text: `ล็อคการตั้งค่าเชื่อมต่อกับ "${pendingAction.title}" และเริ่มบันทึกอัตโนมัติทุก ${sheetsSyncConfig.intervalSeconds} วินาทีเรียบร้อยแล้ว`,
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

  const confirmModalMeta = (() => {
    if (!pendingAction) return null;
    switch (pendingAction.type) {
      case 'create':
        return {
          title: 'ยืนยันการสร้างไฟล์ Google Sheets ใหม่',
          description: `ระบบจะสร้างไฟล์ Google Sheets ใหม่ชื่อ "${pendingAction.title}" ในบัญชี Google ของคุณ และเขียนข้อมูลทั้งหมดลงไป`,
          details: [
            `ครุภัณฑ์ในทะเบียน: ${assets.length} รายการ`,
            `ประวัติการซ่อมบำรุง: ${maintenance.length} รายการ`,
            'แผ่นงานที่จะสร้าง: ตั้งค่า, รายการอ้างอิง, ทะเบียนครุภัณฑ์, ประวัติซ่อมบำรุง, ค่าเสื่อมราคา, สรุปงบประมาณ, GFMIS_เอกสาร5',
          ],
          confirmLabel: 'ยืนยันสร้างและบันทึกข้อมูล',
          variant: 'primary' as const,
        };
      case 'push':
        return {
          title: 'ยืนยันการเขียนทับข้อมูลลง Google Sheets',
          description: `ระบบจะล้างข้อมูลเดิมในแท็บเป้าหมายของไฟล์ "${pendingAction.title}" แล้วเขียนข้อมูลล่าสุดจากระบบทับลงไป`,
          details: [
            `ครุภัณฑ์ในทะเบียน: ${assets.length} รายการ`,
            `ประวัติการซ่อมบำรุง: ${maintenance.length} รายการ`,
            'แผ่นงานที่จะอัปเดต: ตั้งค่า, รายการอ้างอิง, ทะเบียนครุภัณฑ์, ประวัติซ่อมบำรุง, ค่าเสื่อมราคา, สรุปงบประมาณ, GFMIS_เอกสาร5',
          ],
          confirmLabel: 'ยืนยันบันทึกขึ้น Google Sheets',
          variant: 'primary' as const,
        };
      case 'pull':
        return {
          title: 'ยืนยันการนำเข้าข้อมูลจาก Google Sheets',
          description: `ระบบจะอ่านข้อมูลจากไฟล์ "${pendingAction.title}" และนำมาแทนที่ข้อมูลทะเบียนครุภัณฑ์และประวัติซ่อมบำรุงในหน้าจอปัจจุบัน`,
          details: [
            'แท็บที่จะนำเข้า: ตั้งค่า, รายการอ้างอิง, ทะเบียนครุภัณฑ์, ประวัติซ่อมบำรุง',
            'ข้อมูลที่แก้ไขไว้ในเบราว์เซอร์และยังไม่ได้ส่งออกจะถูกแทนที่',
          ],
          confirmLabel: 'ยืนยันนำเข้าข้อมูล',
          variant: 'primary' as const,
        };
      case 'lock-and-autosync':
        return {
          title: `ยืนยันล็อคการตั้งค่าและบันทึกอัตโนมัติทุก ${sheetsSyncConfig.intervalSeconds} วินาที`,
          description: `ระบบจะล็อคการตั้งค่าเชื่อมต่อไว้กับไฟล์ "${pendingAction.title}" และเขียนข้อมูลล่าสุดจากหน้าเว็บทับลง Google Sheets ทุก ${sheetsSyncConfig.intervalSeconds} วินาทีโดยอัตโนมัติ`,
          details: [
            `ไฟล์เป้าหมาย: ${pendingAction.title} (${pendingAction.spreadsheetId})`,
            `ข้อมูลที่จะอัปเดต: ครุภัณฑ์ ${assets.length} รายการ และประวัติซ่อมบำรุง ${maintenance.length} รายการ`,
            'แผ่นงานทั้ง 7 แท็บจะถูกเขียนทับด้วยข้อมูลล่าสุดทุก 30 วินาทีตลอดเวลาที่เข้าสู่ระบบอยู่',
            'ระหว่างล็อคการตั้งค่า จะไม่สามารถเปลี่ยนลิงก์ปลายทาง สร้างไฟล์ใหม่ หรือดึงข้อมูลมาทับได้จนกว่าจะปลดล็อค',
          ],
          confirmLabel: `ยืนยันล็อคและบันทึกทุก ${sheetsSyncConfig.intervalSeconds} วินาที`,
          variant: 'primary' as const,
        };
      case 'lock-only':
        return {
          title: 'ยืนยันล็อคการตั้งค่าเชื่อมต่อ Google Sheets',
          description: `ระบบจะล็อคการเชื่อมต่อไว้กับไฟล์ "${pendingAction.title}" เพื่อป้องกันการเปลี่ยนไฟล์ปลายทางหรือดึงข้อมูลมาเขียนทับโดยไม่ตั้งใจ`,
          details: [
            `ไฟล์ที่ล็อค: ${pendingAction.title} (${pendingAction.spreadsheetId})`,
            'คุณสามารถปลดล็อคได้ตลอดเวลาหากต้องการเปลี่ยนไฟล์ Google Sheets',
          ],
          confirmLabel: 'ยืนยันล็อคการตั้งค่า',
          variant: 'primary' as const,
        };
      case 'unlock':
        return {
          title: 'ยืนยันปลดล็อคการตั้งค่าเชื่อมต่อ Google Sheets',
          description: `การปลดล็อคการตั้งค่าของไฟล์ "${pendingAction.title}" จะหยุดการบันทึกอัตโนมัติทุก ${sheetsSyncConfig.intervalSeconds} วินาที และอนุญาตให้แก้ไขการเชื่อมต่อไฟล์ปลายทางได้`,
          details: [
            'ข้อมูลใน Google Sheets และในเบราว์เซอร์จะไม่ถูกลบ',
            'สามารถตั้งค่าใหม่และล็อคกลับได้อีกครั้ง',
          ],
          confirmLabel: 'ยืนยันปลดล็อคการตั้งค่า',
          variant: 'danger' as const,
        };
    }
  })();

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
                  เข้าสู่ระบบ Google เชื่อมต่อไฟล์ ล็อคการตั้งค่า และบันทึกค่าอัตโนมัติทุก {sheetsSyncConfig.intervalSeconds} วินาที
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

          <div className="p-6 overflow-y-auto space-y-5">
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

            {/* Locked & Auto-Sync Alert when logged out */}
            {(needsAuth || !accessToken) && connectedSheet && isLocked && (
              <div className="border border-emerald-200 bg-emerald-50/70 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-950">
                  <Lock className="w-4 h-4 text-emerald-800 shrink-0" />
                  <span>
                    ล็อคการตั้งค่าเชื่อมต่อไว้กับไฟล์: {connectedSheet.title}
                  </span>
                </div>
                <p className="text-xs text-emerald-900">
                  {sheetsSyncConfig.autoSyncEnabled
                    ? `ตั้งค่าบันทึกอัตโนมัติทุก ${sheetsSyncConfig.intervalSeconds} วินาทีไว้แล้ว กรุณากด "Sign in with Google" ด้านบนเพื่อยืนยันสิทธิ์และเริ่มบันทึกข้อมูลในเซสชันนี้`
                    : 'กรุณากด "Sign in with Google" ด้านบนเพื่อเข้าถึงและบันทึกข้อมูลลงไฟล์ที่ล็อคไว้'}
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setPendingAction({
                        type: 'unlock',
                        title: connectedSheet.title,
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>ปลดล็อคการตั้งค่า</span>
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 & 3: Create New or Connect Existing Sheet */}
            {!needsAuth && accessToken && (
              <>
                {isLocked && connectedSheet && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950">
                    <div className="flex items-center gap-2 font-medium">
                      <Lock className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>
                        การตั้งค่าเชื่อมต่อ Google Sheets ถูกล็อคไว้กับ &quot;{connectedSheet.title}&quot;
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingAction({
                          type: 'unlock',
                          title: connectedSheet.title,
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-900 bg-white border border-amber-300 rounded-md hover:bg-amber-100 whitespace-nowrap"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>ปลดล็อค</span>
                    </button>
                  </div>
                )}

                <div
                  className={`border border-slate-200 rounded-lg p-4 space-y-3 ${
                    isLocked ? 'bg-slate-50/70 opacity-75' : ''
                  }`}
                >
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
                      disabled={isLocked}
                      onChange={(e) => setNewSheetTitle(e.target.value)}
                      placeholder="ชื่อไฟล์ Google Sheets"
                      className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500"
                    />
                    <button
                      type="button"
                      disabled={busy || isLocked}
                      onClick={() =>
                        setPendingAction({
                          type: 'create',
                          title: newSheetTitle,
                        })
                      }
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg whitespace-nowrap shrink-0 disabled:opacity-50"
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
                      disabled={isLocked}
                      onChange={(e) => setSheetUrlInput(e.target.value)}
                      placeholder="วางลิงก์ Google Sheets (URL) หรือ Spreadsheet ID"
                      className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num disabled:bg-slate-100 disabled:text-slate-500"
                    />
                    <button
                      type="button"
                      disabled={busy || isLocked || !sheetUrlInput.trim()}
                      onClick={handleInspectSheet}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      <Link2 className="w-4 h-4" />
                      <span>ตรวจสอบไฟล์</span>
                    </button>
                  </div>

                  {connectedSheet && (
                    <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                            {isLocked && (
                              <Lock className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
                            )}
                            <span>ไฟล์ที่เชื่อมต่ออยู่: {connectedSheet.title}</span>
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
                          disabled={busy || isAutoSyncing}
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
                          disabled={busy || isLocked}
                          onClick={() =>
                            setPendingAction({
                              type: 'pull',
                              spreadsheetId: connectedSheet.spreadsheetId,
                              title: connectedSheet.title,
                            })
                          }
                          title={
                            isLocked
                              ? 'ปลดล็อคการตั้งค่าก่อนดึงข้อมูลมาทับในเบราว์เซอร์'
                              : undefined
                          }
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg whitespace-nowrap disabled:opacity-50"
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

                {/* Step 4: Lock Settings & Auto-Sync Every 30 Seconds */}
                <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-800 shrink-0" />
                      <span className="text-xs font-semibold text-slate-900">
                        4. ล็อคการตั้งค่าและบันทึกค่าลง Google Sheets อัตโนมัติทุก{' '}
                        {sheetsSyncConfig.intervalSeconds} วินาที
                      </span>
                    </div>
                    {isAutoSyncActive && (
                      <span className="text-[11px] font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5">
                        เปิดบันทึกทุก {sheetsSyncConfig.intervalSeconds} วินาที
                      </span>
                    )}
                  </div>

                  {!connectedSheet ? (
                    <p className="text-xs text-slate-500">
                      กรุณาสร้างไฟล์ใหม่ในขั้นตอนที่ 2 หรือเชื่อมต่อไฟล์ที่มีอยู่ในขั้นตอนที่ 3 ก่อน จึงจะสามารถล็อคการตั้งค่าและเปิดบันทึกอัตโนมัติทุก {sheetsSyncConfig.intervalSeconds} วินาทีได้
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        เมื่อเปิดใช้งาน ระบบจะล็อคไฟล์เป้าหมายไว้ที่{' '}
                        <strong className="text-slate-900">{connectedSheet.title}</strong>{' '}
                        และส่งออกข้อมูลล่าสุด (ทะเบียนครุภัณฑ์ ค่าเสื่อมราคา ประวัติซ่อมบำรุง ตั้งค่า รายการอ้างอิง และ GFMIS) ขึ้น Google Sheets ให้อัตโนมัติทุก{' '}
                        {sheetsSyncConfig.intervalSeconds} วินาที
                      </p>

                      {(lastSheetsSyncAt || isAutoSyncActive || lastSheetsSyncError) && (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-slate-600">
                              บันทึกล่าสุด:{' '}
                              <strong className="font-mono-num text-slate-900">
                                {lastSheetsSyncAt || 'ยังไม่มีการบันทึกในเซสชันนี้'}
                              </strong>
                            </span>
                            {isAutoSyncActive && (
                              <SyncCountdownLabel
                                nextAutoSyncAt={nextAutoSyncAt}
                                isSyncing={isAutoSyncing}
                              />
                            )}
                          </div>
                          {lastSheetsSyncError && (
                            <div className="text-red-700 font-medium">
                              ข้อผิดพลาดล่าสุด: {lastSheetsSyncError}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {!isAutoSyncActive ? (
                          <button
                            type="button"
                            disabled={busy || !hasSheetsScope}
                            onClick={() =>
                              setPendingAction({
                                type: 'lock-and-autosync',
                                spreadsheetId: connectedSheet.spreadsheetId,
                                title: connectedSheet.title,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg whitespace-nowrap disabled:opacity-50"
                          >
                            {isLocked ? (
                              <Play className="w-3.5 h-3.5" />
                            ) : (
                              <Lock className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {isLocked
                                ? `เริ่มบันทึกอัตโนมัติทุก ${sheetsSyncConfig.intervalSeconds} วินาที`
                                : `ล็อคการตั้งค่าและบันทึกทุก ${sheetsSyncConfig.intervalSeconds} วินาที`}
                            </span>
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busy || isAutoSyncing}
                              onClick={async () => {
                                setStatusMessage(null);
                                try {
                                  await onSyncNow();
                                  setStatusMessage({
                                    type: 'success',
                                    text: `บันทึกล่าสุดลงไฟล์ "${connectedSheet.title}" เรียบร้อยแล้ว`,
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
                                      text:
                                        err?.message ||
                                        'เกิดข้อผิดพลาดในการบันทึกลง Google Sheets',
                                    });
                                  }
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-900 hover:bg-emerald-800 rounded-lg whitespace-nowrap disabled:opacity-60"
                            >
                              <RefreshCw
                                className={`w-3.5 h-3.5 ${
                                  isAutoSyncing ? 'animate-spin' : ''
                                }`}
                              />
                              <span>บันทึกทันที</span>
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={onPauseAutoSync}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                            >
                              <Pause className="w-3.5 h-3.5" />
                              <span>หยุดบันทึกอัตโนมัติ</span>
                            </button>
                          </>
                        )}

                        {!isLocked ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setPendingAction({
                                type: 'lock-only',
                                spreadsheetId: connectedSheet.spreadsheetId,
                                title: connectedSheet.title,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>ล็อคการตั้งค่าเท่านั้น</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setPendingAction({
                                type: 'unlock',
                                title: connectedSheet.title,
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-lg whitespace-nowrap"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            <span>ปลดล็อคการตั้งค่า</span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmModalMeta !== null}
        title={confirmModalMeta?.title || ''}
        description={confirmModalMeta?.description || ''}
        details={confirmModalMeta?.details}
        confirmLabel={confirmModalMeta?.confirmLabel}
        variant={confirmModalMeta?.variant}
        loading={busy}
        onConfirm={executePendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </>
  );
}
