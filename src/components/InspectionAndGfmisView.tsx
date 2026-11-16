import { useMemo, useState } from 'react';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { AgencySettings, AssetItem, ReferenceConfig } from '../types/asset';
import {
  calculateAssetDepreciation,
  formatInt,
  formatThaiDate,
  formatThaiDateLong,
  formatTHB,
  getFiscalYearWindow,
} from '../utils/depreciation';
import {
  BelowThresholdDetailRow,
  Doc6MovementRow,
  Doc6Totals,
  exportDoc6Excel,
  exportGfmisDoc5Excel,
} from '../utils/excelExport';

interface InspectionAndGfmisViewProps {
  settings: AgencySettings;
  reference: ReferenceConfig;
  assets: AssetItem[];
}

type DocTab = 'asset6_below' | 'asset6' | 'gfmis5' | 'memo213';

function computeDoc6Movement(
  assets: AssetItem[],
  reference: ReferenceConfig,
  settings: AgencySettings,
  filterFn: (a: AssetItem) => boolean
): { rows: Doc6MovementRow[]; totals: Doc6Totals } {
  const equipmentCats = reference.categories.filter(
    (c) => !c.isBuilding && !c.isLand
  );

  const rows: Doc6MovementRow[] = equipmentCats.map((cat) => {
    const catAssets = assets.filter(
      (a) => a.categoryCode === cat.apcCode && filterFn(a)
    );

    let broughtForward = 0;
    let incPurchase = 0;
    let incDonate = 0;
    let incTransfer = 0;
    let incAdjust = 0;
    let decDisposed = 0;
    let decAdjust = 0;
    let endNBV = 0;

    for (const a of catAssets) {
      const dep = calculateAssetDepreciation(a, settings, cat);
      if (dep.isDisposedPriorFY) continue;

      if (dep.isAcquiredInCurrentFY) {
        if (a.acquisitionMethod === 'ซื้อ') incPurchase += a.cost;
        else if (a.acquisitionMethod === 'รับบริจาค') incDonate += a.cost;
        else if (a.acquisitionMethod === 'รับโอน') incTransfer += a.cost;
        else incAdjust += a.cost;
      } else {
        broughtForward += a.cost;
      }

      if (dep.isDisposedInCurrentFY) {
        decDisposed += a.cost;
      } else {
        endNBV += dep.netBookValue;
      }
    }

    const endCost =
      broughtForward +
      incPurchase +
      incDonate +
      incTransfer +
      incAdjust -
      decDisposed -
      decAdjust;

    return {
      cat,
      broughtForward,
      incPurchase,
      incDonate,
      incTransfer,
      incAdjust,
      decDisposed,
      decAdjust,
      endCost,
      endNBV,
    };
  });

  const totals = rows.reduce<Doc6Totals>(
    (acc, r) => ({
      bf: acc.bf + r.broughtForward,
      p: acc.p + r.incPurchase,
      d: acc.d + r.incDonate,
      t: acc.t + r.incTransfer,
      ia: acc.ia + r.incAdjust,
      dd: acc.dd + r.decDisposed,
      da: acc.da + r.decAdjust,
      ec: acc.ec + r.endCost,
      nbv: acc.nbv + r.endNBV,
    }),
    { bf: 0, p: 0, d: 0, t: 0, ia: 0, dd: 0, da: 0, ec: 0, nbv: 0 }
  );

  return { rows, totals };
}

