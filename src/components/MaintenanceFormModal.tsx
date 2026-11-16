import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  AssetItem,
  AssetStatus,
  FundingSource,
  MaintenanceRecord,
  MaintenanceStatus,
  MaintenanceType,
  ReferenceConfig,
} from '../types/asset';

interface MaintenanceFormModalProps {
  open: boolean;
  assets: AssetItem[];
  preselectedAssetId?: string;
  initialRecord?: MaintenanceRecord | null;
  reference: ReferenceConfig;
  onSave: (
    record: MaintenanceRecord,
    updateAssetStatus?: AssetStatus,
    nextMaintenanceDate?: string
  ) => void;
  onClose: () => void;
}

const MAINTENANCE_TYPES: MaintenanceType[] = [
  'บำรุงรักษาเชิงป้องกัน (PM)',
  'ซ่อมแซมแก้ไข (CM)',
  'สอบเทียบเครื่องมือแพทย์ (Calibration)',
  'เปลี่ยนอะไหล่',
];

const MAINTENANCE_STATUSES: MaintenanceStatus[] = [
  'รอดำเนินการ',
  'กำลังดำเนินการ',
  'เสร็จสิ้น',
];

export function MaintenanceFormModal({
  open,
  assets,
  preselectedAssetId,
  initialRecord,
  reference,
  onSave,
  onClose,
}: MaintenanceFormModalProps) {
  const activeAssets = assets.filter((a) => a.status !== 'จำหน่ายแล้ว');

  const [assetId, setAssetId] = useState('');
  const [date, setDate] = useState('');
  const [type, setType] = useState<MaintenanceType>('ซ่อมแซมแก้ไข (CM)');
  const [description, setDescription] = useState('');
  const [vendorOrTechnician, setVendorOrTechnician] = useState('');
  const [cost, setCost] = useState(0);
  const [fundingSource, setFundingSource] =
    useState<FundingSource>('เงินบำรุง รพ.สต.');
  const [status, setStatus] = useState<MaintenanceStatus>('รอดำเนินการ');
  const [nextDueDate, setNextDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [syncAssetStatus, setSyncAssetStatus] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (initialRecord) {
      setAssetId(initialRecord.assetId);
      setDate(initialRecord.date);
      setType(initialRecord.type);
      setDescription(initialRecord.description);
      setVendorOrTechnician(initialRecord.vendorOrTechnician);
      setCost(initialRecord.cost);
      setFundingSource(initialRecord.fundingSource);
      setStatus(initialRecord.status);
      setNextDueDate(initialRecord.nextDueDate || '');
      setNotes(initialRecord.notes || '');
      setSyncAssetStatus(true);
    } else {
      setAssetId(preselectedAssetId || activeAssets[0]?.id || '');
      setDate(new Date().toISOString().slice(0, 10));
      setType('ซ่อมแซมแก้ไข (CM)');
      setDescription('');
      setVendorOrTechnician('');
      setCost(0);
      setFundingSource('เงินบำรุง รพ.สต.');
      setStatus('รอดำเนินการ');
      setNextDueDate('');
      setNotes('');
      setSyncAssetStatus(true);
    }
  }, [open, preselectedAssetId, initialRecord]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetId) {
      setError('กรุณาเลือกครุภัณฑ์');
      return;
    }
    if (!date) {
      setError('กรุณาระบุวันที่ดำเนินการ');
      return;
    }
    if (!description.trim()) {
      setError('กรุณาระบุอาการหรือรายละเอียดการซ่อมบำรุง');
      return;
    }

    let derivedAssetStatus: AssetStatus | undefined = undefined;
    if (syncAssetStatus) {
      if (status === 'รอดำเนินการ') derivedAssetStatus = 'รอซ่อม';
      else if (status === 'กำลังดำเนินการ') derivedAssetStatus = 'อยู่ระหว่างซ่อม';
      else if (status === 'เสร็จสิ้น') derivedAssetStatus = 'ใช้งานปกติ';
    }

    onSave(
      {
        id: initialRecord?.id || `mnt-${Date.now()}`,
        assetId,
        date,
        type,
        description: description.trim(),
        vendorOrTechnician: vendorOrTechnician.trim() || 'ช่างเทคนิคประจำหน่วยงาน',
        cost: Number(cost) || 0,
        fundingSource,
        status,
        nextDueDate: nextDueDate || undefined,
        notes: notes.trim() || undefined,
      },
      derivedAssetStatus,
      nextDueDate || undefined
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {initialRecord
                ? 'แก้ไขบันทึกการซ่อมบำรุง'
                : 'บันทึกประวัติการซ่อมบำรุง / สอบเทียบ'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ติดตามค่าใช้จ่ายซ่อมบำรุง กำหนดรอบถัดไป และอัปเดตสถานะการใช้งานครุภัณฑ์
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              ครุภัณฑ์ที่ซ่อมบำรุง *
            </label>
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
            >
              {activeAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  [{a.assetCode}] {a.name} — {a.location}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                วันที่แจ้ง / ดำเนินการ *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ประเภทงานซ่อมบำรุง
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as MaintenanceType)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {MAINTENANCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                สถานะงานซ่อม
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as MaintenanceStatus)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {MAINTENANCE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              รายละเอียดอาการ / รายการดำเนินการ *
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="เช่น เปลี่ยนชุดวาล์วแรงดันลม ตรวจสอบรั่วซึม และทดสอบระบบ"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ผู้ดำเนินการ / บริษัท / ช่าง
              </label>
              <input
                type="text"
                value={vendorOrTechnician}
                onChange={(e) => setVendorOrTechnician(e.target.value)}
                placeholder="เช่น ศูนย์วิศวกรรมชีวการแพทย์"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ค่าใช้จ่ายซ่อมบำรุง (บาท)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={cost}
                onChange={(e) => setCost(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num text-right"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                แหล่งงบประมาณที่ใช้
              </label>
              <select
                value={fundingSource}
                onChange={(e) =>
                  setFundingSource(e.target.value as FundingSource)
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {reference.fundingSources.map((fs) => (
                  <option key={fs} value={fs}>
                    {fs}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                กำหนดตรวจเช็ก / สอบเทียบครั้งถัดไป
              </label>
              <input
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                หมายเหตุ
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="เลขที่ใบแจ้งหนี้ / ผลการทดสอบ"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 pt-1 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={syncAssetStatus}
              onChange={(e) => setSyncAssetStatus(e.target.checked)}
              className="rounded border-slate-300 text-emerald-900 focus:ring-emerald-800"
            />
            <span>
              อัปเดตสถานะการใช้งานครุภัณฑ์และวันนัดหมายถัดไปในทะเบียนครุภัณฑ์อัตโนมัติ
            </span>
          </label>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800"
            >
              บันทึกประวัติการซ่อมบำรุง
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
