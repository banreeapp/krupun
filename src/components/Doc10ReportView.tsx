import { useMemo, useState } from 'react';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { AgencySettings, ReferenceConfig } from '../types/asset';
import {
  calculateAssetDepreciation,
  formatInt,
  formatThaiDateNumeric,
  formatTHB,
  inferAssetUnit,
} from '../utils/depreciation';
import { Doc10Page, exportDoc10Excel } from '../utils/excelExport';

interface Doc10ReportViewProps {
  settings: AgencySettings;
  reference: ReferenceConfig;
  assets: import('../types/asset').AssetItem[];
}

type LayoutMode = 'one_per_page' | 'by_category';

export function Doc10ReportView({
  settings,
  reference,
  assets,
}: Doc10ReportViewProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('one_per_page');
  const [selectedAssetId, setSelectedAssetId] = useState<string>('ALL');
  const [includeDisposed, setIncludeDisposed] = useState<boolean>(false);
  const [includeBelowThreshold, setIncludeBelowThreshold] =
    useState<boolean>(true);

  const enrichedAssets = useMemo(() => {
    return assets
      .filter((a) => {
        if (!includeDisposed && a.status === 'จำหน่ายแล้ว') return false;
        if (!includeBelowThreshold && a.cost < settings.minDepreciationCost) {
          return false;
        }
        return true;
      })
      .map((asset) => {
        const category = reference.categories.find(
          (c) => c.apcCode === asset.categoryCode
        );
        const dep = calculateAssetDepreciation(asset, settings, category);
        return {
          asset,
          category,
          accumDep: dep.accumulatedDep,
          nbv: dep.netBookValue,
          isBelowThreshold: asset.cost < settings.minDepreciationCost,
        };
      });
  }, [
    assets,
    includeDisposed,
    includeBelowThreshold,
    reference.categories,
    settings,
  ]);

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    let belowCount = 0;
    for (const item of enrichedAssets) {
      map.set(
        item.asset.categoryCode,
        (map.get(item.asset.categoryCode) || 0) + 1
      );
      if (item.isBelowThreshold) belowCount++;
    }
    return { map, belowCount };
  }, [enrichedAssets]);

  const filteredByCategory = useMemo(() => {
    return enrichedAssets.filter((entry) => {
      if (selectedCategory === 'ALL') return true;
      if (selectedCategory === 'BELOW_THRESHOLD') return entry.isBelowThreshold;
      return entry.asset.categoryCode === selectedCategory;
    });
  }, [enrichedAssets, selectedCategory]);

  const finalEntries = useMemo(() => {
    if (selectedAssetId === 'ALL') return filteredByCategory;
    return filteredByCategory.filter((e) => e.asset.id === selectedAssetId);
  }, [filteredByCategory, selectedAssetId]);

  const pages = useMemo<Doc10Page[]>(() => {
    if (finalEntries.length === 0) return [];

    if (layoutMode === 'one_per_page') {
      return finalEntries.map((entry, idx) => {
        const label =
          selectedCategory === 'BELOW_THRESHOLD' ||
          (entry.isBelowThreshold && selectedCategory === 'ALL')
            ? `${entry.category?.name || entry.asset.categoryCode} (ต่ำกว่าเกณฑ์)`
            : entry.category?.name || entry.asset.categoryCode;
        return {
          pageNumber: idx + 1,
          categoryLabel: label,
          items: [
            {
              asset: entry.asset,
              category: entry.category,
              accumDep: entry.accumDep,
              nbv: entry.nbv,
            },
          ],
        };
      });
    }

    // Grouped 1 page per category
    if (selectedCategory === 'BELOW_THRESHOLD') {
      return [
        {
          pageNumber: 1,
          categoryLabel: 'ครุภัณฑ์ต่ำกว่าเกณฑ์',
          items: finalEntries.map((e) => ({
            asset: e.asset,
            category: e.category,
            accumDep: e.accumDep,
            nbv: e.nbv,
          })),
        },
      ];
    }

    const grouped: Doc10Page[] = [];
    let pageNo = 1;
    for (const cat of reference.categories) {
      const catItems = finalEntries.filter(
        (e) => e.asset.categoryCode === cat.apcCode
      );
      if (catItems.length === 0) continue;
      grouped.push({
        pageNumber: pageNo++,
        categoryLabel: cat.name,
        items: catItems.map((e) => ({
          asset: e.asset,
          category: e.category,
          accumDep: e.accumDep,
          nbv: e.nbv,
        })),
      });
    }
    return grouped;
  }, [finalEntries, layoutMode, reference.categories, selectedCategory]);

  const chair = settings.committeeChair?.name?.trim()
    ? settings.committeeChair
    : settings.verifier;
  const member2 = settings.committeeMember2;
  const member3 = settings.committeeMember3;

  const minBlankRows = 7;

  return (
    <div className="space-y-4">
      {/* Force A4 Landscape ONLY when Document 10 view is active */}
      <style media="print">{`@page { size: A4 landscape; margin: 10mm 12mm; }`}</style>

      {/* Toolbar */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-slate-900">
              แบบบัญชีรายงานครุภัณฑ์ (เอกสารหมายเลข 10)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              แบบรายงานผลการตรวจสอบพัสดุประจำปี ข้อมูล ณ วันที่ 30 กันยายน {settings.fiscalYear} · รองรับการพิมพ์แนวนอน A4 (1 รายการ/หน้า หรือรวมตามประเภท)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={pages.length === 0}
              onClick={() => exportDoc10Excel({ settings, pages })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>ส่งออก Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              disabled={pages.length === 0}
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>พิมพ์เอกสาร 10 (แนวนอน A4)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              ประเภทครุภัณฑ์
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setSelectedAssetId('ALL');
              }}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-800"
            >
              <option value="ALL">
                ทุกประเภทที่มีครุภัณฑ์ ({formatInt(enrichedAssets.length)} รายการ)
              </option>
              <option value="BELOW_THRESHOLD">
                เฉพาะครุภัณฑ์ต่ำกว่าเกณฑ์ ({formatInt(categoryCounts.belowCount)} รายการ)
              </option>
              {reference.categories.map((cat) => {
                const count = categoryCounts.map.get(cat.apcCode) || 0;
                return (
                  <option key={cat.apcCode} value={cat.apcCode}>
                    {cat.name} ({count} รายการ)
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              รูปแบบการจัดหน้า (A4 แนวนอน)
            </label>
            <select
              value={layoutMode}
              onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-800"
            >
              <option value="one_per_page">
                แสดง 1 รายการ ต่อ 1 หน้า (แนวนอน A4)
              </option>
              <option value="by_category">
                รวมรายการตามประเภท (1 ประเภท ต่อ 1 หน้า)
              </option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              เจาะจงรายการครุภัณฑ์
            </label>
            <select
              value={selectedAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-800"
            >
              <option value="ALL">
                ทุกรายการในประเภทที่เลือก ({formatInt(filteredByCategory.length)} รายการ)
              </option>
              {filteredByCategory.map((e) => (
                <option key={e.asset.id} value={e.asset.id}>
                  {e.asset.assetCode} - {e.asset.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col justify-center gap-1.5 pt-1">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeBelowThreshold}
                onChange={(e) => setIncludeBelowThreshold(e.target.checked)}
                className="rounded border-slate-300 text-emerald-900"
              />
              <span>รวมครุภัณฑ์ต่ำกว่าเกณฑ์</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDisposed}
                onChange={(e) => setIncludeDisposed(e.target.checked)}
                className="rounded border-slate-300 text-emerald-900"
              />
              <span>รวมครุภัณฑ์ที่จำหน่ายแล้ว</span>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 pt-2 text-xs text-slate-600 border-t border-slate-100">
          <div>
            จำนวนหน้าที่จะพิมพ์:{' '}
            <span className="font-semibold text-slate-900 font-mono-num">
              {formatInt(pages.length)} หน้า (A4 แนวนอน)
            </span>
          </div>
          <div>
            จำนวนครุภัณฑ์ทั้งหมด:{' '}
            <span className="font-semibold text-slate-900 font-mono-num">
              {formatInt(finalEntries.length)} รายการ
            </span>
          </div>
        </div>
      </div>

      {/* Landscape A4 Pages */}
      {pages.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          ไม่พบรายการครุภัณฑ์ตามเงื่อนไขที่เลือก
        </div>
      ) : (
        <div className="space-y-6">
          {pages.map((page) => {
            const totalCost = page.items.reduce((s, i) => s + i.asset.cost, 0);
            const totalAccum = page.items.reduce((s, i) => s + i.accumDep, 0);
            const totalNBV = page.items.reduce((s, i) => s + i.nbv, 0);
            const blankRowCount = Math.max(0, minBlankRows - page.items.length);

            return (
              <section
                key={`${page.pageNumber}-${page.categoryLabel}`}
                className="print-surface print-page-break max-w-[1140px] mx-auto bg-white border border-slate-200 rounded-xl p-6 font-sarabun text-slate-900"
              >
                {/* Top-right Document Number + Page indicator on screen */}
                <div className="flex items-center justify-between mb-1">
                  <span className="no-print text-[11px] font-mono-num text-slate-400">
                    หน้าที่ {page.pageNumber} / {pages.length} (A4 แนวนอน)
                  </span>
                  <span className="text-base font-bold text-sky-600 ml-auto">
                    เอกสารหมายเลข 10
                  </span>
                </div>

                {/* Centered Title Header */}
                <div className="text-center mb-3">
                  <h2 className="text-xl font-bold text-slate-900">
                    แบบบัญชีรายงานครุภัณฑ์
                  </h2>
                  <p className="text-xs text-slate-800 mt-0.5">
                    ชื่อหน่วยงาน. {settings.agencyName}
                  </p>
                  <p className="text-xs text-slate-800">
                    ข้อมูล ณ วันที่ 30 กันยายน {settings.fiscalYear}
                  </p>
                </div>

                {/* Category Subheader */}
                <div className="text-xs mb-1.5">
                  <div className="underline font-semibold text-slate-900">
                    ประเภทครุภัณฑ์
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1 mt-0.5">
                    <span className="font-bold text-red-700 min-w-[200px]">
                      {page.categoryLabel}
                    </span>
                    <span className="text-slate-800">
                      อาคารและสิ่งปลูกสร้าง / สำนักงาน / โปรแกรมคอมพิวเตอร์ / ครุภัณฑ์ต่ำกว่าเกณฑ์ / อื่นๆ
                    </span>
                  </div>
                </div>

                {/* 13-Column Table matching image_dc211bbe.png */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-[#dce6f1]">
                        <th className="border border-slate-900 py-1.5 px-1.5 text-center font-semibold w-[40px]">
                          ลำดับ
                        </th>
                        <th className="border border-slate-900 py-1.5 px-1.5 text-center font-semibold text-red-700 w-[108px]">
                          รหัสครุภัณฑ์
                        </th>
                        <th className="border border-slate-900 py-1.5 px-1.5 text-center font-semibold text-red-700 w-[100px]">
                          รหัสสินทรัพย์ GF
                        </th>
                        <th className="border border-slate-900 py-1.5 px-2 text-center font-semibold min-w-[200px]">
                          ชื่อรายการ/รายละเอียด
                        </th>
                        <th className="border border-slate-900 py-1.5 px-1 text-center font-semibold w-[46px]">
                          จำนวนหน่วย
                        </th>
                        <th className="border border-slate-900 py-1.5 px-1 text-center font-semibold w-[52px]">
                          หน่วยนับ
                        </th>
                        <th className="border border-slate-900 py-1.5 px-1.5 text-center font-semibold w-[74px]">
                          วันที่ได้มา
                        </th>
                        <th className="border border-slate-900 py-1.5 px-1.5 text-center font-semibold text-red-700 w-[86px]">
                          มูลค่าการได้มา
                        </th>
                        <th className="border border-slate-900 py-1.5 px-1.5 text-center font-semibold text-red-700 w-[92px]">
                          ค่าเสื่อมราคาสะสม
                        </th>
                        <th className="border border-slate-900 py-1.5 px-1.5 text-center font-semibold text-red-700 w-[84px]">
                          มูลค่าตามบัญชี
                        </th>
                        <th className="border border-slate-900 py-1.5 px-1.5 text-center font-semibold w-[64px]">
                          สถานะพัสดุ
                        </th>
                        <th className="border border-slate-900 py-1.5 px-1.5 text-center font-semibold w-[60px]">
                          ตรวจพบ/ไม่พบ
                        </th>
                        <th className="border border-slate-900 py-1.5 px-2 text-center font-semibold w-[94px]">
                          หมายเหตุ
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {page.items.map((entry, idx) => {
                        const { asset, category, accumDep, nbv } = entry;
                        const isBelow = asset.cost < settings.minDepreciationCost;
                        const gfCode = isBelow
                          ? 'ต่ำกว่าเกณฑ์'
                          : asset.gfmisAssetNo && asset.gfmisAssetNo !== '-'
                          ? asset.gfmisAssetNo
                          : '-';
                        const shortStatus =
                          asset.status === 'ใช้งานปกติ' ? 'ปกติ' : asset.status;
                        const foundStatus =
                          asset.status === 'สูญหาย' ? 'ไม่พบ' : 'พบ';
                        const detailLabel = asset.brandModel
                          ? `${asset.name} (${asset.brandModel})`
                          : asset.name;

                        return (
                          <tr key={asset.id}>
                            <td className="border border-slate-900 py-1 px-1.5 text-center font-mono-num">
                              {idx + 1}
                            </td>
                            <td className="border border-slate-900 py-1 px-1.5 text-center font-mono-num whitespace-nowrap">
                              {asset.assetCode}
                            </td>
                            <td className="border border-slate-900 py-1 px-1.5 text-center font-mono-num whitespace-nowrap">
                              {gfCode}
                            </td>
                            <td className="border border-slate-900 py-1 px-2 text-left">
                              {detailLabel}
                            </td>
                            <td className="border border-slate-900 py-1 px-1 text-center font-mono-num">
                              1
                            </td>
                            <td className="border border-slate-900 py-1 px-1 text-center">
                              {inferAssetUnit(asset, category)}
                            </td>
                            <td className="border border-slate-900 py-1 px-1.5 text-center font-mono-num whitespace-nowrap">
                              {formatThaiDateNumeric(asset.acquisitionDate)}
                            </td>
                            <td className="border border-slate-900 py-1 px-1.5 text-right font-mono-num whitespace-nowrap">
                              {formatTHB(asset.cost)}
                            </td>
                            <td className="border border-slate-900 py-1 px-1.5 text-right font-mono-num whitespace-nowrap">
                              {formatTHB(accumDep)}
                            </td>
                            <td className="border border-slate-900 py-1 px-1.5 text-right font-mono-num whitespace-nowrap">
                              {formatTHB(nbv)}
                            </td>
                            <td className="border border-slate-900 py-1 px-1.5 text-center whitespace-nowrap">
                              {shortStatus}
                            </td>
                            <td className="border border-slate-900 py-1 px-1.5 text-center whitespace-nowrap">
                              {foundStatus}
                            </td>
                            <td className="border border-slate-900 py-1 px-1.5 text-left text-[10px] text-slate-700">
                              {asset.notes || ''}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Ledger blank filler rows to keep crisp paper form spacing */}
                      {Array.from({ length: blankRowCount }).map((_, idx) => (
                        <tr key={`blank-${idx}`} className="h-[22px]">
                          {Array.from({ length: 13 }).map((__, colIdx) => (
                            <td
                              key={colIdx}
                              className="border border-slate-900 py-1 px-1.5"
                            >
                              &nbsp;
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>

                    <tfoot>
                      <tr>
                        <td
                          colSpan={7}
                          className="py-1.5 px-2 text-right font-bold text-red-700"
                        >
                          จำนวนเงิน
                        </td>
                        <td className="border border-slate-900 py-1 px-1.5 text-right font-mono-num font-bold text-red-700 whitespace-nowrap">
                          {formatTHB(totalCost)}
                        </td>
                        <td className="border border-slate-900 py-1 px-1.5 text-right font-mono-num font-bold text-red-700 whitespace-nowrap">
                          {formatTHB(totalAccum)}
                        </td>
                        <td className="border border-slate-900 py-1 px-1.5 text-right font-mono-num font-bold text-red-700 whitespace-nowrap">
                          {formatTHB(totalNBV)}
                        </td>
                        <td colSpan={3}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Signatories matching image_dc211bbe.png */}
                <div className="grid grid-cols-3 gap-6 pt-6 text-center text-xs text-slate-900">
                  <div>
                    <div>ลงชื่อ........................................ ประธานกรรมการ</div>
                    <div className="mt-1">
                      ({chair.name || '......................................'})
                    </div>
                  </div>
                  <div>
                    <div>ลงชื่อ........................................ กรรมการ</div>
                    <div className="mt-1">
                      ({member2?.name || '......................................'})
                    </div>
                  </div>
                  <div>
                    <div>ลงชื่อ........................................ กรรมการ</div>
                    <div className="mt-1">
                      ({member3?.name || '......................................'})
                    </div>
                  </div>
                </div>

                {/* Official Footnotes */}
                <div className="mt-4 text-[11px] text-slate-800 space-y-0.5 leading-snug">
                  <div>
                    <span className="font-bold">หมายเหตุ</span> 1.{' '}
                    <span className="underline">สถานะพัสดุ</span> คือ ใช้งานปกติ / ยืม / ชำรุด / เสื่อมสภาพ / สูญหาย / จำหน่าย (ขาย, แลกเปลี่ยน, โอน, ทำลาย)
                  </div>
                  <div className="pl-12">
                    2. <span className="underline">รหัสสินทรัพย์ GF</span> ในกรณีสินทรัพย์มูลค่าการได้มาต่ำกว่า 10,000 บาท หรือสินทรัพย์ที่มูลค่าการได้มาต่ำกว่า 5,000 บาท (ก่อนปี พ.ศ.2563) ให้ระบุว่า &quot;ต่ำกว่าเกณฑ์&quot;
                  </div>
                  <div className="pl-12">
                    3. หน่วยงานจะต้องแสดงรายการตรวจนับพัสดุที่มีและไม่มีในระบบ GFMIS รวมถึงอาคาร สิ่งปลูกสร้างและสินทรัพย์ที่ไม่มีตัวตนไว้ในแบบรายงานผลการตรวจสอบพัสดุประจำปีด้วย
                  </div>
                  <div className="pl-12">
                    4. หน่วยงานสามารถปรับปรุงรูปแบบรายงานเพิ่มเติมจากที่กำหนดได้ตามความจำเป็นและเหมาะสม เพื่อประโยชน์ในการตรวจสอบ
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
