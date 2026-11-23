import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileSpreadsheet,
  Lock,
  RefreshCw,
} from 'lucide-react';
import {
  SheetsSyncConfig,
  SpreadsheetMetadata,
} from '../services/googleSheets';

interface SheetsStatusBarProps {
  needsAuth: boolean;
  accessToken: string | null;
  hasSheetsScope: boolean;
  userEmail?: string | null;
  connectedSheet: SpreadsheetMetadata | null;
  sheetsSyncConfig: SheetsSyncConfig;
  sessionAutoSyncConfirmed: boolean;
  isSyncing: boolean;
  lastSheetsSyncAt: string | null;
  lastSheetsSyncError: string | null;
  nextAutoSyncAt: number | null;
  isLoggingIn: boolean;
  onSignIn: () => Promise<void>;
  onOpenModal: () => void;
  onSyncNow: () => void;
}

export function SheetsStatusBar({
  needsAuth,
  accessToken,
  hasSheetsScope,
  userEmail,
  connectedSheet,
  sheetsSyncConfig,
  sessionAutoSyncConfirmed,
  isSyncing,
  lastSheetsSyncAt,
  lastSheetsSyncError,
  nextAutoSyncAt,
  isLoggingIn,
  onSignIn,
  onOpenModal,
  onSyncNow,
}: SheetsStatusBarProps) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!nextAutoSyncAt) {
      setSecondsLeft(null);
      return;
    }
    const update = () => {
      setSecondsLeft(Math.max(0, Math.ceil((nextAutoSyncAt - Date.now()) / 1000)));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [nextAutoSyncAt]);

  const isAuthenticated = !needsAuth && Boolean(accessToken);
  const isMissingScope = isAuthenticated && !hasSheetsScope;
  const hasError = Boolean(lastSheetsSyncError) || isMissingScope;
  const isAutoSyncActive =
    sheetsSyncConfig.autoSyncEnabled &&
    sessionAutoSyncConfirmed &&
    isAuthenticated &&
    hasSheetsScope &&
    Boolean(connectedSheet);
  const isSyncedSuccess =
    !hasError &&
    isAuthenticated &&
    hasSheetsScope &&
    Boolean(connectedSheet) &&
    Boolean(lastSheetsSyncAt);
  const isConnectedReady =
    !hasError && isAuthenticated && hasSheetsScope && Boolean(connectedSheet);

  // Determine bar theme according to status:
  // - Red: sync error or missing permission scope
  // - Green: connected & synced successfully (or actively syncing)
  // - Amber: waiting for Google Sign-In on a previously connected/locked sheet
  // - Slate: disconnected / local-only mode
  let containerClass = 'bg-slate-100 border-slate-200 text-slate-700';
  let statusDotClass = 'bg-slate-400';

  if (hasError) {
    containerClass = 'bg-red-50 border-red-300 text-red-950';
    statusDotClass = 'bg-red-600';
  } else if (isSyncing || isSyncedSuccess) {
    containerClass = 'bg-emerald-50 border-emerald-300 text-emerald-950';
    statusDotClass = 'bg-emerald-600';
  } else if (isConnectedReady) {
    containerClass = 'bg-emerald-50/60 border-emerald-200 text-emerald-950';
    statusDotClass = 'bg-emerald-500';
  } else if (connectedSheet) {
    containerClass = 'bg-amber-50 border-amber-200 text-amber-950';
    statusDotClass = 'bg-amber-500';
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`no-print sticky top-14 z-10 border-b px-4 lg:px-6 py-2 text-xs transition-colors ${containerClass}`}
    >
      <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        {/* Left: Connection Status & Target Sheet */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {hasError ? (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          ) : isSyncing ? (
            <RefreshCw className="w-4 h-4 text-emerald-700 animate-spin shrink-0" />
          ) : isSyncedSuccess ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          ) : (
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass}`}
              aria-hidden="true"
            />
          )}

          <span className="font-semibold whitespace-nowrap">
            {hasError
              ? 'ซิงค์ Google Sheets ผิดพลาด'
              : isSyncing
              ? 'กำลังซิงค์ข้อมูลลง Google Sheets...'
              : isSyncedSuccess
              ? 'ซิงค์ Google Sheets สำเร็จ'
              : isConnectedReady
              ? 'เชื่อมต่อ Google Sheets พร้อมใช้งาน'
              : isAuthenticated
              ? 'เข้าสู่ระบบ Google แล้ว (ยังไม่ได้เลือกไฟล์ Sheets)'
              : connectedSheet
              ? 'รอเข้าสู่ระบบ Google เพื่อซิงค์ข้อมูล'
              : 'ยังไม่ได้เชื่อมต่อ Google Sheets'}
          </span>

          {connectedSheet && (
            <>
              <span className="opacity-40">·</span>
              <span className="inline-flex items-center gap-1 min-w-0 max-w-[260px] sm:max-w-sm">
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 opacity-80" />
                {sheetsSyncConfig.locked && (
                  <Lock
                    className="w-3 h-3 shrink-0 opacity-90"
                    aria-label="ล็อคการตั้งค่าแล้ว"
                  />
                )}
                <a
                  href={connectedSheet.spreadsheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium truncate hover:underline"
                  title={connectedSheet.title}
                >
                  {connectedSheet.title}
                </a>
                <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
              </span>
            </>
          )}

          {hasError && (
            <>
              <span className="opacity-40">·</span>
              <span className="text-red-800 font-medium truncate max-w-md">
                {lastSheetsSyncError ||
                  'บัญชี Google ยังไม่ได้อนุญาตสิทธิ์แก้ไข Google Sheets'}
              </span>
            </>
          )}
        </div>

        {/* Right: Last Sync Time, Countdown & Quick Action */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <Clock className="w-3.5 h-3.5 opacity-75 shrink-0" />
            <span>ซิงค์ล่าสุด:</span>
            <strong className="font-mono-num">
              {lastSheetsSyncAt || 'ยังไม่มีการซิงค์ในเซสชันนี้'}
            </strong>
          </div>

          {isAutoSyncActive && secondsLeft !== null && !hasError && (
            <span className="hidden sm:inline-flex items-center gap-1 font-mono-num text-[11px] opacity-85 whitespace-nowrap">
              (อัตโนมัติใน {secondsLeft} วิ)
            </span>
          )}

          {isAuthenticated && userEmail && !hasError && (
            <span className="hidden xl:inline text-[11px] opacity-75 truncate max-w-[180px]">
              {userEmail}
            </span>
          )}

          <div className="flex items-center gap-1.5">
            {needsAuth || !accessToken ? (
              <button
                type="button"
                disabled={isLoggingIn}
                onClick={() => void onSignIn()}
                className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-slate-300 text-slate-800 rounded-md hover:bg-slate-50 whitespace-nowrap disabled:opacity-60"
              >
                {isLoggingIn ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ Google'}
              </button>
            ) : hasError ? (
              <button
                type="button"
                onClick={onOpenModal}
                className="px-2.5 py-1 text-[11px] font-semibold bg-red-700 text-white rounded-md hover:bg-red-800 whitespace-nowrap"
              >
                ตรวจสอบข้อผิดพลาด
              </button>
            ) : connectedSheet ? (
              <button
                type="button"
                disabled={isSyncing}
                onClick={onSyncNow}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-emerald-900 text-white rounded-md hover:bg-emerald-800 whitespace-nowrap disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`}
                />
                <span>ซิงค์ทันที</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={onOpenModal}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md border whitespace-nowrap ${
                hasError
                  ? 'bg-white border-red-300 text-red-900 hover:bg-red-100'
                  : 'bg-white/90 border-slate-300 text-slate-700 hover:bg-white'
              }`}
            >
              ตั้งค่า Sheets
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