export function InspectionAndGfmisView({
  settings,
  reference,
  assets,
}: InspectionAndGfmisViewProps) {
  const [docTab, setDocTab] = useState<DocTab>('asset6_below');
  const [gfmisOverrides, setGfmisOverrides] = useState<Record<string, number>>({});
  const [includeBelowDetailInPrint, setIncludeBelowDetailInPrint] =
    useState(true);

  const fyWindow = getFiscalYearWindow(settings.fiscalYear);

  // Statistics for Memo 213
  const stats = useMemo(() => {
    const active = assets.filter((a) => a.status !== 'จำหน่ายแล้ว');
    const normal = assets.filter((a) => a.status === 'ใช้งานปกติ');
    const repairing = assets.filter(
      (a) => a.status === 'รอซ่อม' || a.status === 'อยู่ระหว่างซ่อม'
    );
    const damaged = assets.filter((a) => a.status === 'ชำรุดรอจำหน่าย');
    const lost = assets.filter((a) => a.status === 'สูญหาย');
    const disposed = assets.filter((a) => a.status === 'จำหน่ายแล้ว');

    let activeCost = 0;
    let activeNBV = 0;
    for (const a of active) {
      const cat = reference.categories.find((c) => c.apcCode === a.categoryCode);
      const dep = calculateAssetDepreciation(a, settings, cat);
      activeCost += a.cost;
      activeNBV += dep.netBookValue;
    }

    return {
      active,
      normal,
      repairing,
      damaged,
      lost,
      disposed,
      activeCost,
      activeNBV,
    };
  }, [assets, reference.categories, settings]);

  // Doc 5: New GFMIS Thai Reconciliation across all APC categories
  const gfmisRows = useMemo(() => {
    return reference.categories.map((cat) => {
      const catAssets = assets.filter(
        (a) =>
          a.categoryCode === cat.apcCode &&
          a.status !== 'จำหน่ายแล้ว' &&
          a.cost >= settings.minDepreciationCost
      );
      const registryCost = catAssets.reduce((s, a) => s + a.cost, 0);
      const defaultGfmisCost = catAssets.reduce(
        (s, a) => s + (a.gfmisRecordedCost ?? a.cost),
        0
      );
      const gfmisCost =
        gfmisOverrides[cat.apcCode] !== undefined
          ? gfmisOverrides[cat.apcCode]
          : defaultGfmisCost;

      const accumDep = catAssets.reduce(
        (s, a) =>
          s + calculateAssetDepreciation(a, settings, cat).accumulatedDep,
        0
      );
      const nbv = catAssets.reduce(
        (s, a) => s + calculateAssetDepreciation(a, settings, cat).netBookValue,
        0
      );
      const diff = gfmisCost - registryCost;

      return {
        cat,
        gfmisCost,
        accumDep,
        nbv,
        registryCost,
        diff,
      };
    });
  }, [assets, reference.categories, settings, gfmisOverrides]);

  const gfmisTotals = useMemo(() => {
    return gfmisRows.reduce(
      (acc, r) => ({
        gfmisCost: acc.gfmisCost + r.gfmisCost,
        accumDep: acc.accumDep + r.accumDep,
        nbv: acc.nbv + r.nbv,
        registryCost: acc.registryCost + r.registryCost,
        diff: acc.diff + r.diff,
      }),
      { gfmisCost: 0, accumDep: 0, nbv: 0, registryCost: 0, diff: 0 }
    );
  }, [gfmisRows]);

  // Doc 6 (Standard >= minDepreciationCost)
  const doc6Standard = useMemo(
    () =>
      computeDoc6Movement(
        assets,
        reference,
        settings,
        (a) => a.cost >= settings.minDepreciationCost
      ),
    [assets, reference, settings]
  );

  // Doc 6 (Below-Threshold < minDepreciationCost)
  const doc6Below = useMemo(
    () =>
      computeDoc6Movement(
        assets,
        reference,
        settings,
        (a) => a.cost < settings.minDepreciationCost
      ),
    [assets, reference, settings]
  );

  // Itemized below-threshold details for Sheet 2 & bottom breakdown table
  const belowDetailRows = useMemo<BelowThresholdDetailRow[]>(() => {
    const result: BelowThresholdDetailRow[] = [];
    for (const asset of assets) {
      if (asset.cost >= settings.minDepreciationCost) continue;
      const cat = reference.categories.find(
        (c) => c.apcCode === asset.categoryCode
      );
      const dep = calculateAssetDepreciation(asset, settings, cat);
      if (dep.isDisposedPriorFY) continue;

      let broughtForward = 0;
      let incPurchase = 0;
      let incDonate = 0;
      let incTransfer = 0;
      let incAdjust = 0;
      let decDisposed = 0;

      if (dep.isAcquiredInCurrentFY) {
        if (asset.acquisitionMethod === 'ซื้อ') incPurchase = asset.cost;
        else if (asset.acquisitionMethod === 'รับบริจาค') incDonate = asset.cost;
        else if (asset.acquisitionMethod === 'รับโอน') incTransfer = asset.cost;
        else incAdjust = asset.cost;
      } else {
        broughtForward = asset.cost;
      }

      if (dep.isDisposedInCurrentFY) {
        decDisposed = asset.cost;
      }

      const endCost =
        broughtForward +
        incPurchase +
        incDonate +
        incTransfer +
        incAdjust -
        decDisposed;

      result.push({
        asset,
        categoryName: cat?.name || asset.categoryCode,
        broughtForward,
        incPurchase,
        incDonate,
        incTransfer,
        incAdjust,
        decDisposed,
        endCost,
      });
    }
    return result;
  }, [assets, reference.categories, settings]);

  const handleExportExcel = () => {
    if (docTab === 'asset6_below') {
      exportDoc6Excel({
        mode: 'below_threshold',
        settings,
        rows: doc6Below.rows,
        totals: doc6Below.totals,
        detailRows: belowDetailRows,
      });
    } else if (docTab === 'asset6') {
      exportDoc6Excel({
        mode: 'standard',
        settings,
        rows: doc6Standard.rows,
        totals: doc6Standard.totals,
      });
    } else if (docTab === 'gfmis5') {
      exportGfmisDoc5Excel({
        settings,
        rows: gfmisRows,
        totals: gfmisTotals,
      });
    }
  };

  const renderDoc6Table = (
    data: { rows: Doc6MovementRow[]; totals: Doc6Totals },
    isBelowThreshold: boolean
  ) => (
    <div className="print-surface bg-white border border-slate-200 rounded-xl p-6 font-sarabun">
      <div className="flex justify-end text-xs font-semibold text-sky-700 mb-1">
        เอกสารหมายเลข 6
      </div>
      <div className="text-center mb-4">
        <h2 className="text-base font-bold text-slate-900">
          รายงานมูลค่าบัญชีสินทรัพย์{' '}
          <span className={isBelowThreshold ? 'text-red-700' : ''}>
            {isBelowThreshold
              ? `(เฉพาะครุภัณฑ์ที่ต่ำกว่าเกณฑ์ ${formatTHB(settings.minDepreciationCost)} บาท ไม่คิดค่าเสื่อมราคา)`
              : `(ครุภัณฑ์ตามเกณฑ์ ตั้งแต่ ${formatTHB(settings.minDepreciationCost)} บาทขึ้นไป)`}
          </span>
        </h2>
        <p className="text-sm text-slate-800 mt-0.5">
          หน่วยงาน {settings.agencyName} · {settings.department}
        </p>
        <p className="text-xs text-slate-600 mt-0.5">
          หน่วยเบิกจ่าย {settings.disbursementUnit} · ประจำปีงบประมาณ{' '}
          {settings.fiscalYear} ({fyWindow.labelShort})
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-slate-700 text-[11px]">
          <thead>
            <tr>
              <th
                rowSpan={3}
                className="border border-slate-700 py-2 px-2 text-center bg-white"
              >
                รหัสบัญชี
              </th>
              <th
                rowSpan={3}
                className="border border-slate-700 py-2 px-2 text-left min-w-[175px] bg-white"
              >
                ชื่อบัญชี
              </th>
              <th
                colSpan={8}
                className="border border-slate-700 py-1.5 px-2 text-center bg-sky-700 text-white"
              >
                ราคาทุน
              </th>
              <th
                rowSpan={3}
                className="border border-slate-700 py-2 px-2 text-right bg-purple-100 text-slate-900"
              >
                มูลค่าตามบัญชี (สินทรัพย์สุทธิ)
              </th>
            </tr>
            <tr>
              <th
                rowSpan={2}
                className="border border-slate-700 py-1.5 px-2 text-right bg-slate-200 text-slate-900"
              >
                ราคาทุนยกมา ({fyWindow.labelShort.split('–')[0].trim()})
              </th>
              <th
                colSpan={4}
                className="border border-slate-700 py-1 px-2 text-center bg-emerald-700 text-white"
              >
                มูลค่าสินทรัพย์ที่เพิ่มขึ้น
              </th>
              <th
                colSpan={2}
                className="border border-slate-700 py-1 px-2 text-center bg-amber-300 text-slate-900"
              >
                การตัดจำหน่าย
              </th>
              <th
                rowSpan={2}
                className="border border-slate-700 py-1.5 px-2 text-right bg-slate-200 text-slate-900"
              >
                ราคาทุนยกไป (30 ก.ย. {String(settings.fiscalYear).slice(-2)})
              </th>
            </tr>
            <tr className="bg-amber-50 text-slate-900">
              <th className="border border-slate-700 py-1 px-1.5 text-right">
                ซื้อเพิ่ม
              </th>
              <th className="border border-slate-700 py-1 px-1.5 text-right">
                รับบริจาค
              </th>
              <th className="border border-slate-700 py-1 px-1.5 text-right">
                รับโอน
              </th>
              <th className="border border-slate-700 py-1 px-1.5 text-right">
                ปรับปรุงบัญชี
              </th>
              <th className="border border-slate-700 py-1 px-1.5 text-right">
                ขาย/โอน/ตัดจ่าย/สูญหาย
              </th>
              <th className="border border-slate-700 py-1 px-1.5 text-right">
                ปรับปรุงบัญชี
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-slate-50 font-semibold text-slate-900">
              <td className="border border-slate-700 py-1 px-2 font-mono-num">
                {isBelowThreshold ? '1206170101' : ''}
              </td>
              <td colSpan={10} className="border border-slate-700 py-1 px-2">
                {isBelowThreshold
                  ? 'ครุภัณฑ์ - Interface / ครุภัณฑ์ต่ำกว่าเกณฑ์จำแนกตามประเภท'
                  : 'ครุภัณฑ์ (ตามเกณฑ์คิดค่าเสื่อมราคา)'}
              </td>
            </tr>
            {data.rows.map((r) => (
              <tr key={r.cat.apcCode} className="hover:bg-slate-50/70">
                <td className="border border-slate-700 py-1 px-2 font-mono-num">
                  {isBelowThreshold ? (
                    <span className="text-slate-600">{r.cat.apcCode}</span>
                  ) : (
                    r.cat.apcCode
                  )}
                </td>
                <td
                  className={`border border-slate-700 py-1 px-2 ${
                    isBelowThreshold ? 'text-red-800' : 'text-slate-900'
                  }`}
                >
                  {r.cat.name}
                </td>
                <td className="border border-slate-700 py-1 px-1.5 text-right font-mono-num">
                  {r.broughtForward > 0 ? formatTHB(r.broughtForward) : '-'}
                </td>
                <td className="border border-slate-700 py-1 px-1.5 text-right font-mono-num">
                  {r.incPurchase > 0 ? formatTHB(r.incPurchase) : '-'}
                </td>
                <td className="border border-slate-700 py-1 px-1.5 text-right font-mono-num">
                  {r.incDonate > 0 ? formatTHB(r.incDonate) : '-'}
                </td>
                <td className="border border-slate-700 py-1 px-1.5 text-right font-mono-num">
                  {r.incTransfer > 0 ? formatTHB(r.incTransfer) : '-'}
                </td>
                <td className="border border-slate-700 py-1 px-1.5 text-right font-mono-num">
                  {r.incAdjust > 0 ? formatTHB(r.incAdjust) : '-'}
                </td>
                <td className="border border-slate-700 py-1 px-1.5 text-right font-mono-num">
                  {r.decDisposed > 0 ? formatTHB(r.decDisposed) : '-'}
                </td>
                <td className="border border-slate-700 py-1 px-1.5 text-right font-mono-num">
                  {r.decAdjust > 0 ? formatTHB(r.decAdjust) : '-'}
                </td>
                <td className="border border-slate-700 py-1 px-1.5 text-right font-mono-num font-semibold">
                  {r.endCost > 0 ? formatTHB(r.endCost) : '-'}
                </td>
                <td className="border border-slate-700 py-1 px-1.5 text-right font-mono-num font-semibold">
                  {r.endNBV > 0 ? formatTHB(r.endNBV) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-200 font-bold text-slate-900">
              <td
                colSpan={2}
                className="border border-slate-700 py-2 px-2 text-right"
              >
                {isBelowThreshold
                  ? 'รวมครุภัณฑ์ต่ำกว่าเกณฑ์ทั้งสิ้น'
                  : 'รวมครุภัณฑ์ทั้งสิ้น'}
              </td>
              <td className="border border-slate-700 py-2 px-1.5 text-right font-mono-num">
                {formatTHB(data.totals.bf)}
              </td>
              <td className="border border-slate-700 py-2 px-1.5 text-right font-mono-num">
                {formatTHB(data.totals.p)}
              </td>
              <td className="border border-slate-700 py-2 px-1.5 text-right font-mono-num">
                {formatTHB(data.totals.d)}
              </td>
              <td className="border border-slate-700 py-2 px-1.5 text-right font-mono-num">
                {formatTHB(data.totals.t)}
              </td>
              <td className="border border-slate-700 py-2 px-1.5 text-right font-mono-num">
                {formatTHB(data.totals.ia)}
              </td>
              <td className="border border-slate-700 py-2 px-1.5 text-right font-mono-num">
                {formatTHB(data.totals.dd)}
              </td>
              <td className="border border-slate-700 py-2 px-1.5 text-right font-mono-num">
                {formatTHB(data.totals.da)}
              </td>
              <td className="border border-slate-700 py-2 px-1.5 text-right font-mono-num">
                {formatTHB(data.totals.ec)}
              </td>
              <td className="border border-slate-700 py-2 px-1.5 text-right font-mono-num">
                {formatTHB(data.totals.nbv)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Itemized Below-Threshold Schedule */}
      {isBelowThreshold && (
        <div
          className={`mt-6 ${
            includeBelowDetailInPrint ? '' : 'no-print'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="text-sm font-bold text-slate-900">
              บัญชีรายละเอียดครุภัณฑ์ต่ำกว่าเกณฑ์รายรายการ ({formatInt(belowDetailRows.length)} รายการ)
            </h3>
            <label className="no-print inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={includeBelowDetailInPrint}
                onChange={(e) => setIncludeBelowDetailInPrint(e.target.checked)}
                className="rounded border-slate-300 text-emerald-900"
              />
              <span>แนบท้ายตารางรายละเอียดเมื่อสั่งพิมพ์</span>
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-slate-700 text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-slate-900">
                  <th className="border border-slate-700 py-1.5 px-2 text-center">ที่</th>
                  <th className="border border-slate-700 py-1.5 px-2 text-left">รหัสครุภัณฑ์</th>
                  <th className="border border-slate-700 py-1.5 px-2 text-left">รายการครุภัณฑ์ / สถานที่</th>
                  <th className="border border-slate-700 py-1.5 px-2 text-left">ประเภท</th>
                  <th className="border border-slate-700 py-1.5 px-2 text-center">วันที่ได้มา</th>
                  <th className="border border-slate-700 py-1.5 px-2 text-center">วิธีได้มา</th>
                  <th className="border border-slate-700 py-1.5 px-2 text-right">ยกมา</th>
                  <th className="border border-slate-700 py-1.5 px-2 text-right">เพิ่มขึ้นปีนี้</th>
                  <th className="border border-slate-700 py-1.5 px-2 text-right">จำหน่าย/ลด</th>
                  <th className="border border-slate-700 py-1.5 px-2 text-right">ราคาทุนยกไป</th>
                </tr>
              </thead>
              <tbody>
                {belowDetailRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="border border-slate-700 py-4 text-center text-slate-500"
                    >
                      ไม่มีรายการครุภัณฑ์ต่ำกว่าเกณฑ์ในทะเบียน
                    </td>
                  </tr>
                ) : (
                  belowDetailRows.map((d, idx) => {
                    const addedThisYear =
                      d.incPurchase + d.incDonate + d.incTransfer + d.incAdjust;
                    return (
                      <tr key={d.asset.id}>
                        <td className="border border-slate-700 py-1 px-2 text-center font-mono-num">
                          {idx + 1}
                        </td>
                        <td className="border border-slate-700 py-1 px-2 font-mono-num whitespace-nowrap">
                          {d.asset.assetCode}
                        </td>
                        <td className="border border-slate-700 py-1 px-2">
                          <div className="font-medium text-slate-900">
                            {d.asset.name}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {d.asset.location} · {d.asset.status}
                          </div>
                        </td>
                        <td className="border border-slate-700 py-1 px-2">
                          {d.categoryName}
                        </td>
                        <td className="border border-slate-700 py-1 px-2 text-center whitespace-nowrap">
                          {formatThaiDate(d.asset.acquisitionDate)}
                        </td>
                        <td className="border border-slate-700 py-1 px-2 text-center">
                          {d.asset.acquisitionMethod}
                        </td>
                        <td className="border border-slate-700 py-1 px-2 text-right font-mono-num">
                          {d.broughtForward > 0 ? formatTHB(d.broughtForward) : '-'}
                        </td>
                        <td className="border border-slate-700 py-1 px-2 text-right font-mono-num">
                          {addedThisYear > 0 ? formatTHB(addedThisYear) : '-'}
                        </td>
                        <td className="border border-slate-700 py-1 px-2 text-right font-mono-num">
                          {d.decDisposed > 0 ? formatTHB(d.decDisposed) : '-'}
                        </td>
                        <td className="border border-slate-700 py-1 px-2 text-right font-mono-num font-semibold">
                          {d.endCost > 0 ? formatTHB(d.endCost) : '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Signatory Footer */}
      <div className="grid grid-cols-3 gap-6 pt-8 text-center text-xs text-slate-800">
        <div>
          <div>ลงชื่อ..............................................เจ้าหน้าที่พัสดุ (ผู้จัดทำ)</div>
          <div className="mt-1">({settings.preparer.name || '........................................'})</div>
          {settings.preparer.position.trim() && (
            <div className="text-slate-600">ตำแหน่ง {settings.preparer.position}</div>
          )}
        </div>
        <div>
          <div>ลงชื่อ..............................................หัวหน้าเจ้าหน้าที่ (ผู้รับรอง)</div>
          <div className="mt-1">({settings.verifier.name || '........................................'})</div>
          {settings.verifier.position.trim() && (
            <div className="text-slate-600">ตำแหน่ง {settings.verifier.position}</div>
          )}
        </div>
        <div>
          <div>ลงชื่อ..............................................หัวหน้าหน่วยงาน</div>
          <div className="mt-1">({settings.director.name || '........................................'})</div>
          {settings.director.position.trim() && (
            <div className="text-slate-600">ตำแหน่ง {settings.director.position}</div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="no-print flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setDocTab('asset6_below')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              docTab === 'asset6_below'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            เอกสารหมายเลข 6 (ครุภัณฑ์ต่ำกว่าเกณฑ์)
          </button>
          <button
            type="button"
            onClick={() => setDocTab('asset6')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              docTab === 'asset6'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            เอกสารหมายเลข 6 (ครุภัณฑ์ตามเกณฑ์)
          </button>
          <button
            type="button"
            onClick={() => setDocTab('gfmis5')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              docTab === 'gfmis5'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            เอกสารหมายเลข 5 (New GFMIS Thai)
          </button>
          <button
            type="button"
            onClick={() => setDocTab('memo213')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              docTab === 'memo213'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            บันทึกข้อความตรวจสอบพัสดุ (ข้อ 213)
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {docTab !== 'memo213' && (
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>ส่งออก Excel (.xlsx)</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>พิมพ์เอกสารรายงาน (A4)</span>
          </button>
        </div>
      </div>

      {/* Document 6: Below-Threshold Asset Value Report */}
      {docTab === 'asset6_below' && renderDoc6Table(doc6Below, true)}

      {/* Document 6: Standard Asset Value Report */}
      {docTab === 'asset6' && renderDoc6Table(doc6Standard, false)}

      {/* Document 5: New GFMIS Thai (Matches Image 4) */}
      {docTab === 'gfmis5' && (
        <div className="print-surface bg-white border border-slate-200 rounded-xl p-6 font-sarabun">
          <div className="flex justify-end text-xs font-semibold text-sky-700 mb-1">
            เอกสารหมายเลข 5
          </div>
          <div className="text-center mb-4">
            <h2 className="text-base font-bold text-slate-900">
              รายงานผลการตรวจสอบสินทรัพย์ถาวรในระบบ New GFMIS Thai
            </h2>
            <p className="text-sm text-slate-800">
              ข้อมูลสิ้นสุด ณ วันที่ 30 กันยายน {settings.fiscalYear}
            </p>
          </div>

          <div className="text-xs text-slate-800 space-y-1 mb-4">
            <div>
              <span className="font-semibold">รหัสหน่วยงาน :</span>{' '}
              <span className="font-mono-num">{settings.agencyCode}</span>
            </div>
            <div>
              <span className="font-semibold">หน่วยเบิกจ่าย :</span>{' '}
              {settings.agencyName} ({settings.disbursementUnit})
            </div>
            <div>
              <span className="font-semibold">วันที่รายงาน :</span>{' '}
              {formatThaiDateLong(settings.inspectionDate)}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-slate-700 text-xs">
              <thead>
                <tr>
                  <th
                    colSpan={7}
                    className="border border-slate-700 py-1.5 px-2 text-center text-red-700 font-bold bg-slate-50"
                  >
                    ข้อมูลสินทรัพย์จากรายงานในระบบ New GFMIS Thai
                  </th>
                  <th
                    rowSpan={2}
                    className="border border-slate-700 py-1.5 px-2 text-center bg-slate-50"
                  >
                    มูลค่าการได้มาตามทะเบียนคุมทรัพย์สิน (ราคาทุน) (2)
                  </th>
                  <th
                    rowSpan={2}
                    className="border border-slate-700 py-1.5 px-2 text-center bg-slate-50"
                  >
                    ผลต่าง (1) - (2)
                  </th>
                  <th
                    rowSpan={2}
                    className="border border-slate-700 py-1.5 px-2 text-center bg-slate-50"
                  >
                    หมายเหตุ
                  </th>
                </tr>
                <tr className="bg-slate-50 text-slate-900">
                  <th className="border border-slate-700 py-1.5 px-2">รหัส</th>
                  <th className="border border-slate-700 py-1.5 px-2">รหัส (พื้นที่)</th>
                  <th className="border border-slate-700 py-1.5 px-2">บัญชี : APC</th>
                  <th className="border border-slate-700 py-1.5 px-2">คลาส</th>
                  <th className="border border-slate-700 py-1.5 px-2 text-left">
                    ชื่อประเภทสินทรัพย์
                  </th>
                  <th className="border border-slate-700 py-1.5 px-2 text-right">
                    มูลค่าการได้มา (ราคาทุน) (1)
                  </th>
                  <th className="border border-slate-700 py-1.5 px-2 text-right">
                    ค่าเสื่อมสะสม
                  </th>
                  <th className="border border-slate-700 py-1.5 px-2 text-right">
                    มูลค่าตามบัญชี (สุทธิ)
                  </th>
                </tr>
              </thead>
              <tbody>
                {gfmisRows.map((row) => (
                  <tr key={row.cat.apcCode}>
                    <td className="border border-slate-700 py-1 px-2 text-center font-mono-num">
                      2102
                    </td>
                    <td className="border border-slate-700 py-1 px-2 text-center"></td>
                    <td className="border border-slate-700 py-1 px-2 text-center font-mono-num">
                      {row.cat.apcCode}
                    </td>
                    <td className="border border-slate-700 py-1 px-2 text-center font-mono-num">
                      {row.cat.classCode}
                    </td>
                    <td className="border border-slate-700 py-1 px-2">
                      {row.cat.name}
                    </td>
                    <td className="border border-slate-700 py-1 px-1.5 text-right font-mono-num">
                      <input
                        type="number"
                        value={row.gfmisCost}
                        onChange={(e) =>
                          setGfmisOverrides((prev) => ({
                            ...prev,
                            [row.cat.apcCode]: Number(e.target.value) || 0,
                          }))
                        }
                        className="no-print w-24 text-right bg-emerald-50/50 border border-slate-200 rounded px-1 py-0.5 font-mono-num"
                      />
                      <span className="hidden print:inline">
                        {row.gfmisCost > 0 ? formatTHB(row.gfmisCost) : '-'}
                      </span>
                    </td>
                    <td className="border border-slate-700 py-1 px-2 text-right font-mono-num">
                      {row.accumDep > 0 ? formatTHB(row.accumDep) : '-'}
                    </td>
                    <td className="border border-slate-700 py-1 px-2 text-right font-mono-num">
                      {row.nbv > 0 ? formatTHB(row.nbv) : '-'}
                    </td>
                    <td className="border border-slate-700 py-1 px-2 text-right font-mono-num">
                      {row.registryCost > 0 ? formatTHB(row.registryCost) : '-'}
                    </td>
                    <td
                      className={`border border-slate-700 py-1 px-2 text-right font-mono-num ${
                        Math.abs(row.diff) > 0.01
                          ? 'text-red-700 font-semibold'
                          : 'text-slate-700'
                      }`}
                    >
                      {Math.abs(row.diff) > 0.01 ? formatTHB(row.diff) : '-'}
                    </td>
                    <td className="border border-slate-700 py-1 px-2 text-slate-500">
                      {Math.abs(row.diff) > 0.01 ? 'ตรวจสอบยอด' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-200 font-bold text-slate-900">
                  <td
                    colSpan={5}
                    className="border border-slate-700 py-2 px-3 text-center"
                  >
                    รายงานยอดสินทรัพย์คงเหลือ (ทั้งสิ้น)
                  </td>
                  <td className="border border-slate-700 py-2 px-2 text-right font-mono-num">
                    {formatTHB(gfmisTotals.gfmisCost)}
                  </td>
                  <td className="border border-slate-700 py-2 px-2 text-right font-mono-num">
                    {formatTHB(gfmisTotals.accumDep)}
                  </td>
                  <td className="border border-slate-700 py-2 px-2 text-right font-mono-num">
                    {formatTHB(gfmisTotals.nbv)}
                  </td>
                  <td className="border border-slate-700 py-2 px-2 text-right font-mono-num">
                    {formatTHB(gfmisTotals.registryCost)}
                  </td>
                  <td className="border border-slate-700 py-2 px-2 text-right font-mono-num">
                    {formatTHB(gfmisTotals.diff)}
                  </td>
                  <td className="border border-slate-700 py-2 px-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="grid grid-cols-3 gap-6 pt-8 text-center text-xs text-slate-800">
            <div>
              <div>ลงชื่อ..............................................เจ้าหน้าที่พัสดุ (ผู้จัดทำ)</div>
              <div className="mt-1">({settings.preparer.name || '........................................'})</div>
              {settings.preparer.position.trim() && (
                <div className="text-slate-600">ตำแหน่ง {settings.preparer.position}</div>
              )}
            </div>
            <div>
              <div>ลงชื่อ..............................................หัวหน้าเจ้าหน้าที่ (ผู้รับรอง)</div>
              <div className="mt-1">({settings.verifier.name || '........................................'})</div>
              {settings.verifier.position.trim() && (
                <div className="text-slate-600">ตำแหน่ง {settings.verifier.position}</div>
              )}
            </div>
            <div>
              <div>ลงชื่อ..............................................หัวหน้าหน่วยงาน</div>
              <div className="mt-1">({settings.director.name || '........................................'})</div>
              {settings.director.position.trim() && (
                <div className="text-slate-600">ตำแหน่ง {settings.director.position}</div>
              )}
            </div>
          </div>

          <p className="mt-5 text-[11px] text-sky-800">
            หมายเหตุ: แสดงเฉพาะรายการยอดคงเหลือบัญชีสินทรัพย์ (ระบุประเภท) ในงบทดลอง ณ วันที่ 30 กันยายน {settings.fiscalYear} โดยช่อง (1) สามารถแก้ไขปรับเทียบกับรายงานงบทดลอง New GFMIS Thai ได้โดยตรงเพื่อหาผลต่าง (1)-(2)
          </p>
        </div>
      )}

      {/* Memo 213: Annual Inventory Inspection Report */}
      {docTab === 'memo213' && (
        <div className="print-surface bg-white border border-slate-200 rounded-xl p-8 max-w-4xl mx-auto font-sarabun text-sm leading-relaxed text-slate-900">
          <div className="text-center border-b-2 border-slate-800 pb-3 mb-6">
            <h2 className="text-xl font-bold">บันทึกข้อความ</h2>
          </div>

          <div className="space-y-1.5 mb-6">
            <div>
              <strong>ส่วนราชการ</strong> {settings.agencyName} ({settings.department})
            </div>
            <div className="flex flex-wrap justify-between gap-4">
              <div>
                <strong>ที่</strong> .............................................
              </div>
              <div>
                <strong>วันที่</strong> {formatThaiDateLong(settings.inspectionDate)}
              </div>
            </div>
            <div>
              <strong>เรื่อง</strong> รายงานผลการตรวจสอบพัสดุประจำปีงบประมาณ {settings.fiscalYear}
            </div>
          </div>

          <div className="space-y-4">
            <p>
              <strong>เรียน</strong> หัวหน้าหน่วยงาน ({settings.agencyName})
            </p>
            <p className="indent-8">
              ตาม {settings.committeeOrderNo} ได้แต่งตั้งคณะกรรมการตรวจสอบพัสดุประจำปีงบประมาณ{' '}
              {settings.fiscalYear} ตามระเบียบกระทรวงการคลังว่าด้วยการจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560 ข้อ 213 เพื่อทำการตรวจสอบการรับจ่ายพัสดุและการคงเหลืออยู่ของครุภัณฑ์ประจำปีงบประมาณ {settings.fiscalYear} ({fyWindow.labelShort}) นั้น
            </p>
            <p className="indent-8">
              บัดนี้ คณะกรรมการฯ ได้ดำเนินการตรวจสอบครุภัณฑ์และทะเบียนคุมทรัพย์สินของ {settings.agencyName} เรียบร้อยแล้ว ขอรายงานผลการตรวจสอบดังต่อไปนี้
            </p>

            <table className="w-full border-collapse border border-slate-700 text-xs my-4">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-700 py-2 px-3 text-left">
                    รายการสรุปผลการตรวจสอบพัสดุ
                  </th>
                  <th className="border border-slate-700 py-2 px-3 text-right">
                    จำนวน (รายการ)
                  </th>
                  <th className="border border-slate-700 py-2 px-3 text-left">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-700 py-2 px-3">
                    1. ครุภัณฑ์คงเหลือใช้งานปกติในสภาพดี
                  </td>
                  <td className="border border-slate-700 py-2 px-3 text-right font-mono-num">
                    {formatInt(stats.normal.length)}
                  </td>
                  <td className="border border-slate-700 py-2 px-3">ตรงตามทะเบียนคุมทรัพย์สิน</td>
                </tr>
                <tr>
                  <td className="border border-slate-700 py-2 px-3">
                    2. ครุภัณฑ์ที่อยู่ระหว่างส่งซ่อม / รอซ่อมบำรุง
                  </td>
                  <td className="border border-slate-700 py-2 px-3 text-right font-mono-num">
                    {formatInt(stats.repairing.length)}
                  </td>
                  <td className="border border-slate-700 py-2 px-3">มีบันทึกติดตามซ่อมบำรุง</td>
                </tr>
                <tr>
                  <td className="border border-slate-700 py-2 px-3">
                    3. ครุภัณฑ์ชำรุด เสื่อมสภาพ ไม่จำเป็นต้องใช้ (เสนอจำหน่าย)
                  </td>
                  <td className="border border-slate-700 py-2 px-3 text-right font-mono-num">
                    {formatInt(stats.damaged.length)}
                  </td>
                  <td className="border border-slate-700 py-2 px-3">
                    จัดทำบัญชีเสนอจำหน่ายแนบท้าย
                  </td>
                </tr>
                <tr>
                  <td className="border border-slate-700 py-2 px-3">
                    4. ครุภัณฑ์สูญหาย
                  </td>
                  <td className="border border-slate-700 py-2 px-3 text-right font-mono-num">
                    {formatInt(stats.lost.length)}
                  </td>
                  <td className="border border-slate-700 py-2 px-3">
                    {stats.lost.length === 0 ? 'ไม่พบครุภัณฑ์สูญหาย' : 'ดำเนินการสอบข้อเท็จจริง'}
                  </td>
                </tr>
                <tr className="bg-slate-100 font-bold">
                  <td className="border border-slate-700 py-2 px-3">
                    รวมครุภัณฑ์คงเหลือในทะเบียน (ไม่รวมที่จำหน่ายแล้ว {formatInt(stats.disposed.length)} รายการ)
                  </td>
                  <td className="border border-slate-700 py-2 px-3 text-right font-mono-num">
                    {formatInt(stats.active.length)}
                  </td>
                  <td className="border border-slate-700 py-2 px-3 font-mono-num">
                    ราคาทุน {formatTHB(stats.activeCost)} บาท (สุทธิ {formatTHB(stats.activeNBV)} บาท)
                  </td>
                </tr>
              </tbody>
            </table>

            <p className="indent-8">
              จึงเรียนมาเพื่อโปรดทราบ และพิจารณาดำเนินการแต่งตั้งคณะกรรมการสอบข้อเท็จจริงสำหรับการจำหน่ายครุภัณฑ์ที่ชำรุดเสื่อมสภาพ (ถ้ามี) ตามระเบียบฯ ต่อไป
            </p>
          </div>

          {/* Committee & Director Signatories for Memo 213 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-10 text-center text-xs">
            {[
              {
                label: 'ประธานกรรมการตรวจสอบพัสดุ',
                sig: settings.committeeChair || settings.verifier,
              },
              {
                label: 'กรรมการตรวจสอบพัสดุ คนที่ 2',
                sig: settings.committeeMember2,
              },
              {
                label: 'กรรมการตรวจสอบพัสดุ คนที่ 3',
                sig: settings.committeeMember3,
              },
            ]
              .filter((c) => c.sig && c.sig.name.trim() !== '')
              .map((c, idx) => (
                <div key={idx}>
                  <div>ลงชื่อ..............................................{c.label}</div>
                  <div className="mt-1">({c.sig?.name})</div>
                  {c.sig?.position?.trim() && (
                    <div className="text-slate-600">{c.sig.position}</div>
                  )}
                </div>
              ))}
          </div>

          <div className="grid grid-cols-2 gap-8 pt-10 text-center text-xs border-t border-slate-200 mt-8">
            <div>
              <div>ลงชื่อ..............................................เจ้าหน้าที่พัสดุ</div>
              <div className="mt-1">({settings.preparer.name || '........................................'})</div>
              {settings.preparer.position.trim() && (
                <div className="text-slate-600">{settings.preparer.position}</div>
              )}
            </div>
            <div>
              <div>ลงชื่อ..............................................หัวหน้าหน่วยงาน (ผู้อำนวยการ)</div>
              <div className="mt-1">({settings.director.name || '........................................'})</div>
              {settings.director.position.trim() && (
                <div className="text-slate-600">{settings.director.position}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
