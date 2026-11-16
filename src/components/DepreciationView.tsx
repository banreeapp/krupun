import { useMemo, useState } from 'react';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { AgencySettings, AssetItem, ReferenceConfig } from '../types/asset';
import {
  calculateAssetDepreciation,
  formatThaiDate,
  formatTHB,
  getFiscalYearWindow,
} from '../utils/depreciation';
import { exportDepreciationExcel } from '../utils/excelExport';

interface DepreciationViewProps {
  settings: AgencySettings;
  reference: ReferenceConfig;
  assets: AssetItem[];
}

export function DepreciationView({
  settings,
  reference,
  assets,
}: DepreciationViewProps) {
  const [filterMode, setFilterMode] = useState<'all' | 'depreciable' | 'exempt'>(
    'all'
  );
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const fyWindow = getFiscalYearWindow(settings.fiscalYear);

  const rows = useMemo(() => {
    return assets
      .filter((a) => !calculateAssetDepreciation(a, settings, reference.categories.find((c) => c.apcCode === a.categoryCode)).isDisposedPriorFY)
      .map((asset) => {
        const cat = reference.categories.find(
          (c) => c.apcCode === asset.categoryCode
        );
        const dep = calculateAssetDepreciation(asset, settings, cat);
        return { asset, cat, dep };
      })
      .filter(({ asset, dep }) => {
        if (categoryFilter !== 'ALL' && asset.categoryCode !== categoryFilter)
          return false;
        if (filterMode === 'depreciable' && !dep.isDepreciable) return false;
        if (filterMode === 'exempt' && dep.isDepreciable) return false;
        return true;
      });
  }, [assets, reference.categories, settings, filterMode, categoryFilter]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, { asset, dep }) => ({
        cost: acc.cost + asset.cost,
        annualRate: acc.annualRate + dep.annualRate,
        bf: acc.bf + dep.broughtForwardDep,
        thisYear: acc.thisYear + dep.thisYearDep,
        accum: acc.accum + dep.accumulatedDep,
        nbv: acc.nbv + dep.netBookValue,
      }),
      { cost: 0, annualRate: 0, bf: 0, thisYear: 0, accum: 0, nbv: 0 }
    );
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'all', label: 'ทั้งหมด' },
                { id: 'depreciable', label: 'เฉพาะรายการคิดค่าเสื่อม' },
                { id: 'exempt', label: 'ต่ำกว่าเกณฑ์/ไม่คิดค่าเสื่อม' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilterMode(opt.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  filterMode === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="ALL">ประเภทครุภัณฑ์ทั้งหมด</option>
            {reference.categories.map((c) => (
              <option key={c.apcCode} value={c.apcCode}>
                {c.apcCode} · {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              exportDepreciationExcel({
                settings,
                reference,
                assets: rows.map((r) => r.asset),
              })
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>ส่งออก Excel (.xlsx)</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>พิมพ์รายงานค่าเสื่อมราคา (A4)</span>
          </button>
        </div>
      </div>

      {/* Printable Report */}
      <div className="print-surface bg-white border border-slate-200 rounded-xl p-6 font-sarabun">
        <div className="text-center mb-5">
          <h2 className="text-lg font-bold text-slate-900">
            รายงานค่าเสื่อมราคาทรัพย์สินถาวร ประจำปีงบประมาณ {settings.fiscalYear}
          </h2>
          <p className="text-sm text-slate-700">
            หน่วยงาน: {settings.agencyName} · งวดบัญชี {fyWindow.labelShort}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-slate-400 text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-900">
                <th className="border border-slate-400 py-2 px-2 text-center">ที่</th>
                <th className="border border-slate-400 py-2 px-2.5 text-left">รหัสครุภัณฑ์</th>
                <th className="border border-slate-400 py-2 px-2.5 text-left">รายการครุภัณฑ์</th>
                <th className="border border-slate-400 py-2 px-2 text-center">วันที่ได้มา</th>
                <th className="border border-slate-400 py-2 px-2 text-right">ราคาทุน</th>
                <th className="border border-slate-400 py-2 px-2 text-center">อายุ</th>
                <th className="border border-slate-400 py-2 px-2 text-right">ค่าเสื่อมต่อปี</th>
                <th className="border border-slate-400 py-2 px-2 text-right">ค่าเสื่อมยกมา</th>
                <th className="border border-slate-400 py-2 px-2 text-right">ค่าเสื่อมปีนี้</th>
                <th className="border border-slate-400 py-2 px-2 text-right">ค่าเสื่อมสะสม</th>
                <th className="border border-slate-400 py-2 px-2 text-right">มูลค่าสุทธิ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ asset, dep }, idx) => (
                <tr key={asset.id} className="hover:bg-slate-50">
                  <td className="border border-slate-400 py-1.5 px-2 text-center font-mono-num">
                    {idx + 1}
                  </td>
                  <td className="border border-slate-400 py-1.5 px-2.5 font-mono-num whitespace-nowrap">
                    {asset.assetCode}
                  </td>
                  <td className="border border-slate-400 py-1.5 px-2.5">
                    <div>{asset.name}</div>
                    {!dep.isDepreciable && (
                      <div className="text-[11px] text-slate-500">
                        ({dep.nonDepreciableReason})
                      </div>
                    )}
                  </td>
                  <td className="border border-slate-400 py-1.5 px-2 text-center whitespace-nowrap">
                    {formatThaiDate(asset.acquisitionDate)}
                  </td>
                  <td className="border border-slate-400 py-1.5 px-2 text-right font-mono-num">
                    {formatTHB(asset.cost)}
                  </td>
                  <td className="border border-slate-400 py-1.5 px-2 text-center font-mono-num">
                    {asset.usefulLifeYears}
                  </td>
                  <td className="border border-slate-400 py-1.5 px-2 text-right font-mono-num">
                    {formatTHB(dep.annualRate)}
                  </td>
                  <td className="border border-slate-400 py-1.5 px-2 text-right font-mono-num">
                    {formatTHB(dep.broughtForwardDep)}
                  </td>
                  <td className="border border-slate-400 py-1.5 px-2 text-right font-mono-num">
                    {formatTHB(dep.thisYearDep)}
                  </td>
                  <td className="border border-slate-400 py-1.5 px-2 text-right font-mono-num">
                    {formatTHB(dep.accumulatedDep)}
                  </td>
                  <td className="border border-slate-400 py-1.5 px-2 text-right font-mono-num font-semibold">
                    {formatTHB(dep.netBookValue)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold text-slate-900">
                <td colSpan={4} className="border border-slate-400 py-2 px-3 text-right">
                  รวมทั้งสิ้น ({rows.length} รายการ)
                </td>
                <td className="border border-slate-400 py-2 px-2 text-right font-mono-num">
                  {formatTHB(totals.cost)}
                </td>
                <td className="border border-slate-400 py-2 px-2 text-center">-</td>
                <td className="border border-slate-400 py-2 px-2 text-right font-mono-num">
                  {formatTHB(totals.annualRate)}
                </td>
                <td className="border border-slate-400 py-2 px-2 text-right font-mono-num">
                  {formatTHB(totals.bf)}
                </td>
                <td className="border border-slate-400 py-2 px-2 text-right font-mono-num">
                  {formatTHB(totals.thisYear)}
                </td>
                <td className="border border-slate-400 py-2 px-2 text-right font-mono-num">
                  {formatTHB(totals.accum)}
                </td>
                <td className="border border-slate-400 py-2 px-2 text-right font-mono-num">
                  {formatTHB(totals.nbv)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="grid grid-cols-3 gap-6 pt-8 text-center text-xs text-slate-800">
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
