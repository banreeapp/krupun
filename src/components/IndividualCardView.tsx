import { useMemo } from 'react';
import { Printer, Wrench } from 'lucide-react';
import {
  AgencySettings,
  AssetItem,
  MaintenanceRecord,
  ReferenceConfig,
} from '../types/asset';
import {
  calculateAssetDepreciation,
  formatThaiDateLong,
  formatTHB,
} from '../utils/depreciation';
import { AssetStatusLabel, MaintenanceStatusLabel } from './StatusBadge';

interface IndividualCardViewProps {
  settings: AgencySettings;
  reference: ReferenceConfig;
  assets: AssetItem[];
  maintenance: MaintenanceRecord[];
  selectedAssetId: string;
  onSelectAsset: (assetId: string) => void;
  onLogMaintenance: (assetId: string) => void;
}

export function IndividualCardView({
  settings,
  reference,
  assets,
  maintenance,
  selectedAssetId,
  onSelectAsset,
  onLogMaintenance,
}: IndividualCardViewProps) {
  const asset =
    assets.find((a) => a.id === selectedAssetId) || assets[0] || null;

  const category = useMemo(
    () =>
      asset
        ? reference.categories.find((c) => c.apcCode === asset.categoryCode)
        : undefined,
    [asset, reference.categories]
  );

  const dep = useMemo(
    () =>
      asset
        ? calculateAssetDepreciation(asset, settings, category)
        : null,
    [asset, settings, category]
  );

  const assetMaintenance = useMemo(
    () =>
      asset
        ? maintenance
            .filter((m) => m.assetId === asset.id)
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        : [],
    [asset, maintenance]
  );

  const totalRepairCost = assetMaintenance.reduce((s, m) => s + m.cost, 0);

  if (!asset || !dep) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
        ยังไม่มีครุภัณฑ์ในทะเบียน
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Control Bar (hidden on print) */}
      <div className="no-print flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex-1 max-w-xl">
          <label className="block text-xs font-medium text-slate-600 mb-1">
            เลือกรหัสครุภัณฑ์เพื่อแสดงทะเบียนคุมทรัพย์สินรายตัว
          </label>
          <select
            value={asset.id}
            onChange={(e) => onSelectAsset(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          >
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                [{a.assetCode}] {a.name} — {a.location}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onLogMaintenance(asset.id)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>บันทึกซ่อมบำรุงรายการนี้</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>พิมพ์ทะเบียนรายตัว (A4)</span>
          </button>
        </div>
      </div>

      {/* Printable A4 Control Card */}
      <div className="print-surface bg-white border border-slate-200 rounded-xl p-6 lg:p-8 font-sarabun">
        <div className="text-center border-b border-slate-300 pb-4 mb-5">
          <h2 className="text-xl font-bold text-slate-900">
            ทะเบียนคุมทรัพย์สิน (รายตัว)
          </h2>
          <p className="text-sm text-slate-700 mt-1">
            หน่วยงาน: {settings.agencyName} · {settings.department}
          </p>
        </div>

        {/* Asset Metadata Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5 text-sm mb-6 border border-slate-300 rounded-lg p-4">
          <div className="flex justify-between gap-2 border-b border-slate-100 pb-1.5">
            <span className="text-slate-500">รหัสครุภัณฑ์:</span>
            <span className="font-semibold font-mono-num text-slate-900">
              {asset.assetCode}
            </span>
          </div>
          <div className="flex justify-between gap-2 border-b border-slate-100 pb-1.5">
            <span className="text-slate-500">เลขที่สินทรัพย์ GFMIS:</span>
            <span className="font-medium font-mono-num text-slate-900">
              {asset.gfmisAssetNo || '-'}
            </span>
          </div>
          <div className="flex justify-between gap-2 border-b border-slate-100 pb-1.5">
            <span className="text-slate-500">ชื่อครุภัณฑ์:</span>
            <span className="font-semibold text-slate-900 text-right">
              {asset.name}
            </span>
          </div>
          <div className="flex justify-between gap-2 border-b border-slate-100 pb-1.5">
            <span className="text-slate-500">ยี่ห้อ / รุ่น / S/N:</span>
            <span className="text-slate-900 text-right">
              {asset.brandModel || '-'} {asset.serialNumber ? `(${asset.serialNumber})` : ''}
            </span>
          </div>
          <div className="flex justify-between gap-2 border-b border-slate-100 pb-1.5">
            <span className="text-slate-500">ประเภท (รหัส APC):</span>
            <span className="text-slate-900 text-right">
              {category?.name || asset.categoryCode} ({asset.categoryCode})
            </span>
          </div>
          <div className="flex justify-between gap-2 border-b border-slate-100 pb-1.5">
            <span className="text-slate-500">สถานที่ติดตั้ง / ห้อง:</span>
            <span className="text-slate-900 text-right">{asset.location}</span>
          </div>
          <div className="flex justify-between gap-2 border-b border-slate-100 pb-1.5">
            <span className="text-slate-500">วันเดือนปีที่ได้มา:</span>
            <span className="text-slate-900">{formatThaiDateLong(asset.acquisitionDate)}</span>
          </div>
          <div className="flex justify-between gap-2 border-b border-slate-100 pb-1.5">
            <span className="text-slate-500">วิธีได้มา / แหล่งเงิน:</span>
            <span className="text-slate-900">
              {asset.acquisitionMethod} · {asset.fundingSource}
            </span>
          </div>
          <div className="flex justify-between gap-2 border-b border-slate-100 pb-1.5">
            <span className="text-slate-500">ราคาทุน:</span>
            <span className="font-semibold font-mono-num text-slate-900">
              {formatTHB(asset.cost)} บาท
            </span>
          </div>
          <div className="flex justify-between gap-2 border-b border-slate-100 pb-1.5">
            <span className="text-slate-500">อายุการใช้งาน / อัตราค่าเสื่อม:</span>
            <span className="font-mono-num text-slate-900">
              {asset.usefulLifeYears} ปี ({formatTHB(dep.annualRate)} บาท/ปี)
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">ผู้รับผิดชอบ:</span>
            <span className="text-slate-900">{asset.responsiblePerson}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">สถานะปัจจุบัน:</span>
            <AssetStatusLabel status={asset.status} />
          </div>
        </div>

        {/* Multi-Year Depreciation Schedule */}
        <h3 className="text-sm font-bold text-slate-900 mb-2">
          1. ตารางคำนวณค่าเสื่อมราคาประจำปี (วิธีเส้นตรง คงมูลค่าซาก 1 บาท)
        </h3>
        {!dep.isDepreciable ? (
          <div className="p-4 border border-slate-300 rounded-lg text-sm text-slate-600 mb-6">
            รายการนี้ไม่คิดค่าเสื่อมราคา: {dep.nonDepreciableReason}
          </div>
        ) : (
          <div className="overflow-x-auto mb-6">
            <table className="w-full border-collapse border border-slate-400 text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="border border-slate-400 py-2 px-3 text-center">ปีงบประมาณ</th>
                  <th className="border border-slate-400 py-2 px-3 text-center">งวดบัญชี</th>
                  <th className="border border-slate-400 py-2 px-3 text-right">จำนวนวัน</th>
                  <th className="border border-slate-400 py-2 px-3 text-right">ค่าเสื่อมยกมา</th>
                  <th className="border border-slate-400 py-2 px-3 text-right">ค่าเสื่อมราคาปีนี้</th>
                  <th className="border border-slate-400 py-2 px-3 text-right">ค่าเสื่อมสะสม</th>
                  <th className="border border-slate-400 py-2 px-3 text-right">มูลค่าสุทธิ (NBV)</th>
                </tr>
              </thead>
              <tbody>
                {dep.schedule.map((row) => (
                  <tr
                    key={row.fiscalYear}
                    className={
                      row.fiscalYear === settings.fiscalYear
                        ? 'bg-emerald-50 font-semibold'
                        : ''
                    }
                  >
                    <td className="border border-slate-400 py-1.5 px-3 text-center font-mono-num">
                      {row.fiscalYear}
                    </td>
                    <td className="border border-slate-400 py-1.5 px-3 text-center">
                      {row.periodLabel}
                    </td>
                    <td className="border border-slate-400 py-1.5 px-3 text-right font-mono-num">
                      {row.daysInPeriod}
                    </td>
                    <td className="border border-slate-400 py-1.5 px-3 text-right font-mono-num">
                      {formatTHB(row.broughtForward)}
                    </td>
                    <td className="border border-slate-400 py-1.5 px-3 text-right font-mono-num">
                      {formatTHB(row.depreciationThisYear)}
                    </td>
                    <td className="border border-slate-400 py-1.5 px-3 text-right font-mono-num">
                      {formatTHB(row.accumulated)}
                    </td>
                    <td className="border border-slate-400 py-1.5 px-3 text-right font-mono-num">
                      {formatTHB(row.netBookValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Maintenance History for this Asset */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-slate-900">
            2. ประวัติการซ่อมบำรุงและการสอบเทียบ ({assetMaintenance.length} ครั้ง)
          </h3>
          <span className="text-xs font-semibold text-slate-700 font-mono-num">
            รวมค่าซ่อมบำรุง: {formatTHB(totalRepairCost)} บาท
          </span>
        </div>

        <div className="overflow-x-auto mb-8">
          <table className="w-full border-collapse border border-slate-400 text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-800">
                <th className="border border-slate-400 py-2 px-3">วันที่</th>
                <th className="border border-slate-400 py-2 px-3">ประเภทงาน</th>
                <th className="border border-slate-400 py-2 px-3">รายละเอียดการซ่อมบำรุง</th>
                <th className="border border-slate-400 py-2 px-3">ผู้ดำเนินการ</th>
                <th className="border border-slate-400 py-2 px-3 text-right">ค่าใช้จ่าย (บาท)</th>
                <th className="border border-slate-400 py-2 px-3">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {assetMaintenance.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="border border-slate-400 py-4 text-center text-slate-500"
                  >
                    ยังไม่มีประวัติการซ่อมบำรุงสำหรับครุภัณฑ์รายการนี้
                  </td>
                </tr>
              ) : (
                assetMaintenance.map((m) => (
                  <tr key={m.id}>
                    <td className="border border-slate-400 py-1.5 px-3 whitespace-nowrap">
                      {formatThaiDateLong(m.date)}
                    </td>
                    <td className="border border-slate-400 py-1.5 px-3">{m.type}</td>
                    <td className="border border-slate-400 py-1.5 px-3">
                      {m.description}
                    </td>
                    <td className="border border-slate-400 py-1.5 px-3">
                      {m.vendorOrTechnician}
                    </td>
                    <td className="border border-slate-400 py-1.5 px-3 text-right font-mono-num">
                      {formatTHB(m.cost)}
                    </td>
                    <td className="border border-slate-400 py-1.5 px-3">
                      <MaintenanceStatusLabel status={m.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Signatories */}
        <div className="grid grid-cols-3 gap-6 pt-6 text-center text-xs text-slate-800">
          <div>
            <div>ลงชื่อ..............................................เจ้าหน้าที่พัสดุ (ผู้จัดทำ)</div>
            <div className="mt-1">({settings.preparer.name || '........................................'})</div>
            {settings.preparer.position.trim() && (
              <div className="text-slate-600">{settings.preparer.position}</div>
            )}
          </div>
          <div>
            <div>ลงชื่อ..............................................หัวหน้าเจ้าหน้าที่ (ผู้รับรอง)</div>
            <div className="mt-1">({settings.verifier.name || '........................................'})</div>
            {settings.verifier.position.trim() && (
              <div className="text-slate-600">{settings.verifier.position}</div>
            )}
          </div>
          <div>
            <div>ลงชื่อ..............................................หัวหน้าหน่วยงาน</div>
            <div className="mt-1">({settings.director.name || '........................................'})</div>
            {settings.director.position.trim() && (
              <div className="text-slate-600">{settings.director.position}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
