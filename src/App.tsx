import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  BarChart3,
  Bell,
  Calculator,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Lock,
  Menu,
  Package,
  Plus,
  QrCode,
  Settings,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import {
  ActiveTab,
  AgencySettings,
  AssetCategory,
  AssetItem,
  AssetStatus,
  MaintenanceRecord,
  MaintenanceStatus,
  ReferenceConfig,
} from './types/asset';
import {
  DEFAULT_REFERENCE,
  DEFAULT_SETTINGS,
  INITIAL_ASSETS,
  INITIAL_MAINTENANCE,
} from './data/defaultData';
import { computeAssetAlerts } from './utils/depreciation';
import {
  clearCachedToken,
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from './services/googleAuth';
import {
  SheetsApiError,
  SheetsSyncConfig,
  SpreadsheetMetadata,
  syncAllToGoogleSheets,
} from './services/googleSheets';
import { OverviewView } from './components/OverviewView';
import { RegistryView } from './components/RegistryView';
import { MaintenanceView } from './components/MaintenanceView';
import { IndividualCardView } from './components/IndividualCardView';
import { DepreciationView } from './components/DepreciationView';
import { InspectionAndGfmisView } from './components/InspectionAndGfmisView';
import { SurveyReportView } from './components/SurveyReportView';
import { Doc10ReportView } from './components/Doc10ReportView';
import { QrLabelStudioView } from './components/QrLabelStudioView';
import { DisposalView } from './components/DisposalView';
import { BudgetSummaryView } from './components/BudgetSummaryView';
import { SettingsAndReferenceView } from './components/SettingsAndReferenceView';
import { AssetFormModal } from './components/AssetFormModal';
import { MaintenanceFormModal } from './components/MaintenanceFormModal';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';
import { ConfirmModal } from './components/ConfirmModal';

const STORAGE_KEYS = {
  SETTINGS: 'thai_asset_settings_v1',
  REFERENCE: 'thai_asset_reference_v1',
  ASSETS: 'thai_asset_items_v1',
  MAINTENANCE: 'thai_asset_maintenance_v1',
  SHEET_META: 'thai_asset_sheet_meta_v1',
  SHEETS_SYNC_CONFIG: 'thai_asset_sheets_sync_v1',
};

const DEFAULT_SHEETS_SYNC_CONFIG: SheetsSyncConfig = {
  locked: false,
  autoSyncEnabled: false,
  intervalSeconds: 30,
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const NAV_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'ภาพรวมและแจ้งเตือน', icon: LayoutDashboard },
  { id: 'registry', label: 'ทะเบียนครุภัณฑ์', icon: Package },
  { id: 'maintenance', label: 'ซ่อมบำรุงและติดตาม', icon: Wrench },
  { id: 'individual', label: 'ทะเบียนรายตัว', icon: FileText },
  { id: 'depreciation', label: 'ค่าเสื่อมราคา', icon: Calculator },
  { id: 'inspection', label: 'ตรวจสอบพัสดุ & GFMIS', icon: ClipboardCheck },
  { id: 'survey', label: 'แบบสำรวจครุภัณฑ์ประจำปี', icon: ClipboardList },
  { id: 'doc10', label: 'บัญชีรายงานครุภัณฑ์ (เอกสาร 10)', icon: FileCheck2 },
  { id: 'qrlabels', label: 'QR Code ครุภัณฑ์ (50×30 มม.)', icon: QrCode },
  { id: 'disposal', label: 'ชำรุดเสนอจำหน่าย', icon: Trash2 },
  { id: 'budget', label: 'สรุปงบประมาณ & กราฟ', icon: BarChart3 },
  { id: 'settings', label: 'ตั้งค่า & รายการอ้างอิง', icon: Settings },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [settings, setSettings] = useState<AgencySettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...loadFromStorage(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS),
  }));
  const [reference, setReference] = useState<ReferenceConfig>(() =>
    loadFromStorage(STORAGE_KEYS.REFERENCE, DEFAULT_REFERENCE)
  );
  const [assets, setAssets] = useState<AssetItem[]>(() =>
    loadFromStorage(STORAGE_KEYS.ASSETS, INITIAL_ASSETS)
  );
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>(() =>
    loadFromStorage(STORAGE_KEYS.MAINTENANCE, INITIAL_MAINTENANCE)
  );
  const [connectedSheet, setConnectedSheet] =
    useState<SpreadsheetMetadata | null>(() =>
      loadFromStorage(STORAGE_KEYS.SHEET_META, null)
    );
  const [sheetsSyncConfig, setSheetsSyncConfig] = useState<SheetsSyncConfig>(
    () => ({
      ...DEFAULT_SHEETS_SYNC_CONFIG,
      ...loadFromStorage(
        STORAGE_KEYS.SHEETS_SYNC_CONFIG,
        DEFAULT_SHEETS_SYNC_CONFIG
      ),
      intervalSeconds: 30,
    })
  );

  // Selected asset for Individual Card view & QR Code Studio
  const [selectedAssetId, setSelectedAssetId] = useState<string>(
    () => assets[0]?.id || ''
  );
  const [qrTargetAssetId, setQrTargetAssetId] = useState<string | undefined>(
    undefined
  );

  // Support scanning QR code URL (?asset=...) to jump directly to Individual Asset Card
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const assetParam = params.get('asset');
    if (!assetParam) return;
    const match = assets.find(
      (a) => a.assetCode === assetParam || a.id === assetParam
    );
    if (match) {
      setSelectedAssetId(match.id);
      setActiveTab('individual');
    }
  }, [assets]);

  // Modals state
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetItem | null>(null);
  const [maintModalOpen, setMaintModalOpen] = useState(false);
  const [editingMaint, setEditingMaint] = useState<MaintenanceRecord | null>(
    null
  );
  const [preselectedMaintAssetId, setPreselectedMaintAssetId] = useState<
    string | undefined
  >(undefined);
  const [sheetsModalOpen, setSheetsModalOpen] = useState(false);

  // Google Workspace Auth state (strictly in-memory token)
  const [needsAuth, setNeedsAuth] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [hasSheetsScope, setHasSheetsScope] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // In-memory 30-second auto-sync state (must be confirmed in current browser session)
  const [sessionAutoSyncConfirmed, setSessionAutoSyncConfirmed] =
    useState(false);
  const [showResumeAutoSyncConfirm, setShowResumeAutoSyncConfirm] =
    useState(false);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [lastSheetsSyncAt, setLastSheetsSyncAt] = useState<string | null>(null);
  const [lastSheetsSyncError, setLastSheetsSyncError] = useState<string | null>(
    null
  );
  const [nextAutoSyncAt, setNextAutoSyncAt] = useState<number | null>(null);
  const isSyncingRef = useRef(false);

  const latestSyncRef = useRef({
    settings,
    reference,
    assets,
    maintenance,
    connectedSheet,
    accessToken,
    hasSheetsScope,
    sheetsSyncConfig,
  });
  latestSyncRef.current = {
    settings,
    reference,
    assets,
    maintenance,
    connectedSheet,
    accessToken,
    hasSheetsScope,
    sheetsSyncConfig,
  };

  useEffect(() => {
    const unsub = initAuth(
      (authUser, token, scopeGranted) => {
        setUser(authUser);
        setAccessToken(token);
        setHasSheetsScope(scopeGranted);
        setNeedsAuth(false);
      },
      (authUser) => {
        setUser(authUser);
        setAccessToken(null);
        setHasSheetsScope(false);
        setNeedsAuth(true);
        setSessionAutoSyncConfirmed(false);
        setNextAutoSyncAt(null);
      }
    );
    return () => unsub();
  }, []);

  // Persist domain data locally
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.REFERENCE, JSON.stringify(reference));
  }, [reference]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ASSETS, JSON.stringify(assets));
  }, [assets]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MAINTENANCE, JSON.stringify(maintenance));
  }, [maintenance]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.SHEET_META,
      JSON.stringify(connectedSheet)
    );
  }, [connectedSheet]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.SHEETS_SYNC_CONFIG,
      JSON.stringify(sheetsSyncConfig)
    );
  }, [sheetsSyncConfig]);

  const alerts = useMemo(
    () => computeAssetAlerts(assets, maintenance),
    [assets, maintenance]
  );

  const urgentAlertCount = useMemo(
    () => alerts.filter((a) => a.severity === 'critical' || a.severity === 'warning').length,
    [alerts]
  );

  const handleNavigate = (tab: ActiveTab, assetId?: string) => {
    if (assetId) setSelectedAssetId(assetId);
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const handleOpenQrLabel = (assetId: string) => {
    setQrTargetAssetId(assetId);
    setActiveTab('qrlabels');
    setMobileMenuOpen(false);
  };

  const handleSaveAsset = (saved: AssetItem) => {
    setAssets((prev) => {
      const exists = prev.some((a) => a.id === saved.id);
      if (exists) {
        return prev.map((a) => (a.id === saved.id ? saved : a));
      }
      return [saved, ...prev];
    });
    setAssetModalOpen(false);
    setEditingAsset(null);
  };

  const handleSaveMaintenance = (
    record: MaintenanceRecord,
    updateAssetStatus?: AssetStatus,
    nextMaintenanceDate?: string
  ) => {
    setMaintenance((prev) => {
      const exists = prev.some((m) => m.id === record.id);
      if (exists) {
        return prev.map((m) => (m.id === record.id ? record : m));
      }
      return [record, ...prev];
    });

    if (updateAssetStatus || nextMaintenanceDate) {
      setAssets((prev) =>
        prev.map((a) => {
          if (a.id !== record.assetId) return a;
          return {
            ...a,
            status: updateAssetStatus ?? a.status,
            nextMaintenanceDate: nextMaintenanceDate ?? a.nextMaintenanceDate,
          };
        })
      );
    }

    setMaintModalOpen(false);
    setEditingMaint(null);
    setPreselectedMaintAssetId(undefined);
  };

  const handleQuickMaintStatus = (
    recordId: string,
    newStatus: MaintenanceStatus
  ) => {
    const target = maintenance.find((m) => m.id === recordId);
    setMaintenance((prev) =>
      prev.map((m) => (m.id === recordId ? { ...m, status: newStatus } : m))
    );
    if (target && newStatus === 'เสร็จสิ้น') {
      setAssets((prev) =>
        prev.map((a) =>
          a.id === target.assetId
            ? {
                ...a,
                status: 'ใช้งานปกติ',
                nextMaintenanceDate:
                  target.nextDueDate || a.nextMaintenanceDate,
              }
            : a
        )
      );
    }
  };

  const handleDisposeAsset = (
    assetId: string,
    disposalDate: string,
    disposalReason: string
  ) => {
    setAssets((prev) =>
      prev.map((a) =>
        a.id === assetId
          ? {
              ...a,
              status: 'จำหน่ายแล้ว',
              disposalDate,
              disposalReason,
            }
          : a
      )
    );
  };

  const executeSheetsSyncNow = useCallback(async () => {
    const current = latestSyncRef.current;
    if (
      !current.accessToken ||
      !current.hasSheetsScope ||
      !current.connectedSheet ||
      isSyncingRef.current
    ) {
      return;
    }

    isSyncingRef.current = true;
    setIsAutoSyncing(true);
    setLastSheetsSyncError(null);
    try {
      const updated = await syncAllToGoogleSheets(
        current.accessToken,
        current.connectedSheet.spreadsheetId,
        {
          settings: current.settings,
          reference: current.reference,
          assets: current.assets,
          maintenance: current.maintenance,
        },
        { knownMetadata: current.connectedSheet }
      );
      setConnectedSheet(updated);
      const nowLabel =
        new Date().toLocaleTimeString('th-TH', { hour12: false }) + ' น.';
      setLastSheetsSyncAt(nowLabel);
      setNextAutoSyncAt(
        Date.now() + current.sheetsSyncConfig.intervalSeconds * 1000
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'ไม่สามารถบันทึกลง Google Sheets ได้';
      const lower = msg.toLowerCase();
      if (err instanceof SheetsApiError && err.status === 401) {
        clearCachedToken();
        setAccessToken(null);
        setHasSheetsScope(false);
        setNeedsAuth(true);
        setSessionAutoSyncConfirmed(false);
        setNextAutoSyncAt(null);
        setLastSheetsSyncError(
          'สิทธิ์การเข้าใช้งาน Google หมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้งเพื่อบันทึกต่อ'
        );
      } else if (
        lower.includes('insufficient authentication scopes') ||
        lower.includes('insufficient permission') ||
        msg.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')
      ) {
        setHasSheetsScope(false);
        setSessionAutoSyncConfirmed(false);
        setNextAutoSyncAt(null);
        setLastSheetsSyncError(
          'บัญชี Google ยังไม่ได้อนุญาตสิทธิ์แก้ไข Google Sheets'
        );
      } else {
        setLastSheetsSyncError(msg);
      }
      throw err;
    } finally {
      isSyncingRef.current = false;
      setIsAutoSyncing(false);
    }
  }, []);

  // Periodic auto-save to Google Sheets every 30 seconds once locked & confirmed
  useEffect(() => {
    const canRunAutoSync =
      sheetsSyncConfig.autoSyncEnabled &&
      sessionAutoSyncConfirmed &&
      !needsAuth &&
      Boolean(accessToken) &&
      hasSheetsScope &&
      Boolean(connectedSheet);

    if (!canRunAutoSync) {
      setNextAutoSyncAt(null);
      return;
    }

    const intervalMs = sheetsSyncConfig.intervalSeconds * 1000;
    setNextAutoSyncAt(Date.now() + intervalMs);

    const timer = window.setInterval(() => {
      void executeSheetsSyncNow().catch(() => {
        // Error state already captured in lastSheetsSyncError
      });
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    sheetsSyncConfig.autoSyncEnabled,
    sheetsSyncConfig.intervalSeconds,
    sessionAutoSyncConfirmed,
    needsAuth,
    accessToken,
    hasSheetsScope,
    connectedSheet?.spreadsheetId,
    executeSheetsSyncNow,
  ]);

  const handleLockAndStartAutoSync = async () => {
    if (!connectedSheet) return;
    setSheetsSyncConfig((prev) => ({
      ...prev,
      locked: true,
      autoSyncEnabled: true,
    }));
    setSessionAutoSyncConfirmed(true);
    await executeSheetsSyncNow();
  };

  const handleLockOnly = () => {
    setSheetsSyncConfig((prev) => ({
      ...prev,
      locked: true,
    }));
  };

  const handleUnlockSheetsConfig = () => {
    setSheetsSyncConfig((prev) => ({
      ...prev,
      locked: false,
      autoSyncEnabled: false,
    }));
    setSessionAutoSyncConfirmed(false);
    setNextAutoSyncAt(null);
  };

  const handlePauseAutoSync = () => {
    setSheetsSyncConfig((prev) => ({
      ...prev,
      autoSyncEnabled: false,
    }));
    setSessionAutoSyncConfirmed(false);
    setNextAutoSyncAt(null);
  };

  const handleGoogleSignIn = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      setUser(result.user);
      setAccessToken(result.accessToken);
      setHasSheetsScope(result.hasSheetsScope);
      setNeedsAuth(false);
      setLastSheetsSyncError(null);
      if (
        sheetsSyncConfig.autoSyncEnabled &&
        connectedSheet &&
        result.hasSheetsScope &&
        !sessionAutoSyncConfirmed
      ) {
        setShowResumeAutoSyncConfirm(true);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
    setHasSheetsScope(false);
    setNeedsAuth(true);
    setSessionAutoSyncConfirmed(false);
    setShowResumeAutoSyncConfirm(false);
    setNextAutoSyncAt(null);
  };

  const handleApplyPulledData = (pulled: {
    settings?: AgencySettings;
    categories?: AssetCategory[];
    locations?: string[];
    assets?: AssetItem[];
    maintenance?: MaintenanceRecord[];
  }) => {
    if (pulled.settings) setSettings(pulled.settings);
    if (pulled.categories || pulled.locations) {
      setReference((prev) => ({
        ...prev,
        categories: pulled.categories ?? prev.categories,
        locations: pulled.locations ?? prev.locations,
      }));
    }
    if (pulled.assets) {
      setAssets(pulled.assets);
      if (pulled.assets[0]) setSelectedAssetId(pulled.assets[0].id);
    }
    if (pulled.maintenance) setMaintenance(pulled.maintenance);
  };

  const handleRestoreBackup = (data: {
    settings: AgencySettings;
    reference: ReferenceConfig;
    assets: AssetItem[];
    maintenance: MaintenanceRecord[];
  }) => {
    setSettings(data.settings);
    setReference(data.reference);
    setAssets(data.assets);
    setMaintenance(data.maintenance);
    if (data.assets[0]) {
      setSelectedAssetId(data.assets[0].id);
    }
  };

  const handleResetDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
    setReference(DEFAULT_REFERENCE);
    setAssets(INITIAL_ASSETS);
    setMaintenance(INITIAL_MAINTENANCE);
    setSelectedAssetId(INITIAL_ASSETS[0]?.id || '');
  };

  const activeNavTitle =
    NAV_ITEMS.find((n) => n.id === activeTab)?.label || 'ภาพรวม';

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar (256px) */}
      <aside className="no-print hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="h-14 px-5 flex items-center border-b border-slate-200">
          <button
            type="button"
            onClick={() => handleNavigate('overview')}
            className="text-left font-display font-bold text-sm text-emerald-950 tracking-tight whitespace-nowrap truncate"
          >
            ทะเบียนครุภัณฑ์ออนไลน์
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-950 text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.id === 'overview' && urgentAlertCount > 0 && (
                  <span
                    className={`font-mono-num text-[11px] font-semibold ${
                      isActive ? 'text-amber-300' : 'text-red-700'
                    }`}
                  >
                    {urgentAlertCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Google Sheets Sync Footer Card */}
        <div className="p-3 border-t border-slate-200 space-y-2">
          <div className="text-[11px] text-slate-500 px-1 truncate">
            {settings.agencyName}
          </div>
          <button
            type="button"
            onClick={() => setSheetsModalOpen(true)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
          >
            <span className="flex items-center gap-2 min-w-0">
              <FileSpreadsheet className="w-4 h-4 text-emerald-800 shrink-0" />
              <span className="truncate">
                {!needsAuth && getAccessToken()
                  ? connectedSheet?.title || 'Google Sheets พร้อมใช้งาน'
                  : connectedSheet && sheetsSyncConfig.locked
                  ? `${connectedSheet.title} (รอเข้าสู่ระบบ)`
                  : 'เชื่อมต่อ Google Sheets'}
              </span>
            </span>
            {sheetsSyncConfig.locked && (
              <Lock className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-xs bg-white h-full flex flex-col border-r border-slate-200 z-50">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200">
              <span className="font-display font-bold text-sm text-emerald-950">
                ทะเบียนครุภัณฑ์ออนไลน์
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigate(item.id)}
                    className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium ${
                      isActive
                        ? 'bg-emerald-950 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb on left, concise action buttons on right */}
        <header className="no-print sticky top-0 z-20 h-14 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-md"
              aria-label="เปิดเมนู"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0 truncate">
              <span className="hidden sm:inline truncate">
                {settings.agencyName}
              </span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <span className="font-mono-num whitespace-nowrap">
                ปีงบประมาณ {settings.fiscalYear}
              </span>
              <span className="text-slate-300">/</span>
              <span className="font-semibold text-slate-900 truncate">
                {activeNavTitle}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {urgentAlertCount > 0 && (
              <button
                type="button"
                onClick={() => handleNavigate('overview')}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 whitespace-nowrap shrink-0"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>แจ้งเตือน {urgentAlertCount} รายการ</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSheetsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-800" />
              {sheetsSyncConfig.locked && (
                <Lock className="w-3 h-3 text-emerald-800" />
              )}
              <span className="hidden md:inline">
                {!needsAuth && accessToken
                  ? sheetsSyncConfig.autoSyncEnabled && sessionAutoSyncConfirmed
                    ? `Sheets (ทุก ${sheetsSyncConfig.intervalSeconds} วิ)`
                    : 'Google Sheets'
                  : 'เชื่อมต่อ Google Sheets'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingAsset(null);
                setAssetModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ลงทะเบียนครุภัณฑ์</span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto">
          {activeTab === 'overview' && (
            <OverviewView
              settings={settings}
              reference={reference}
              assets={assets}
              maintenance={maintenance}
              alerts={alerts}
              onNavigate={handleNavigate}
              onOpenAssetModal={() => {
                setEditingAsset(null);
                setAssetModalOpen(true);
              }}
              onOpenMaintenanceModal={(assetId) => {
                setEditingMaint(null);
                setPreselectedMaintAssetId(assetId);
                setMaintModalOpen(true);
              }}
            />
          )}

          {activeTab === 'registry' && (
            <RegistryView
              settings={settings}
              reference={reference}
              assets={assets}
              onAddAsset={() => {
                setEditingAsset(null);
                setAssetModalOpen(true);
              }}
              onEditAsset={(asset) => {
                setEditingAsset(asset);
                setAssetModalOpen(true);
              }}
              onViewIndividual={(id) => handleNavigate('individual', id)}
              onLogMaintenance={(id) => {
                setEditingMaint(null);
                setPreselectedMaintAssetId(id);
                setMaintModalOpen(true);
              }}
              onOpenQrLabel={handleOpenQrLabel}
            />
          )}

          {activeTab === 'maintenance' && (
            <MaintenanceView
              settings={settings}
              assets={assets}
              maintenance={maintenance}
              onAddMaintenance={(assetId) => {
                setEditingMaint(null);
                setPreselectedMaintAssetId(assetId);
                setMaintModalOpen(true);
              }}
              onEditMaintenance={(rec) => {
                setEditingMaint(rec);
                setMaintModalOpen(true);
              }}
              onQuickStatusChange={handleQuickMaintStatus}
            />
          )}

          {activeTab === 'individual' && (
            <IndividualCardView
              settings={settings}
              reference={reference}
              assets={assets}
              maintenance={maintenance}
              selectedAssetId={selectedAssetId}
              onSelectAsset={setSelectedAssetId}
              onLogMaintenance={(assetId) => {
                setEditingMaint(null);
                setPreselectedMaintAssetId(assetId);
                setMaintModalOpen(true);
              }}
              onOpenQrLabel={handleOpenQrLabel}
            />
          )}

          {activeTab === 'depreciation' && (
            <DepreciationView
              settings={settings}
              reference={reference}
              assets={assets}
            />
          )}

          {activeTab === 'inspection' && (
            <InspectionAndGfmisView
              settings={settings}
              reference={reference}
              assets={assets}
            />
          )}

          {activeTab === 'survey' && (
            <SurveyReportView
              settings={settings}
              reference={reference}
              assets={assets}
            />
          )}

          {activeTab === 'doc10' && (
            <Doc10ReportView
              settings={settings}
              reference={reference}
              assets={assets}
            />
          )}

          {activeTab === 'qrlabels' && (
            <QrLabelStudioView
              settings={settings}
              reference={reference}
              assets={assets}
              initialAssetId={qrTargetAssetId}
            />
          )}

          {activeTab === 'disposal' && (
            <DisposalView
              settings={settings}
              reference={reference}
              assets={assets}
              onDisposeAsset={handleDisposeAsset}
            />
          )}

          {activeTab === 'budget' && (
            <BudgetSummaryView
              settings={settings}
              reference={reference}
              assets={assets}
              maintenance={maintenance}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsAndReferenceView
              settings={settings}
              reference={reference}
              assets={assets}
              maintenance={maintenance}
              onSaveSettings={setSettings}
              onSaveReference={setReference}
              onRestoreBackup={handleRestoreBackup}
              onResetToDefaults={handleResetDefaults}
              googleUser={user}
              needsAuth={needsAuth}
              hasSheetsScope={hasSheetsScope}
              isLoggingIn={isLoggingIn}
              onGoogleSignIn={handleGoogleSignIn}
              onOpenSheetsModal={() => setSheetsModalOpen(true)}
              connectedSheet={connectedSheet}
              sheetsSyncConfig={sheetsSyncConfig}
              sessionAutoSyncConfirmed={sessionAutoSyncConfirmed}
              isAutoSyncing={isAutoSyncing}
              lastSheetsSyncAt={lastSheetsSyncAt}
              lastSheetsSyncError={lastSheetsSyncError}
              onSyncNow={async () => {
                if (sessionAutoSyncConfirmed) {
                  try {
                    await executeSheetsSyncNow();
                  } catch {
                    // error already captured in lastSheetsSyncError
                  }
                } else {
                  setSheetsModalOpen(true);
                }
              }}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <AssetFormModal
        open={assetModalOpen}
        initialAsset={editingAsset}
        reference={reference}
        settings={settings}
        onSave={handleSaveAsset}
        onClose={() => {
          setAssetModalOpen(false);
          setEditingAsset(null);
        }}
      />

      <MaintenanceFormModal
        open={maintModalOpen}
        assets={assets}
        preselectedAssetId={preselectedMaintAssetId}
        initialRecord={editingMaint}
        reference={reference}
        onSave={handleSaveMaintenance}
        onClose={() => {
          setMaintModalOpen(false);
          setEditingMaint(null);
          setPreselectedMaintAssetId(undefined);
        }}
      />

      <GoogleSheetsModal
        open={sheetsModalOpen}
        onClose={() => setSheetsModalOpen(false)}
        needsAuth={needsAuth}
        user={user}
        accessToken={accessToken}
        hasSheetsScope={hasSheetsScope}
        onMarkMissingScope={() => setHasSheetsScope(false)}
        isLoggingIn={isLoggingIn}
        onSignIn={handleGoogleSignIn}
        onSignOut={handleGoogleSignOut}
        connectedSheet={connectedSheet}
        onSetConnectedSheet={setConnectedSheet}
        sheetsSyncConfig={sheetsSyncConfig}
        sessionAutoSyncConfirmed={sessionAutoSyncConfirmed}
        isAutoSyncing={isAutoSyncing}
        lastSheetsSyncAt={lastSheetsSyncAt}
        lastSheetsSyncError={lastSheetsSyncError}
        nextAutoSyncAt={nextAutoSyncAt}
        onLockAndStartAutoSync={handleLockAndStartAutoSync}
        onLockOnly={handleLockOnly}
        onUnlockSheetsConfig={handleUnlockSheetsConfig}
        onPauseAutoSync={handlePauseAutoSync}
        onSyncNow={executeSheetsSyncNow}
        settings={settings}
        reference={reference}
        assets={assets}
        maintenance={maintenance}
        onApplyPulledData={handleApplyPulledData}
      />

      <ConfirmModal
        open={showResumeAutoSyncConfirm && connectedSheet !== null}
        title={`ยืนยันการบันทึกข้อมูลลง Google Sheets ทุก ${sheetsSyncConfig.intervalSeconds} วินาที`}
        description={`ตรวจพบการตั้งค่าล็อคไฟล์ "${connectedSheet?.title || ''}" และเปิดบันทึกอัตโนมัติไว้ ต้องการเริ่มเขียนข้อมูลล่าสุดลง Google Sheets ทุก ${sheetsSyncConfig.intervalSeconds} วินาทีในเซสชันนี้ต่อหรือไม่`}
        details={[
          `ไฟล์เป้าหมาย: ${connectedSheet?.title || ''} (${connectedSheet?.spreadsheetId || ''})`,
          `จำนวนข้อมูลปัจจุบัน: ครุภัณฑ์ ${assets.length} รายการ และประวัติซ่อม ${maintenance.length} รายการ`,
          'การยืนยันจะอัปเดตข้อมูลทั้ง 7 แท็บใน Google Sheets ทันทีและทำซ้ำทุก 30 วินาที',
        ]}
        confirmLabel={`ยืนยันบันทึกทุก ${sheetsSyncConfig.intervalSeconds} วินาที`}
        cancelLabel="ยังไม่บันทึกอัตโนมัติ"
        loading={isAutoSyncing}
        onConfirm={async () => {
          setShowResumeAutoSyncConfirm(false);
          setSessionAutoSyncConfirmed(true);
          try {
            await executeSheetsSyncNow();
          } catch {
            // error already stored in lastSheetsSyncError
          }
        }}
        onCancel={() => {
          setShowResumeAutoSyncConfirm(false);
          setSessionAutoSyncConfirmed(false);
        }}
      />
    </div>
  );
}
