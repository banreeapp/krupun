import { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AgencySettings,
  AssetItem,
  MaintenanceRecord,
  ReferenceConfig,
} from '../types/asset';
import {
  formatInt,
  formatThaiDateLong,
  getFiscalYearWindow,
} from '../utils/depreciation';
import {
  BackupValidationSuccess,
  exportSystemBackupJson,
  parseAndValidateBackupJson,
} from '../utils/backupRestore';
import {
  SheetsSyncConfig,
  SpreadsheetMetadata,
} from '../services/googleSheets';
import { ConfirmModal } from './ConfirmModal';

interface SettingsAndReferenceViewProps {
  settings: AgencySettings;
  reference: ReferenceConfig;
  assets: AssetItem[];
  maintenance: MaintenanceRecord[];
  onSaveSettings: (next: AgencySettings) => void;
  onSaveReference: (next: ReferenceConfig) => void;
  onRestoreBackup: (data: {
    settings: AgencySettings;
    reference: ReferenceConfig;
    assets: AssetItem[];
    maintenance: MaintenanceRecord[];
  }) => void;
  onResetToDefaults: () => void;
  googleUser: User | null;
  needsAuth: boolean;
  hasSheetsScope: boolean;
  isLoggingIn: boolean;
  onGoogleSignIn: () => Promise<void>;
  onOpenSheetsModal: () => void;
  connectedSheet: SpreadsheetMetadata | null;
  sheetsSyncConfig: SheetsSyncConfig;
  sessionAutoSyncConfirmed: boolean;
  isAutoSyncing: boolean;
  lastSheetsSyncAt: string | null;
  lastSheetsSyncError: string | null;
  onSyncNow: () => Promise<void>;
}

