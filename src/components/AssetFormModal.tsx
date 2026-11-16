import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  AgencySettings,
  AssetItem,
  AssetStatus,
  AcquisitionMethod,
  FundingSource,
  ReferenceConfig,
} from '../types/asset';
import { calculateAssetDepreciation, formatTHB } from '../utils/depreciation';

interface AssetFormModalProps {
  open: boolean;
  initialAsset?: AssetItem | null;
  reference: ReferenceConfig;
  settings: AgencySettings;
  onSave: (asset: AssetItem) => void;
  onClose: () => void;
}

const STATUS_OPTIONS: AssetStatus[] = [
  'ใช้งานปกติ',
  'รอซ่อม',
  'อยู่ระหว่างซ่อม',
  'ชำรุดรอจำหน่าย',
  'สูญหาย',
  'จำหน่ายแล้ว',
];

export function AssetFormModal({
  open,
  initialAsset,
  reference,
  settings,
  onSave,
  onClose,
}: AssetFormModalProps) {
  const [form, setForm] = useState<AssetItem>({
    id: '',
    assetCode: '',
    gfmisAssetNo: '',
    name: '',
    brandModel: '',
    serialNumber: '',
    categoryCode: reference.categories[13]?.apcCode || reference.categories[0]?.apcCode || '1206090101',
    location: reference.locations[0] || '',
    acquisitionDate: new Date().toISOString().slice(0, 10),
    acquisitionMethod: 'ซื้อ',
    fundingSource: 'เงินบำรุง รพ.สต.',
    cost: 0,
    usefulLifeYears: 5,
    status: 'ใช้งานปกติ',
    disposalDate: '',
    disposalReason: '',
    warrantyExpiryDate: '',
    nextMaintenanceDate: '',
    maintenanceIntervalDays: 180,
    responsiblePerson: settings.preparer.name,
    unit: '',
    documentNo: '',
    disposalDocNo: '',
    notes: '',
    gfmisRecordedCost: undefined,
  });

  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (initialAsset) {
      setForm({
        ...initialAsset,
        disposalDate: initialAsset.disposalDate || '',
        disposalReason: initialAsset.disposalReason || '',
        warrantyExpiryDate: initialAsset.warrantyExpiryDate || '',
        nextMaintenanceDate: initialAsset.nextMaintenanceDate || '',
        unit: initialAsset.unit || '',
        documentNo: initialAsset.documentNo || '',
        disposalDocNo: initialAsset.disposalDocNo || '',
        notes: initialAsset.notes || '',
      });
    } else {
      const defaultCat =
        reference.categories.find((c) => c.apcCode === '1206090101') ||
        reference.categories[0];
      setForm({
        id: `ast-${Date.now()}`,
        assetCode: '',
        gfmisAssetNo: '',
        name: '',
        brandModel: '',
        serialNumber: '',
        categoryCode: defaultCat?.apcCode || '1206090101',
        location: reference.locations[0] || '',
        acquisitionDate: new Date().toISOString().slice(0, 10),
        acquisitionMethod: 'ซื้อ',
        fundingSource: 'เงินบำรุง รพ.สต.',
        cost: 0,
        usefulLifeYears: defaultCat?.defaultUsefulLife || 5,
        status: 'ใช้งานปกติ',
        disposalDate: '',
        disposalReason: '',
        warrantyExpiryDate: '',
        nextMaintenanceDate: '',
        maintenanceIntervalDays: 180,
        responsiblePerson: settings.preparer.name,
        unit: '',
        documentNo: '',
        disposalDocNo: '',
        notes: '',
        gfmisRecordedCost: undefined,
      });
    }
  }, [open, initialAsset, reference, settings]);

  if (!open) return null;

  const selectedCategory = reference.categories.find(
    (c) => c.apcCode === form.categoryCode
  );
  const previewDep = calculateAssetDepreciation(form, settings, selectedCategory);

  const handleCategoryChange = (apcCode: string) => {
    const cat = reference.categories.find((c) => c.apcCode === apcCode);
    setForm((prev) => ({
      ...prev,
      categoryCode: apcCode,
      usefulLifeYears: cat ? cat.defaultUsefulLife : prev.usefulLifeYears,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.assetCode.trim()) {
      setError('กรุณาระบุรหัสครุภัณฑ์');
      return;
    }
    if (!form.name.trim()) {
      setError('กรุณาระบุชื่อรายการครุภัณฑ์');
      return;
    }
    if (!form.acquisitionDate) {
      setError('กรุณาระบุวันที่ได้มา / วันตรวจรับ');
      return;
    }
    if (form.cost < 0 || isNaN(form.cost)) {
      setError('กรุณาระบุราคาทุนที่ถูกต้อง');
      return;
    }
    if (form.status === 'จำหน่ายแล้ว' && !form.disposalDate) {
      setError('เมื่อสถานะเป็น "จำหน่ายแล้ว" กรุณาระบุวันที่จำหน่าย');
      return;
    }

    onSave({
      ...form,
      gfmisRecordedCost:
        form.gfmisRecordedCost !== undefined
          ? form.gfmisRecordedCost
          : form.cost >= settings.minDepreciationCost
          ? form.cost
          : 0,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {initialAsset ? 'แก้ไขข้อมูลทะเบียนครุภัณฑ์' : 'ลงทะเบียนครุภัณฑ์ใหม่'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ระบบคำนวณค่าเสื่อมราคาแบบเส้นตรงตามหลักเกณฑ์กรมบัญชีกลางให้อัตโนมัติ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-lg">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                รหัสครุภัณฑ์ *
              </label>
              <input
                type="text"
                value={form.assetCode}
                onChange={(e) => setForm({ ...form, assetCode: e.target.value })}
                placeholder="เช่น 6515-001-0002/2569"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800 font-mono-num"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                เลขที่สินทรัพย์ GFMIS
              </label>
              <input
                type="text"
                value={form.gfmisAssetNo}
                onChange={(e) => setForm({ ...form, gfmisAssetNo: e.target.value })}
                placeholder="เช่น 1000006820"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800 font-mono-num"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                สถานะการใช้งาน
              </label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as AssetStatus })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
              >
                {STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ชื่อครุภัณฑ์ / รายการ *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="เช่น เครื่องวัดความดันโลหิตสอดแขนอัตโนมัติ"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ยี่ห้อ / รุ่น / คุณลักษณะ
              </label>
              <input
                type="text"
                value={form.brandModel}
                onChange={(e) => setForm({ ...form, brandModel: e.target.value })}
                placeholder="เช่น Omron HBP-9030"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ประเภทครุภัณฑ์ (รหัส APC) *
              </label>
              <select
                value={form.categoryCode}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
              >
                {reference.categories.map((cat) => (
                  <option key={cat.apcCode} value={cat.apcCode}>
                    {cat.apcCode} - {cat.name} ({cat.defaultUsefulLife} ปี)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                สถานที่ / ห้องติดตั้ง *
              </label>
              <select
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
              >
                {reference.locations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                หมายเลขเครื่อง (Serial No.)
              </label>
              <input
                type="text"
                value={form.serialNumber}
                onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                placeholder="ระบุ S/N"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800 font-mono-num"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                วันที่ได้มา / ตรวจรับ *
              </label>
              <input
                type="date"
                value={form.acquisitionDate}
                onChange={(e) =>
                  setForm({ ...form, acquisitionDate: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ราคาทุน (บาท) *
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.cost}
                onChange={(e) =>
                  setForm({ ...form, cost: Number(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800 font-mono-num text-right"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                อายุการใช้งาน (ปี)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.usefulLifeYears}
                onChange={(e) =>
                  setForm({
                    ...form,
                    usefulLifeYears: Number(e.target.value) || 0,
                  })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800 font-mono-num text-right"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                วิธีได้มา
              </label>
              <select
                value={form.acquisitionMethod}
                onChange={(e) =>
                  setForm({
                    ...form,
                    acquisitionMethod: e.target.value as AcquisitionMethod,
                  })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
              >
                {reference.acquisitionMethods.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                แหล่งเงินงบประมาณ
              </label>
              <select
                value={form.fundingSource}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fundingSource: e.target.value as FundingSource,
                  })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
              >
                {reference.fundingSources.map((fs) => (
                  <option key={fs} value={fs}>
                    {fs}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                กำหนดบำรุงรักษาถัดไป
              </label>
              <input
                type="date"
                value={form.nextMaintenanceDate || ''}
                onChange={(e) =>
                  setForm({ ...form, nextMaintenanceDate: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                วันหมดอายุรับประกัน
              </label>
              <input
                type="date"
                value={form.warrantyExpiryDate || ''}
                onChange={(e) =>
                  setForm({ ...form, warrantyExpiryDate: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ผู้รับผิดชอบดูแล
              </label>
              <input
                type="text"
                value={form.responsiblePerson}
                onChange={(e) =>
                  setForm({ ...form, responsiblePerson: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
              />
            </div>
          </div>

          {form.status === 'จำหน่ายแล้ว' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  วันที่จำหน่าย *
                </label>
                <input
                  type="date"
                  value={form.disposalDate || ''}
                  onChange={(e) =>
                    setForm({ ...form, disposalDate: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  เหตุผลการจำหน่าย
                </label>
                <input
                  type="text"
                  value={form.disposalReason || ''}
                  onChange={(e) =>
                    setForm({ ...form, disposalReason: e.target.value })
                  }
                  placeholder="เช่น ขายทอดตลาด / โอน / ทำลาย"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                หน่วยนับ
              </label>
              <input
                type="text"
                value={form.unit || ''}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="เช่น เครื่อง, หลัง, คัน, ชุด"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                เลขที่เอกสาร (ใบสั่งซื้อ / ตรวจรับ)
              </label>
              <input
                type="text"
                value={form.documentNo || ''}
                onChange={(e) => setForm({ ...form, documentNo: e.target.value })}
                placeholder="เช่น สบ1132.6.2/121"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800 font-mono-num"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                หลักฐานการจ่าย / เลขที่เอกสารจำหน่าย
              </label>
              <input
                type="text"
                value={form.disposalDocNo || ''}
                onChange={(e) =>
                  setForm({ ...form, disposalDocNo: e.target.value })
                }
                placeholder="เช่น ใบเบิก / ใบเสร็จขายทอดตลาด (ถ้ามี)"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              หมายเหตุเพิ่มเติม
            </label>
            <input
              type="text"
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="รายละเอียดสภาพครุภัณฑ์ หรือข้อกำหนดการสอบเทียบ"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
            />
          </div>

          {/* Live Straight-Line Depreciation Preview */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-emerald-950">
                ตัวอย่างการคำนวณค่าเสื่อมราคา (ปีงบประมาณ {settings.fiscalYear})
              </span>
              <span className="text-xs text-emerald-800">
                {previewDep.isDepreciable
                  ? 'เข้าเกณฑ์คิดค่าเสื่อมราคาแบบเส้นตรง (คงมูลค่าซาก 1 บาท)'
                  : previewDep.nonDepreciableReason}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-emerald-200/70">
              <div>
                <div className="text-[11px] text-slate-500">ค่าเสื่อมต่อปี</div>
                <div className="text-sm font-semibold text-slate-900 font-mono-num">
                  {formatTHB(previewDep.annualRate)} ฿
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">ค่าเสื่อมปีนี้ ({settings.fiscalYear})</div>
                <div className="text-sm font-semibold text-slate-900 font-mono-num">
                  {formatTHB(previewDep.thisYearDep)} ฿
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">ค่าเสื่อมสะสม</div>
                <div className="text-sm font-semibold text-slate-900 font-mono-num">
                  {formatTHB(previewDep.accumulatedDep)} ฿
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">มูลค่าสุทธิตามบัญชี</div>
                <div className="text-sm font-semibold text-emerald-900 font-mono-num">
                  {formatTHB(previewDep.netBookValue)} ฿
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 transition-colors"
            >
              {initialAsset ? 'บันทึกการแก้ไข' : 'บันทึกเข้าทะเบียนครุภัณฑ์'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
