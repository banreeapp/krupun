import { useMemo, useState } from 'react';
import {
  Download,
  Edit3,
  FileText,
  Plus,
  QrCode,
  Search,
  Wrench,
} from 'lucide-react';
import {
  AgencySettings,
  AssetItem,
  AssetStatus,
  ReferenceConfig,
} from '../types/asset';
import {
  calculateAssetDepreciation,
  formatInt,
  formatThaiDate,
  formatTHB,
} from '../utils/depreciation';
import { AssetStatusLabel } from './StatusBadge';

interface RegistryViewProps {
  settings: AgencySettings;
  reference: ReferenceConfig;
  assets: AssetItem[];
  onAddAsset: () => void;
  onEditAsset: (asset: AssetItem) => void;
  onViewIndividual: (assetId: string) => void;
  onLogMaintenance: (assetId: string) => void;
  onOpenQrLabel?: (assetId: string) => void;
}

const STATUS_FILTERS: Array<'ทั้งหมด' | AssetStatus> = [
  'ทั้งหมด',
  'ใช้งานปกติ',
  'รอซ่อม',
  'อยู่ระหว่างซ่อม',
  'ชำรุดรอจำหน่าย',
  'สูญหาย',
  'จำหน่ายแล้ว',
];

export function RegistryView({
  settings,
  reference,
  assets,
  onAddAsset,
  onEditAsset,
  onViewIndividual,
  onLogMaintenance,
  onOpenQrLabel,
}: RegistryViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ทั้งหมด' | AssetStatus>('ทั้งหมด');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (statusFilter !== 'ทั้งหมด' && a.status !== statusFilter) return false;
      if (categoryFilter !== 'ALL' && a.categoryCode !== categoryFilter) return false;
      if (locationFilter !== 'ALL' && a.location !== locationFilter) return false;
      if (q) {
        const hay = `${a.assetCode} ${a.gfmisAssetNo} ${a.name} ${a.brandModel} ${a.location} ${a.responsiblePerson}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [assets, search, statusFilter, categoryFilter, locationFilter]);

  const totals = useMemo(() => {
    let cost = 0;
    let thisYearDep = 0;
    let accumDep = 0;
    let nbv = 0;
    for (const asset of filtered) {
      const cat = reference.categories.find((c) => c.apcCode === asset.categoryCode);
      const dep = calculateAssetDepreciation(asset, settings, cat);
      cost += asset.cost;
      thisYearDep += dep.thisYearDep;
      accumDep += dep.accumulatedDep;
      nbv += dep.netBookValue;
    }
    return { cost, thisYearDep, accumDep, nbv };
  }, [filtered, reference.categories, settings]);

  const handleExportCSV = () => {
    const headers = [
      'รหัสครุภัณฑ์',
      'เลขที่ GFMIS',
      'รายการ',
      'ยี่ห้อ/รุ่น',
      'ประเภท (APC)',
      'สถานที่/ห้อง',
      'วันที่ได้มา',
      'แหล่งเงิน',
      'ราคาทุน',
      'อายุ(ปี)',
      'ค่าเสื่อมต่อปี',
      'ค่าเสื่อมปีนี้',
      'ค่าเสื่อมสะสม',
      'มูลค่าสุทธิ',
      'สถานะ',
    ];
    const rows = filtered.map((a) => {
      const cat = reference.categories.find((c) => c.apcCode === a.categoryCode);
      const dep = calculateAssetDepreciation(a, settings, cat);
      return [
        a.assetCode,
        a.gfmisAssetNo,
        a.name,
        a.brandModel,
        cat?.name || a.categoryCode,
        a.location,
        a.acquisitionDate,
        a.fundingSource,
        a.cost.toFixed(2),
        a.usefulLifeYears,
        dep.annualRate.toFixed(2),
        dep.thisYearDep.toFixed(2),
        dep.accumulatedDep.toFixed(2),
        dep.netBookValue.toFixed(2),
        a.status,
      ]
        .map((val) => `"${String(val).replace(/"/g, '""')}"`)
        .join(',');
    });
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ทะเบียนครุภัณฑ์_${settings.fiscalYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            ทะเบียนคุมครุภัณฑ์ทั้งหมด
          </h1>
          <p className="text-xs text-slate-500">
            แสดง {formatInt(filtered.length)} จาก {formatInt(assets.length)} รายการ · คำนวณค่าเสื่อมราคาถึงสิ้นปีงบประมาณ {settings.fiscalYear}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>ส่งออก CSV</span>
          </button>
          <button
            type="button"
            onClick={onAddAsset}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>ลงทะเบียนครุภัณฑ์</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหารหัสครุภัณฑ์, เลข GFMIS, ชื่อรายการ, ผู้รับผิดชอบ..."
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800/20 focus:border-emerald-800"
            />
          </div>

          <div className="md:col-span-4">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">ประเภทครุภัณฑ์ทั้งหมด</option>
              {reference.categories.map((c) => (
                <option key={c.apcCode} value={c.apcCode}>
                  {c.apcCode} · {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">สถานที่ / ห้องทั้งหมด</option>
              {reference.locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Segmented status filter */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {STATUS_FILTERS.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* High-density Data Grid */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-3.5 whitespace-nowrap">รหัสครุภัณฑ์</th>
                <th className="py-3 px-3.5 min-w-[220px]">รายการ / ยี่ห้อรุ่น</th>
                <th className="py-3 px-3.5 whitespace-nowrap">สถานที่ / ประเภท</th>
                <th className="py-3 px-3.5 whitespace-nowrap">วันที่ได้มา</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">ราคาทุน</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">ค่าเสื่อมปีนี้</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">ค่าเสื่อมสะสม</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">มูลค่าสุทธิ</th>
                <th className="py-3 px-3.5 whitespace-nowrap">สถานะ</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-500">
                    ไม่พบรายการครุภัณฑ์ตามเงื่อนไขที่ค้นหา
                  </td>
                </tr>
              ) : (
                filtered.map((asset) => {
                  const cat = reference.categories.find(
                    (c) => c.apcCode === asset.categoryCode
                  );
                  const dep = calculateAssetDepreciation(asset, settings, cat);
                  return (
                    <tr
                      key={asset.id}
                      className="hover:bg-slate-50/90 transition-colors"
                    >
                      <td className="py-2.5 px-3.5 align-top">
                        <div className="font-mono-num font-medium text-slate-900 whitespace-nowrap">
                          {asset.assetCode}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono-num">
                          GFMIS: {asset.gfmisAssetNo || '-'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 align-top">
                        <div className="font-medium text-slate-900">{asset.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {asset.brandModel || '-'} · {asset.fundingSource}
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 align-top">
                        <div className="text-slate-800">{asset.location}</div>
                        <div className="text-[11px] text-slate-500">
                          {cat?.name || asset.categoryCode} ({asset.usefulLifeYears} ปี)
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 align-top whitespace-nowrap">
                        <div className="text-slate-800">
                          {formatThaiDate(asset.acquisitionDate)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {asset.acquisitionMethod}
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 align-top text-right font-mono-num text-slate-900 whitespace-nowrap">
                        {formatTHB(asset.cost)}
                      </td>
                      <td className="py-2.5 px-3.5 align-top text-right font-mono-num text-slate-700 whitespace-nowrap">
                        {dep.isDepreciable ? formatTHB(dep.thisYearDep) : 'ไม่คิด'}
                      </td>
                      <td className="py-2.5 px-3.5 align-top text-right font-mono-num text-slate-700 whitespace-nowrap">
                        {formatTHB(dep.accumulatedDep)}
                      </td>
                      <td className="py-2.5 px-3.5 align-top text-right font-mono-num font-semibold text-emerald-900 whitespace-nowrap">
                        {formatTHB(dep.netBookValue)}
                      </td>
                      <td className="py-2.5 px-3.5 align-top">
                        <AssetStatusLabel status={asset.status} />
                        {asset.nextMaintenanceDate && asset.status !== 'จำหน่ายแล้ว' && (
                          <div className="text-[11px] text-slate-400 mt-0.5 whitespace-nowrap">
                            PM: {formatThaiDate(asset.nextMaintenanceDate)}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {onOpenQrLabel && (
                            <button
                              type="button"
                              onClick={() => onOpenQrLabel(asset.id)}
                              title="สร้างสติกเกอร์ QR Code (50×30 มม.)"
                              className="p-1.5 text-slate-600 hover:text-emerald-900 hover:bg-emerald-50 rounded-md transition-colors"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onViewIndividual(asset.id)}
                            title="ดูทะเบียนรายตัว"
                            className="p-1.5 text-slate-600 hover:text-emerald-900 hover:bg-emerald-50 rounded-md transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onLogMaintenance(asset.id)}
                            title="บันทึกซ่อมบำรุง"
                            className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-md transition-colors"
                          >
                            <Wrench className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditAsset(asset)}
                            title="แก้ไขข้อมูล"
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-300 text-xs font-semibold text-slate-900">
                  <td colSpan={4} className="py-3 px-3.5 text-right">
                    รวมตามตัวกรอง ({formatInt(filtered.length)} รายการ)
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono-num">
                    {formatTHB(totals.cost)}
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono-num">
                    {formatTHB(totals.thisYearDep)}
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono-num">
                    {formatTHB(totals.accumDep)}
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono-num text-emerald-900">
                    {formatTHB(totals.nbv)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
