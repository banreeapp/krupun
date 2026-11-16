import { useMemo } from 'react';
import { Printer } from 'lucide-react';
import {
  AgencySettings,
  AssetItem,
  MaintenanceRecord,
  ReferenceConfig,
} from '../types/asset';
import {
  calculateAssetDepreciation,
  formatInt,
  formatTHB,
  getFiscalYearWindow,
} from '../utils/depreciation';

interface BudgetSummaryViewProps {
  settings: AgencySettings;
  reference: ReferenceConfig;
  assets: AssetItem[];
  maintenance: MaintenanceRecord[];
}

export function BudgetSummaryView({
  settings,
  reference,
  assets,
  maintenance,
}: BudgetSummaryViewProps) {
  const fyWindow = getFiscalYearWindow(settings.fiscalYear);

  const summary = useMemo(() => {
    const activeAssets = assets.filter((a) => a.status !== 'จำหน่ายแล้ว');
    let totalCost = 0;
    let totalAccumDep = 0;
    let totalThisYearDep = 0;
    let totalNBV = 0;
    let currentFYCapitalSpend = 0;

    for (const asset of activeAssets) {
      const cat = reference.categories.find(
        (c) => c.apcCode === asset.categoryCode
      );
      const dep = calculateAssetDepreciation(asset, settings, cat);
      totalCost += asset.cost;
      totalAccumDep += dep.accumulatedDep;
      totalThisYearDep += dep.thisYearDep;
      totalNBV += dep.netBookValue;
      if (dep.isAcquiredInCurrentFY) {
        currentFYCapitalSpend += asset.cost;
      }
    }

    const totalMaintSpend = maintenance.reduce((s, m) => s + m.cost, 0);
    const pendingMaintCost = maintenance
      .filter((m) => m.status !== 'เสร็จสิ้น')
      .reduce((s, m) => s + m.cost, 0);

    // By Category
    const catMap = new Map<
      string,
      {
        apcCode: string;
        name: string;
        count: number;
        cost: number;
        nbv: number;
        thisYearDep: number;
        maintCost: number;
      }
    >();

    for (const asset of activeAssets) {
      const cat = reference.categories.find(
        (c) => c.apcCode === asset.categoryCode
      );
      const dep = calculateAssetDepreciation(asset, settings, cat);
      const key = asset.categoryCode;
      const existing = catMap.get(key) || {
        apcCode: key,
        name: cat?.name || key,
        count: 0,
        cost: 0,
        nbv: 0,
        thisYearDep: 0,
        maintCost: 0,
      };
      existing.count += 1;
      existing.cost += asset.cost;
      existing.nbv += dep.netBookValue;
      existing.thisYearDep += dep.thisYearDep;
      catMap.set(key, existing);
    }

    for (const m of maintenance) {
      const asset = assets.find((a) => a.id === m.assetId);
      if (!asset) continue;
      const entry = catMap.get(asset.categoryCode);
      if (entry) {
        entry.maintCost += m.cost;
      }
    }

    const byCategory = Array.from(catMap.values()).sort(
      (a, b) => b.cost - a.cost
    );

    // By Location
    const locMap = new Map<
      string,
      { location: string; count: number; cost: number; nbv: number; maintCost: number }
    >();

    for (const asset of activeAssets) {
      const cat = reference.categories.find(
        (c) => c.apcCode === asset.categoryCode
      );
      const dep = calculateAssetDepreciation(asset, settings, cat);
      const loc = asset.location || 'ไม่ระบุสถานที่';
      const existing = locMap.get(loc) || {
        location: loc,
        count: 0,
        cost: 0,
        nbv: 0,
        maintCost: 0,
      };
      existing.count += 1;
      existing.cost += asset.cost;
      existing.nbv += dep.netBookValue;
      locMap.set(loc, existing);
    }

    for (const m of maintenance) {
      const asset = assets.find((a) => a.id === m.assetId);
      if (!asset) continue;
      const entry = locMap.get(asset.location || 'ไม่ระบุสถานที่');
      if (entry) entry.maintCost += m.cost;
    }

    const byLocation = Array.from(locMap.values()).sort(
      (a, b) => b.cost - a.cost
    );

    // By Funding Source
    const byFunding = reference.fundingSources.map((fs) => {
      const fsAssets = activeAssets.filter((a) => a.fundingSource === fs);
      const capTotal = fsAssets.reduce((s, a) => s + a.cost, 0);
      const capCurrentFY = fsAssets
        .filter((a) => {
          const cat = reference.categories.find(
            (c) => c.apcCode === a.categoryCode
          );
          return calculateAssetDepreciation(a, settings, cat)
            .isAcquiredInCurrentFY;
        })
        .reduce((s, a) => s + a.cost, 0);
      const maintCost = maintenance
        .filter((m) => m.fundingSource === fs)
        .reduce((s, m) => s + m.cost, 0);
      return {
        fundingSource: fs,
        assetCount: fsAssets.length,
        capTotal,
        capCurrentFY,
        maintCost,
      };
    });

    return {
      activeCount: activeAssets.length,
      totalCost,
      totalAccumDep,
      totalThisYearDep,
      totalNBV,
      currentFYCapitalSpend,
      totalMaintSpend,
      pendingMaintCost,
      byCategory,
      byLocation,
      byFunding,
    };
  }, [assets, maintenance, reference, settings]);

  const capitalUsagePct =
    settings.annualCapitalBudget > 0
      ? Math.min(
          100,
          Math.round(
            (summary.currentFYCapitalSpend / settings.annualCapitalBudget) * 100
          )
        )
      : 0;

  const maintUsagePct =
    settings.annualMaintenanceBudget > 0
      ? Math.min(
          100,
          Math.round(
            (summary.totalMaintSpend / settings.annualMaintenanceBudget) * 100
          )
        )
      : 0;

  const maxCatCost = Math.max(1, ...summary.byCategory.map((c) => c.cost));
  const maxLocMaint = Math.max(
    1,
    ...summary.byLocation.map((l) => l.maintCost),
    1000
  );

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            รายงานสรุปงบประมาณและสินทรัพย์แบบเรียลไทม์
          </h1>
          <p className="text-xs text-slate-500">
            {settings.agencyName} · ปีงบประมาณ {settings.fiscalYear} ({fyWindow.labelShort})
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 whitespace-nowrap shrink-0"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>พิมพ์รายงานสรุปงบประมาณ (A4)</span>
        </button>
      </div>

      {/* Real-Time Budget Execution Progress Bars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-slate-500">
                งบลงทุนจัดซื้อครุภัณฑ์ ปีงบประมาณ {settings.fiscalYear}
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1 font-mono-num">
                {formatTHB(summary.currentFYCapitalSpend)}{' '}
                <span className="text-xs font-normal text-slate-500">
                  / {formatTHB(settings.annualCapitalBudget)} บาท
                </span>
              </div>
            </div>
            <span className="text-sm font-semibold text-emerald-900 font-mono-num">
              {capitalUsagePct}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-800 rounded-full transition-all"
              style={{ width: `${capitalUsagePct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500 font-mono-num">
            <span>
              คงเหลือ:{' '}
              {formatTHB(
                Math.max(0, settings.annualCapitalBudget - summary.currentFYCapitalSpend)
              )}{' '}
              บาท
            </span>
            <span>มูลค่าสินทรัพย์คงอยู่รวม {formatTHB(summary.totalCost)} บาท</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-slate-500">
                งบซ่อมบำรุงรักษาและสอบเทียบครุภัณฑ์
              </div>
              <div className="text-xl font-bold text-slate-900 mt-1 font-mono-num">
                {formatTHB(summary.totalMaintSpend)}{' '}
                <span className="text-xs font-normal text-slate-500">
                  / {formatTHB(settings.annualMaintenanceBudget)} บาท
                </span>
              </div>
            </div>
            <span
              className={`text-sm font-semibold font-mono-num ${
                maintUsagePct >= 85 ? 'text-amber-700' : 'text-emerald-900'
              }`}
            >
              {maintUsagePct}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                maintUsagePct >= 85 ? 'bg-amber-600' : 'bg-emerald-700'
              }`}
              style={{ width: `${maintUsagePct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500 font-mono-num">
            <span>
              คงเหลือ:{' '}
              {formatTHB(
                Math.max(0, settings.annualMaintenanceBudget - summary.totalMaintSpend)
              )}{' '}
              บาท
            </span>
            <span>อยู่ระหว่างดำเนินการ {formatTHB(summary.pendingMaintCost)} บาท</span>
          </div>
        </div>
      </div>

      {/* Visual Chart Section: Category Cost vs Net Book Value + Maintenance Spend by Location */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                กราฟเปรียบเทียบราคาทุน vs มูลค่าสุทธิตามประเภทครุภัณฑ์
              </h2>
              <p className="text-xs text-slate-500">
                แถบสีเข้ม = ราคาทุนคงอยู่ · แถบสีเขียว = มูลค่าสุทธิ (NBV)
              </p>
            </div>
          </div>

          <div className="space-y-3.5">
            {summary.byCategory.map((cat) => {
              const costPct = Math.max(2, Math.round((cat.cost / maxCatCost) * 100));
              const nbvPct = Math.max(
                cat.nbv > 0 ? 1 : 0,
                Math.round((cat.nbv / maxCatCost) * 100)
              );
              return (
                <div key={cat.apcCode} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800 truncate pr-2">
                      {cat.name} ({formatInt(cat.count)} รายการ)
                    </span>
                    <span className="font-mono-num text-slate-600 shrink-0">
                      ทุน {formatTHB(cat.cost)} · สุทธิ {formatTHB(cat.nbv)} ฿
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="w-full h-2 bg-slate-100 rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-slate-700 rounded-sm"
                        style={{ width: `${costPct}%` }}
                      />
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-emerald-700 rounded-sm"
                        style={{ width: `${nbvPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            สัดส่วนค่าซ่อมบำรุงและมูลค่าทรัพย์สินตามสถานที่/ห้อง
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            วิเคราะห์ค่าใช้จ่ายซ่อมบำรุงแยกตามจุดให้บริการ
          </p>

          <div className="space-y-3">
            {summary.byLocation.map((loc) => {
              const maintPct = Math.round((loc.maintCost / maxLocMaint) * 100);
              return (
                <div
                  key={loc.location}
                  className="border-b border-slate-100 pb-2.5 last:border-0 last:pb-0"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800">
                      {loc.location}
                    </span>
                    <span className="text-slate-500">
                      {formatInt(loc.count)} รายการ
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-0.5 font-mono-num">
                    <span>มูลค่าทุน: {formatTHB(loc.cost)} ฿</span>
                    <span className="text-amber-700 font-medium">
                      ค่าซ่อม: {formatTHB(loc.maintCost)} ฿
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1.5">
                    <div
                      className="h-full bg-amber-600 rounded-full"
                      style={{ width: `${maintPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Funding Source Breakdown Table */}
      <div className="print-surface bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">
            สรุปงบประมาณจำแนกตามแหล่งเงิน (งบจัดซื้อครุภัณฑ์ + งบซ่อมบำรุง)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                <th className="py-3 px-4">แหล่งเงินงบประมาณ</th>
                <th className="py-3 px-4 text-right">จำนวนครุภัณฑ์</th>
                <th className="py-3 px-4 text-right">จัดซื้อปี {settings.fiscalYear} (บาท)</th>
                <th className="py-3 px-4 text-right">มูลค่าครุภัณฑ์สะสม (บาท)</th>
                <th className="py-3 px-4 text-right">ค่าซ่อมบำรุง (บาท)</th>
                <th className="py-3 px-4 text-right">รวมใช้จ่ายทั้งสิ้น (บาท)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {summary.byFunding.map((row) => (
                <tr key={row.fundingSource} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-medium text-slate-900">
                    {row.fundingSource}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono-num">
                    {formatInt(row.assetCount)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono-num">
                    {formatTHB(row.capCurrentFY)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono-num">
                    {formatTHB(row.capTotal)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono-num">
                    {formatTHB(row.maintCost)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono-num font-semibold text-emerald-900">
                    {formatTHB(row.capTotal + row.maintCost)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-300 font-semibold text-slate-900">
                <td className="py-3 px-4">รวมทุกแหล่งเงิน</td>
                <td className="py-3 px-4 text-right font-mono-num">
                  {formatInt(summary.activeCount)}
                </td>
                <td className="py-3 px-4 text-right font-mono-num">
                  {formatTHB(summary.currentFYCapitalSpend)}
                </td>
                <td className="py-3 px-4 text-right font-mono-num">
                  {formatTHB(summary.totalCost)}
                </td>
                <td className="py-3 px-4 text-right font-mono-num">
                  {formatTHB(summary.totalMaintSpend)}
                </td>
                <td className="py-3 px-4 text-right font-mono-num text-emerald-900">
                  {formatTHB(summary.totalCost + summary.totalMaintSpend)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
