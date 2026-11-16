import { useState } from 'react';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { AgencySettings, ReferenceConfig } from '../types/asset';
import { getFiscalYearWindow } from '../utils/depreciation';
import { ConfirmModal } from './ConfirmModal';

interface SettingsAndReferenceViewProps {
  settings: AgencySettings;
  reference: ReferenceConfig;
  onSaveSettings: (next: AgencySettings) => void;
  onSaveReference: (next: ReferenceConfig) => void;
  onResetToDefaults: () => void;
}

export function SettingsAndReferenceView({
  settings,
  reference,
  onSaveSettings,
  onSaveReference,
  onResetToDefaults,
}: SettingsAndReferenceViewProps) {
  const [form, setForm] = useState<AgencySettings>(settings);
  const [refForm, setRefForm] = useState<ReferenceConfig>(reference);
  const [newLocation, setNewLocation] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const fyWindow = getFiscalYearWindow(form.fiscalYear);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(form);
    onSaveReference(refForm);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
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
        <div className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium rounded-lg">
          บันทึกการตั้งค่าและรายการอ้างอิงเรียบร้อยแล้ว ค่าเสื่อมราคาและรายงานทั้งหมดถูกคำนวณใหม่ทันที
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
