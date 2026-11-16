import { useMemo, useState } from 'react';
import { Edit3, Plus, Search } from 'lucide-react';
import {
  AgencySettings,
  AssetItem,
  MaintenanceRecord,
  MaintenanceStatus,
} from '../types/asset';
import { formatInt, formatThaiDate, formatTHB } from '../utils/depreciation';
import { MaintenanceStatusLabel } from './StatusBadge';

interface MaintenanceViewProps {
  settings: AgencySettings;
  assets: AssetItem[];
  maintenance: MaintenanceRecord[];
  onAddMaintenance: (assetId?: string) => void;
  onEditMaintenance: (record: MaintenanceRecord) => void;
  onQuickStatusChange: (recordId: string, newStatus: MaintenanceStatus) => void;
}

export function MaintenanceView({
  settings,
  assets,
  maintenance,
  onAddMaintenance,
  onEditMaintenance,
  onQuickStatusChange,
}: MaintenanceViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ทั้งหมด' | MaintenanceStatus>(
    'ทั้งหมด'
  );

  const assetMap = useMemo(() => {
    const m = new Map<string, AssetItem>();
    for (const a of assets) m.set(a.id, a);
    return m;
  }, [assets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...maintenance]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .filter((m) => {
        if (statusFilter !== 'ทั้งหมด' && m.status !== statusFilter) return false;
        if (q) {
          const asset = assetMap.get(m.assetId);
          const hay = `${asset?.assetCode || ''} ${asset?.name || ''} ${m.description} ${m.vendorOrTechnician} ${m.type}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
  }, [maintenance, search, statusFilter, assetMap]);

  const totalCost = maintenance.reduce((s, m) => s + m.cost, 0);
  const pendingCount = maintenance.filter((m) => m.status === 'รอดำเนินการ').length;
  const activeCount = maintenance.filter((m) => m.status === 'กำลังดำเนินการ').length;
  const doneCount = maintenance.filter((m) => m.status === 'เสร็จสิ้น').length;

  const upcomingSchedule = useMemo(() => {
    return assets
      .filter((a) => a.status !== 'จำหน่ายแล้ว' && a.nextMaintenanceDate)
      .sort((a, b) =>
        (a.nextMaintenanceDate || '').localeCompare(b.nextMaintenanceDate || '')
      );
  }, [assets]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            บันทึกและติดตามประวัติการซ่อมบำรุง
          </h1>
          <p className="text-xs text-slate-500">
            ติดตามงานซ่อมแซม (CM) บำรุงรักษาเชิงป้องกัน (PM) การสอบเทียบเครื่องมือแพทย์ และงบซ่อมบำรุง
          </p>
        </div>

        <button
          type="button"
          onClick={() => onAddMaintenance()}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>บันทึกงานซ่อมบำรุง</span>
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">ค่าซ่อมบำรุงสะสมทั้งหมด</div>
          <div className="text-xl font-bold text-slate-900 mt-1 font-mono-num">
            {formatTHB(totalCost)} <span className="text-xs font-normal">฿</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono-num">
            คงเหลือจากงบ {formatTHB(Math.max(0, settings.annualMaintenanceBudget - totalCost))} ฿
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">รอดำเนินการ</div>
          <div className="text-xl font-bold text-red-700 mt-1 font-mono-num">
            {formatInt(pendingCount)} รายการ
          </div>
          <div className="text-[11px] text-slate-500 mt-1">รอสั่งจ้าง / อนุมัติซ่อม</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">กำลังดำเนินการ</div>
          <div className="text-xl font-bold text-amber-700 mt-1 font-mono-num">
            {formatInt(activeCount)} รายการ
          </div>
          <div className="text-[11px] text-slate-500 mt-1">อยู่ระหว่างรออะไหล่ / ช่างซ่อม</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">ซ่อมบำรุงแล้วเสร็จ</div>
          <div className="text-xl font-bold text-emerald-800 mt-1 font-mono-num">
            {formatInt(doneCount)} รายการ
          </div>
          <div className="text-[11px] text-slate-500 mt-1">กลับมาใช้งานปกติแล้ว</div>
        </div>
      </div>

      {/* Filter & Maintenance History Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหารหัสครุภัณฑ์, อาการซ่อม, ช่าง/บริษัท..."
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['ทั้งหมด', 'รอดำเนินการ', 'กำลังดำเนินการ', 'เสร็จสิ้น'] as const).map(
              (st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              )
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4 whitespace-nowrap">วันที่</th>
                <th className="py-3 px-4">ครุภัณฑ์</th>
                <th className="py-3 px-4">ประเภทงาน / รายละเอียด</th>
                <th className="py-3 px-4">ผู้ดำเนินการ</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">ค่าใช้จ่าย</th>
                <th className="py-3 px-4 whitespace-nowrap">กำหนดถัดไป</th>
                <th className="py-3 px-4 whitespace-nowrap">สถานะ</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    ยังไม่มีรายการประวัติซ่อมบำรุงที่ตรงกับตัวกรอง
                  </td>
                </tr>
              ) : (
                filtered.map((rec) => {
                  const asset = assetMap.get(rec.assetId);
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 align-top whitespace-nowrap font-mono-num text-slate-700">
                        {formatThaiDate(rec.date)}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="font-medium text-slate-900">
                          {asset?.name || 'ไม่พบครุภัณฑ์'}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-num">
                          {asset?.assetCode || rec.assetId} · {asset?.location || '-'}
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top max-w-xs">
                        <div className="font-medium text-slate-800">{rec.type}</div>
                        <div className="text-slate-600 mt-0.5">{rec.description}</div>
                      </td>
                      <td className="py-3 px-4 align-top text-slate-700">
                        <div>{rec.vendorOrTechnician}</div>
                        <div className="text-[11px] text-slate-400">
                          {rec.fundingSource}
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top text-right font-mono-num font-medium text-slate-900 whitespace-nowrap">
                        {formatTHB(rec.cost)}
                      </td>
                      <td className="py-3 px-4 align-top whitespace-nowrap text-slate-600">
                        {rec.nextDueDate ? formatThaiDate(rec.nextDueDate) : '-'}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <MaintenanceStatusLabel status={rec.status} />
                      </td>
                      <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {rec.status !== 'เสร็จสิ้น' && (
                            <button
                              type="button"
                              onClick={() =>
                                onQuickStatusChange(rec.id, 'เสร็จสิ้น')
                              }
                              className="px-2 py-1 text-[11px] font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100"
                            >
                              ปิดงาน
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onEditMaintenance(rec)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded"
                            title="แก้ไข"
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
          </table>
        </div>
      </div>

      {/* Preventive Maintenance / Calibration Schedule Queue */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">
            ตารางนัดหมายบำรุงรักษาเชิงป้องกันและสอบเทียบครุภัณฑ์ (PM / Calibration)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-4">กำหนดนัดหมาย</th>
                <th className="py-2.5 px-4">รหัสครุภัณฑ์</th>
                <th className="py-2.5 px-4">รายการครุภัณฑ์</th>
                <th className="py-2.5 px-4">สถานที่</th>
                <th className="py-2.5 px-4">ผู้รับผิดชอบ</th>
                <th className="py-2.5 px-4 text-right">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {upcomingSchedule.map((asset) => (
                <tr key={asset.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono-num font-medium text-slate-900 whitespace-nowrap">
                    {formatThaiDate(asset.nextMaintenanceDate)}
                  </td>
                  <td className="py-2.5 px-4 font-mono-num text-slate-600 whitespace-nowrap">
                    {asset.assetCode}
                  </td>
                  <td className="py-2.5 px-4 font-medium text-slate-900">
                    {asset.name}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">{asset.location}</td>
                  <td className="py-2.5 px-4 text-slate-600">
                    {asset.responsiblePerson}
                  </td>
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onAddMaintenance(asset.id)}
                      className="px-2.5 py-1 text-[11px] font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100"
                    >
                      + บันทึกผล PM
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