export function SettingsAndReferenceView({
  settings,
  reference,
  assets,
  maintenance,
  onSaveSettings,
  onSaveReference,
  onRestoreBackup,
  onResetToDefaults,
  googleUser,
  needsAuth,
  hasSheetsScope,
  isLoggingIn,
  onGoogleSignIn,
  onOpenSheetsModal,
  connectedSheet,
  sheetsSyncConfig,
  sessionAutoSyncConfirmed,
  isAutoSyncing,
  lastSheetsSyncAt,
  lastSheetsSyncError,
  onSyncNow,
}: SettingsAndReferenceViewProps) {
  const [form, setForm] = useState<AgencySettings>(settings);
  const [refForm, setRefForm] = useState<ReferenceConfig>(reference);
  const [newLocation, setNewLocation] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // JSON Backup & Restore state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [backupError, setBackupError] = useState('');
  const [pendingRestore, setPendingRestore] =
    useState<BackupValidationSuccess | null>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    setRefForm(reference);
  }, [reference]);

  const fyWindow = getFiscalYearWindow(form.fiscalYear);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(form);
    onSaveReference(refForm);
    setSavedNotice(
      'บันทึกการตั้งค่าและรายการอ้างอิงเรียบร้อยแล้ว ค่าเสื่อมราคาและรายงานทั้งหมดถูกคำนวณใหม่ทันที'
    );
    setTimeout(() => setSavedNotice(''), 3500);
  };

  const handleExportBackup = () => {
    setBackupError('');
    exportSystemBackupJson({
      settings: form,
      reference: refForm,
      assets,
      maintenance,
    });
    setSavedNotice(
      `ดาวน์โหลดไฟล์สำรองข้อมูล (.json) เรียบร้อยแล้ว (ครุภัณฑ์ ${formatInt(
        assets.length
      )} รายการ, ประวัติซ่อม ${formatInt(maintenance.length)} รายการ)`
    );
    setTimeout(() => setSavedNotice(''), 4000);
  };

  const handleSelectBackupFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setBackupError('');
    if (file.size > 20 * 1024 * 1024) {
      setBackupError('ไฟล์มีขนาดใหญ่เกิน 20 MB กรุณาตรวจสอบไฟล์สำรองข้อมูล');
      return;
    }

    try {
      const text = await file.text();
      const validated = parseAndValidateBackupJson(text, form, refForm);
      if (!validated.ok) {
        setBackupError(validated.error);
        return;
      }
      setPendingRestore(validated);
    } catch {
      setBackupError('ไม่สามารถอ่านไฟล์ที่เลือกได้ กรุณาลองใหม่อีกครั้ง');
    }
  };

  const handleAddLocation = () => {
    const trimmed = newLocation.trim();
    if (!trimmed || refForm.locations.includes(trimmed)) return;
    setRefForm((prev) => ({
      ...prev,
      locations: [...prev.locations, trimmed],
    }));
    setNewLocation('');
  };

  const handleRemoveLocation = (loc: string) => {
    setRefForm((prev) => ({
      ...prev,
      locations: prev.locations.filter((l) => l !== loc),
    }));
  };

  const handleLifeChange = (apcCode: string, life: number) => {
    setRefForm((prev) => ({
      ...prev,
      categories: prev.categories.map((c) =>
        c.apcCode === apcCode ? { ...c, defaultUsefulLife: Math.max(0, life) } : c
      ),
    }));
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            ตั้งค่าหน่วยงาน ปีงบประมาณ และรายการอ้างอิง
          </h1>
          <p className="text-xs text-slate-500">
            เปลี่ยนปีงบประมาณเพื่อคำนวณค่าเสื่อมราคาต่อเนื่องทุกปี พร้อมกำหนดผู้ลงนามและอายุการใช้งานตามประเภท
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>คืนค่าเริ่มต้น</span>
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            <span>บันทึกการตั้งค่า</span>
          </button>
        </div>
      </div>

      {savedNotice && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium rounded-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* Section 1: Agency & Fiscal Year Settings */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-2.5">
          1. ข้อมูลหน่วยงาน ปีงบประมาณ และวงเงินงบประมาณ
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              ชื่อหน่วยงาน
            </label>
            <input
              type="text"
              value={form.agencyName}
              onChange={(e) => setForm({ ...form, agencyName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              รหัสหน่วยงาน (New GFMIS Thai)
            </label>
            <input
              type="text"
              value={form.agencyCode}
              onChange={(e) => setForm({ ...form, agencyCode: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              ส่วนราชการ / กรม
            </label>
            <input
              type="text"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              ปีงบประมาณที่รายงาน (พ.ศ.)
            </label>
            <input
              type="number"
              min={2550}
              max={2650}
              value={form.fiscalYear}
              onChange={(e) =>
                setForm({ ...form, fiscalYear: Number(e.target.value) || 2569 })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num font-semibold"
            />
            <span className="text-[11px] text-slate-500 mt-1 block">
              รอบบัญชี: {fyWindow.labelShort}
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              ราคาขั้นต่ำที่คิดค่าเสื่อม (บาท)
            </label>
            <input
              type="number"
              min={0}
              value={form.minDepreciationCost}
              onChange={(e) =>
                setForm({
                  ...form,
                  minDepreciationCost: Number(e.target.value) || 0,
                })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num text-right"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              งบลงทุนจัดซื้อครุภัณฑ์ประจำปี (บาท)
            </label>
            <input
              type="number"
              min={0}
              value={form.annualCapitalBudget}
              onChange={(e) =>
                setForm({
                  ...form,
                  annualCapitalBudget: Number(e.target.value) || 0,
                })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num text-right"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              งบซ่อมบำรุงรักษาประจำปี (บาท)
            </label>
            <input
              type="number"
              min={0}
              value={form.annualMaintenanceBudget}
              onChange={(e) =>
                setForm({
                  ...form,
                  annualMaintenanceBudget: Number(e.target.value) || 0,
                })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num text-right"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              คำสั่งแต่งตั้งคณะกรรมการตรวจสอบพัสดุประจำปี
            </label>
            <input
              type="text"
              value={form.committeeOrderNo}
              onChange={(e) =>
                setForm({ ...form, committeeOrderNo: e.target.value })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              วันที่รายงานผลการตรวจสอบพัสดุ
            </label>
            <input
              type="date"
              value={form.inspectionDate}
              onChange={(e) =>
                setForm({ ...form, inspectionDate: e.target.value })
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        {/* Section: Report Signatories (6 roles matching official workbook) */}
        <div className="pt-4 border-t border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              ผู้ลงนามในรายงาน
            </h3>
            {(() => {
              const prepName = form.preparer.name.trim();
              const conflict =
                prepName &&
                [
                  form.committeeChair?.name,
                  form.committeeMember2?.name,
                  form.committeeMember3?.name,
                ].some((n) => n?.trim() === prepName);
              if (!conflict) return null;
              return (
                <span className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1">
                  ข้อสังเกต ข้อ 213: มีชื่อกรรมการตรวจสอบพัสดุตรงกับเจ้าหน้าที่พัสดุ ({prepName})
                </span>
              );
            })()}
          </div>

          <div className="overflow-x-auto border border-slate-300 rounded-lg">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-emerald-900 text-white">
                  <th className="py-2.5 px-4 font-semibold border-r border-emerald-800 w-1/3">
                    หน้าที่
                  </th>
                  <th className="py-2.5 px-4 font-semibold border-r border-emerald-800 w-1/3">
                    ชื่อ - นามสกุล
                  </th>
                  <th className="py-2.5 px-4 font-semibold w-1/3">ตำแหน่ง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(
                  [
                    {
                      key: 'preparer',
                      role: 'เจ้าหน้าที่พัสดุ (ผู้จัดทำทะเบียน)',
                    },
                    {
                      key: 'verifier',
                      role: 'หัวหน้าเจ้าหน้าที่',
                    },
                    {
                      key: 'committeeChair',
                      role: 'ประธานกรรมการตรวจสอบพัสดุ',
                    },
                    {
                      key: 'committeeMember2',
                      role: 'กรรมการตรวจสอบพัสดุ คนที่ 2',
                    },
                    {
                      key: 'committeeMember3',
                      role: 'กรรมการตรวจสอบพัสดุ คนที่ 3',
                    },
                    {
                      key: 'director',
                      role: 'หัวหน้าหน่วยงาน (ผู้อำนวยการ)',
                    },
                  ] as const
                ).map((item) => {
                  const val = form[item.key] || { name: '', position: '' };
                  const updateField = (
                    field: 'name' | 'position',
                    nextVal: string
                  ) => {
                    setForm((prev) => ({
                      ...prev,
                      [item.key]: {
                        ...(prev[item.key] || { name: '', position: '' }),
                        [field]: nextVal,
                      },
                    }));
                  };
                  return (
                    <tr key={item.key} className="bg-emerald-50/35">
                      <td className="py-2 px-4 font-medium text-slate-900 border-r border-slate-200 whitespace-nowrap">
                        {item.role}
                      </td>
                      <td className="py-1.5 px-2 border-r border-slate-200">
                        <input
                          type="text"
                          value={val.name}
                          onChange={(e) => updateField('name', e.target.value)}
                          placeholder="เว้นว่างได้หากไม่มี"
                          className="w-full px-2.5 py-1.5 text-xs sm:text-sm bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={val.position}
                          onChange={(e) =>
                            updateField('position', e.target.value)
                          }
                          placeholder="ระบุตำแหน่ง (เว้นว่างได้)"
                          className="w-full px-2.5 py-1.5 text-xs sm:text-sm bg-white border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            ระเบียบกระทรวงการคลังว่าด้วยการจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560 ข้อ 213: ผู้ตรวจสอบพัสดุประจำปีต้องไม่ใช่เจ้าหน้าที่ (ผู้ดูแลพัสดุ) · มีกรรมการ 1 คนหรือมากกว่าก็ได้ เว้นช่องที่ไม่มีไว้
          </p>
        </div>
      </div>

      {/* Section 2: Reference Locations & Asset Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">
            2. รายการสถานที่ / ห้องติดตั้ง
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              placeholder="เพิ่มห้อง/จุดใช้งานใหม่"
              className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              onClick={handleAddLocation}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-900 rounded-lg hover:bg-emerald-800"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>เพิ่ม</span>
            </button>
          </div>
          <ul className="divide-y divide-slate-100 text-xs">
            {refForm.locations.map((loc) => (
              <li
                key={loc}
                className="py-2 flex items-center justify-between gap-2 text-slate-800"
              >
                <span>{loc}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveLocation(loc)}
                  className="text-slate-400 hover:text-red-600 p-1"
                  title="ลบสถานที่"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">
            3. ตารางอ้างอิงประเภทครุภัณฑ์ (รหัส APC) และอายุการใช้งานเริ่มต้น
          </h2>
          <div className="overflow-x-auto max-h-[380px] overflow-y-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">รหัสบัญชี APC</th>
                  <th className="py-2 px-3">คลาส</th>
                  <th className="py-2 px-3">ชื่อประเภทสินทรัพย์</th>
                  <th className="py-2 px-3 text-right">อายุใช้งาน (ปี)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {refForm.categories.map((cat) => (
                  <tr key={cat.apcCode} className="hover:bg-slate-50">
                    <td className="py-1.5 px-3 font-mono-num text-slate-700">
                      {cat.apcCode}
                    </td>
                    <td className="py-1.5 px-3 font-mono-num text-slate-500">
                      {cat.classCode}
                    </td>
                    <td className="py-1.5 px-3 text-slate-900">{cat.name}</td>
                    <td className="py-1.5 px-3 text-right">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={cat.defaultUsefulLife}
                        onChange={(e) =>
                          handleLifeChange(
                            cat.apcCode,
                            Number(e.target.value) || 0
                          )
                        }
                        className="w-16 px-2 py-1 text-right border border-slate-300 rounded font-mono-num bg-emerald-50/40"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Section 4: JSON Backup & Restore */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              4. สำรองข้อมูลทั้งหมดและนำข้อมูลกลับมาใช้ (ไฟล์ .json)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              บันทึกข้อมูลทั้งหมดของระบบ (ตั้งค่าหน่วยงาน, ผู้ลงนาม, รายการอ้างอิง, ทะเบียนครุภัณฑ์ และประวัติซ่อมบำรุง) เพื่อย้ายเครื่องหรือสำรองเก็บไว้ใช้งานแบบออฟไลน์
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleSelectBackupFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={handleExportBackup}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>สำรองข้อมูลทั้งหมด (.json)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setBackupError('');
                fileInputRef.current?.click();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-800" />
              <span>นำเข้าข้อมูลจากไฟล์ (.json)</span>
            </button>
          </div>
        </div>

        {backupError && (
          <div className="flex items-start gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
            <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">
                ไม่สามารถนำเข้าไฟล์สำรองข้อมูลได้
              </div>
              <div className="mt-0.5">{backupError}</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
            <div className="text-[11px] text-slate-500">ครุภัณฑ์ในทะเบียน</div>
            <div className="text-sm font-semibold text-slate-900 font-mono-num mt-0.5">
              {formatInt(assets.length)} รายการ
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
            <div className="text-[11px] text-slate-500">ประวัติการซ่อมบำรุง</div>
            <div className="text-sm font-semibold text-slate-900 font-mono-num mt-0.5">
              {formatInt(maintenance.length)} รายการ
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
            <div className="text-[11px] text-slate-500">ประเภทครุภัณฑ์ (APC)</div>
            <div className="text-sm font-semibold text-slate-900 font-mono-num mt-0.5">
              {formatInt(refForm.categories.length)} หมวด
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
            <div className="text-[11px] text-slate-500">สถานที่/ห้องใช้งาน</div>
            <div className="text-sm font-semibold text-slate-900 font-mono-num mt-0.5">
              {formatInt(refForm.locations.length)} แห่ง
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-500">
          หมายเหตุ: ระบบจะตรวจสอบความถูกต้องของโครงสร้างไฟล์และแสดงสรุปข้อมูลให้ยืนยันก่อนนำเข้าทุกครั้ง และไฟล์สำรองจะไม่เก็บรหัสผ่านหรือสิทธิ์เชื่อมต่อบัญชี Google เพื่อความปลอดภัย
        </p>
      </div>

      {/* Section 5: Google Sheets Connection, Lock & 30s Auto-Sync */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-800 shrink-0" />
              <span>
                5. เชื่อมต่อฐานข้อมูล Google Sheets และบันทึกอัตโนมัติทุก{' '}
                {sheetsSyncConfig.intervalSeconds} วินาที
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ลงชื่อเข้าใช้บัญชี Google เลือกหรือสร้างไฟล์ Google Sheets ล็อคการตั้งค่าเชื่อมต่อ และเปิดบันทึกข้อมูลลง Sheets อัตโนมัติทุก {sheetsSyncConfig.intervalSeconds} วินาที
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {needsAuth ? (
              <button
                type="button"
                onClick={onGoogleSignIn}
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
              connectedSheet &&
              hasSheetsScope && (
                <button
                  type="button"
                  disabled={isAutoSyncing}
                  onClick={onSyncNow}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap disabled:opacity-60"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-emerald-800 ${
                      isAutoSyncing ? 'animate-spin' : ''
                    }`}
                  />
                  <span>บันทึกทันที</span>
                </button>
              )
            )}

            <button
              type="button"
              onClick={onOpenSheetsModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 whitespace-nowrap"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>จัดการเชื่อมต่อ / ล็อค / ตั้งเวลา 30 วิ</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
            <div className="text-[11px] text-slate-500">บัญชี Google</div>
            <div className="text-xs font-semibold text-slate-900 mt-0.5 truncate">
              {!needsAuth && googleUser
                ? `${googleUser.displayName || googleUser.email}`
                : 'ยังไม่ได้เข้าสู่ระบบ'}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
            <div className="text-[11px] text-slate-500">
              ไฟล์ Google Sheets ปลายทาง
            </div>
            <div className="text-xs font-semibold text-slate-900 mt-0.5 flex items-center gap-1.5 truncate">
              {sheetsSyncConfig.locked && (
                <Lock className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
              )}
              <span className="truncate">
                {connectedSheet ? connectedSheet.title : 'ยังไม่ได้เลือกไฟล์'}
              </span>
              {connectedSheet && (
                <a
                  href={connectedSheet.spreadsheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-800 hover:underline shrink-0"
                  title="เปิดใน Google Sheets"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
            <div className="text-[11px] text-slate-500">
              ล็อค &amp; บันทึกอัตโนมัติ (30 วินาที)
            </div>
            <div className="text-xs font-semibold text-slate-900 mt-0.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
              <span>
                {sheetsSyncConfig.autoSyncEnabled && sessionAutoSyncConfirmed && !needsAuth
                  ? `ทำงานทุก ${sheetsSyncConfig.intervalSeconds} วิ`
                  : sheetsSyncConfig.locked
                  ? sheetsSyncConfig.autoSyncEnabled
                    ? 'ล็อคแล้ว · รอเข้าสู่ระบบ/ยืนยัน'
                    : 'ล็อคไฟล์แล้ว (ปิดบันทึกอัตโนมัติ)'
                  : 'ยังไม่ล็อค / ปิดอยู่'}
              </span>
            </div>
          </div>
        </div>

        {(lastSheetsSyncAt || lastSheetsSyncError) && (
          <div className="text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
            <span>
              บันทึกลง Google Sheets ล่าสุด:{' '}
              <strong className="font-mono-num text-slate-900">
                {lastSheetsSyncAt || '-'}
              </strong>
            </span>
            {lastSheetsSyncError && (
              <span className="text-red-700 font-medium">{lastSheetsSyncError}</span>
            )}
          </div>
        )}
      </div>

      {/* Restore Confirmation Modal */}
      <ConfirmModal
        open={pendingRestore !== null}
        title="ยืนยันการนำเข้าข้อมูลจากไฟล์สำรอง (.json)"
        description="ตรวจสอบรายละเอียดข้อมูลจากไฟล์สำรองที่ผ่านการตรวจสอบโครงสร้างแล้ว การยืนยันจะแทนที่ข้อมูลทั้งหมดในหน้าเว็บปัจจุบันด้วยข้อมูลจากไฟล์นี้"
        details={
          pendingRestore
            ? [
                `หน่วยงาน: ${pendingRestore.summary.agencyName}`,
                `ปีงบประมาณ: ${pendingRestore.summary.fiscalYear}`,
                ...(pendingRestore.summary.exportedAt
                  ? [
                      `วันที่สำรองไฟล์: ${formatThaiDateLong(
                        pendingRestore.summary.exportedAt.slice(0, 10)
                      )} (${pendingRestore.summary.exportedAt.slice(11, 16)} น.)`,
                    ]
                  : []),
                `ทะเบียนครุภัณฑ์: ${formatInt(
                  pendingRestore.summary.assetCount
                )} รายการ`,
                `ประวัติการซ่อมบำรุง: ${formatInt(
                  pendingRestore.summary.maintenanceCount
                )} รายการ`,
                `หมวดหมู่ APC: ${formatInt(
                  pendingRestore.summary.categoryCount
                )} หมวด · สถานที่: ${formatInt(
                  pendingRestore.summary.locationCount
                )} แห่ง`,
                ...pendingRestore.summary.warnings.map((w) => `หมายเหตุ: ${w}`),
              ]
            : undefined
        }
        confirmLabel="ยืนยันนำเข้าข้อมูลจากไฟล์"
        onConfirm={() => {
          if (!pendingRestore) return;
          const summary = pendingRestore.summary;
          onRestoreBackup(pendingRestore.data);
          setPendingRestore(null);
          setSavedNotice(
            `นำเข้าข้อมูลจากไฟล์สำรองสำเร็จ (ครุภัณฑ์ ${formatInt(
              summary.assetCount
            )} รายการ, ประวัติซ่อม ${formatInt(summary.maintenanceCount)} รายการ)`
          );
          setTimeout(() => setSavedNotice(''), 5000);
        }}
        onCancel={() => setPendingRestore(null)}
      />

      <ConfirmModal
        open={showResetConfirm}
        title="คืนค่าข้อมูลเริ่มต้นของระบบ"
        description="การดำเนินการนี้จะรีเซ็ตทะเบียนครุภัณฑ์ ประวัติการซ่อมบำรุง และการตั้งค่ากลับเป็นชุดข้อมูลตัวอย่างเริ่มต้น (ข้อมูลที่ยังไม่ส่งออกขึ้น Google Sheets จะถูกล้าง)"
        variant="danger"
        confirmLabel="ยืนยันคืนค่าเริ่มต้น"
        onConfirm={() => {
          onResetToDefaults();
          setShowResetConfirm(false);
        }}
        onCancel={() => setShowResetConfirm(false)}
      />
    </form>
  );
}
