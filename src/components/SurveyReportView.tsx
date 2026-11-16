import { useMemo, useState } from 'react';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { AgencySettings, AssetItem, ReferenceConfig } from '../types/asset';
import { formatInt, formatThaiDate, formatTHB } from '../utils/depreciation';
import {
  exportAssetSurveyExcel,
  SurveyCategoryPage,
} from '../utils/excelExport';

interface SurveyReportViewProps {
  settings: AgencySettings;
  reference: ReferenceConfig;
  assets: AssetItem[];
}

export function SurveyReportView({
  settings,
  reference,
  assets,
}: SurveyReportViewProps) {
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<string>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [startSheetNo, setStartSheetNo] = useState<number>(1);
  const [includeDisposed, setIncludeDisposed] = useState<boolean>(false);
  const [includeBelowThreshold, setIncludeBelowThreshold] =
    useState<boolean>(true);

  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      if (!includeDisposed && a.status === 'จำหน่ายแล้ว') return false;
      if (!includeBelowThreshold && a.cost < settings.minDepreciationCost) {
        return false;
      }
      if (selectedLocation !== 'ALL' && a.location !== selectedLocation) {
        return false;
      }
      return true;
    });
  }, [
    assets,
    includeDisposed,
    includeBelowThreshold,
    selectedLocation,
    settings.minDepreciationCost,
  ]);

  // Categories that actually have assets (or selected specifically)
  const categoryStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of filteredAssets) {
      map.set(a.categoryCode, (map.get(a.categoryCode) || 0) + 1);
    }
    return map;
  }, [filteredAssets]);

  const pages = useMemo<SurveyCategoryPage[]>(() => {
    const targetCategories =
      selectedCategoryCode === 'ALL'
        ? reference.categories.filter(
            (cat) => (categoryStats.get(cat.apcCode) || 0) > 0
          )
        : reference.categories.filter(
            (cat) => cat.apcCode === selectedCategoryCode
          );

    const baseSheet = Number.isFinite(startSheetNo) && startSheetNo > 0 ? startSheetNo : 1;

    return targetCategories.map((category, idx) => {
      const items = filteredAssets
        .filter((a) => a.categoryCode === category.apcCode)
        .sort((a, b) => {
          const dateCmp = a.acquisitionDate.localeCompare(b.acquisitionDate);
          if (dateCmp !== 0) return dateCmp;
          return a.assetCode.localeCompare(b.assetCode);
        });

      return {
        sheetNumber: baseSheet + idx,
        category,
        items,
      };
    });
  }, [
    selectedCategoryCode,
    reference.categories,
    categoryStats,
    filteredAssets,
    startSheetNo,
  ]);

  const totalItems = useMemo(
    () => pages.reduce((sum, p) => sum + p.items.length, 0),
    [pages]
  );

  const totalCost = useMemo(
    () =>
      pages.reduce(
        (sum, p) => sum + p.items.reduce((s, item) => s + item.cost, 0),
        0
      ),
    [pages]
  );

  const chairOrVerifier =
    settings.committeeChair?.name?.trim()
      ? settings.committeeChair
      : settings.verifier;

  return (
    <div className="space-y-4">
      {/* Control Toolbar */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-slate-900">
              รายงานสำรวจครุภัณฑ์ ประจำปี แยกตามประเภท
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              แบบสำรวจครุภัณฑ์ประจำปีงบประมาณ {settings.fiscalYear} แยกแผ่นตามประเภทครุภัณฑ์ พร้อมพิมพ์ A4 และส่งออก Excel แยกชีตตามประเภท
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={pages.length === 0}
              onClick={() => exportAssetSurveyExcel({ settings, pages })}
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
              <span>พิมพ์แบบสำรวจ (A4)</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              เลือกประเภทครุภัณฑ์
            </label>
            <select
              value={selectedCategoryCode}
              onChange={(e) => setSelectedCategoryCode(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-800"
            >
              <option value="ALL">
                ทุกประเภทที่มีครุภัณฑ์ ({reference.categories.filter((c) => (categoryStats.get(c.apcCode) || 0) > 0).length} ประเภท)
              </option>
              {reference.categories.map((cat) => {
                const count = categoryStats.get(cat.apcCode) || 0;
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
              กรองตามสถานที่ / ห้อง
            </label>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-800"
            >
              <option value="ALL">ทุกสถานที่ / ทุกห้อง</option>
              {reference.locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              เลขแผ่นที่เริ่มต้น
            </label>
            <input
              type="number"
              min={1}
              value={startSheetNo}
              onChange={(e) =>
                setStartSheetNo(Math.max(1, Number(e.target.value) || 1))
              }
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono-num focus:outline-none focus:border-emerald-800"
            />
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

        {/* Summary strip */}
        <div className="flex flex-wrap items-center gap-6 pt-2 text-xs text-slate-600 border-t border-slate-100">
          <div>
            จำนวนแผ่นแบบสำรวจ:{' '}
            <span className="font-semibold text-slate-900 font-mono-num">
              {formatInt(pages.length)} แผ่น
            </span>
          </div>
          <div>
            รายการครุภัณฑ์รวม:{' '}
            <span className="font-semibold text-slate-900 font-mono-num">
              {formatInt(totalItems)} รายการ
            </span>
          </div>
          <div>
            มูลค่ารวมทั้งสิ้น:{' '}
            <span className="font-semibold text-emerald-900 font-mono-num">
              {formatTHB(totalCost)} บาท
            </span>
          </div>
        </div>
      </div>

      {/* Category Survey Sheets */}
      {pages.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          ไม่พบรายการครุภัณฑ์ตามเงื่อนไขที่เลือก
        </div>
      ) : (
        <div className="space-y-6">
          {pages.map((page) => {
            const pageTotal = page.items.reduce((s, item) => s + item.cost, 0);
            return (
              <section
                key={page.category.apcCode}
                className="print-surface print-page-break bg-white border border-slate-200 rounded-xl p-6 font-sarabun text-slate-900"
              >
                {/* Title Box */}
                <div className="border-2 border-slate-900 py-1.5 px-4 text-center mb-3">
                  <h2 className="text-base font-bold tracking-wide text-slate-900">
                    แบบสำรวจครุภัณฑ์ ปี {settings.fiscalYear}
                  </h2>
                </div>

                {/* Metadata Header */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-6 text-xs mb-3 px-0.5">
                  <div className="space-y-1">
                    <div className="flex items-baseline gap-3">
                      <span className="font-semibold w-14 shrink-0">แผ่นที่</span>
                      <span className="font-mono-num font-semibold text-slate-900">
                        {page.sheetNumber}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className="font-semibold w-14 shrink-0">ประเภท</span>
                      <span className="font-semibold text-slate-900">
                        {page.category.name}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 sm:text-left">
                    <div className="flex items-baseline gap-3">
                      <span className="font-semibold w-20 shrink-0">ส่วนราชการ</span>
                      <span>{settings.department}</span>
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className="font-semibold w-20 shrink-0">หน่วยงาน</span>
                      <span>{settings.agencyName}</span>
                    </div>
                  </div>
                </div>

                {/* 11-Column Survey Table matching image_d809cb67.png */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-slate-900 text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-900">
                        <th
                          rowSpan={2}
                          className="border border-slate-900 py-1.5 px-1.5 text-center font-semibold whitespace-nowrap w-[72px]"
                        >
                          วัน เดือน ปี
                        </th>
                        <th
                          rowSpan={2}
                          className="border border-slate-900 py-1.5 px-1.5 text-center font-semibold whitespace-nowrap w-[112px]"
                        >
                          เลขที่หรือรหัส
                        </th>
                        <th className="border-x border-t border-slate-900 pt-1.5 pb-0.5 px-2 text-center font-semibold min-w-[180px]">
                          ยี่ห้อ ชนิด ขนาด
                        </th>
                        <th className="border-x border-t border-slate-900 pt-1.5 pb-0.5 px-1.5 text-center font-semibold w-[96px]">
                          หมายเลข
                        </th>
                        <th className="border-x border-t border-slate-900 pt-1.5 pb-0.5 px-1.5 text-center font-semibold w-[76px]">
                          ราคา
                        </th>
                        <th className="border-x border-t border-slate-900 pt-1.5 pb-0.5 px-1.5 text-center font-semibold w-[96px]">
                          วิธีการ
                        </th>
                        <th className="border-x border-t border-slate-900 pt-1.5 pb-0.5 px-1.5 text-center font-semibold w-[92px]">
                          เลขที่
                        </th>
                        <th
                          rowSpan={2}
                          className="border border-slate-900 py-1.5 px-1.5 text-center font-semibold w-[108px]"
                        >
                          ใช้ประจำที่
                        </th>
                        <th className="border-x border-t border-slate-900 pt-1.5 pb-0.5 px-1.5 text-center font-semibold w-[76px]">
                          หลักฐาน
                        </th>
                        <th className="border-x border-t border-slate-900 pt-1.5 pb-0.5 px-1.5 text-center font-semibold w-[84px]">
                          รายการ
                        </th>
                        <th className="border-x border-t border-slate-900 pt-1.5 pb-0.5 px-1.5 text-center font-semibold w-[92px]">
                          หมาย
                        </th>
                      </tr>
                      <tr className="bg-slate-50 text-slate-900">
                        <th className="border-x border-b border-slate-900 pt-0.5 pb-1.5 px-2 text-center font-semibold">
                          และลักษณะ
                        </th>
                        <th className="border-x border-b border-slate-900 pt-0.5 pb-1.5 px-1.5 text-center font-semibold">
                          และทะเบียน
                        </th>
                        <th className="border-x border-b border-slate-900 pt-0.5 pb-1.5 px-1.5 text-center font-semibold">
                          ต่อหน่วย
                        </th>
                        <th className="border-x border-b border-slate-900 pt-0.5 pb-1.5 px-1.5 text-center font-semibold">
                          ได้มา
                        </th>
                        <th className="border-x border-b border-slate-900 pt-0.5 pb-1.5 px-1.5 text-center font-semibold">
                          เอกสาร
                        </th>
                        <th className="border-x border-b border-slate-900 pt-0.5 pb-1.5 px-1.5 text-center font-semibold">
                          การจ่าย
                        </th>
                        <th className="border-x border-b border-slate-900 pt-0.5 pb-1.5 px-1.5 text-center font-semibold">
                          เปลี่ยนแปลง
                        </th>
                        <th className="border-x border-b border-slate-900 pt-0.5 pb-1.5 px-1.5 text-center font-semibold">
                          เหตุ
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {page.items.length === 0 ? (
                        <tr>
                          <td
                            colSpan={11}
                            className="border border-slate-900 py-6 text-center text-slate-500"
                          >
                            ไม่มีรายการครุภัณฑ์ในประเภทนี้
                          </td>
                        </tr>
                      ) : (
                        page.items.map((item) => {
                          let changeText = '';
                          if (item.status === 'จำหน่ายแล้ว') {
                            changeText = item.disposalDate
                              ? `จำหน่ายแล้ว (${formatThaiDate(item.disposalDate)})`
                              : 'จำหน่ายแล้ว';
                          } else if (item.status !== 'ใช้งานปกติ') {
                            changeText = item.status;
                          }

                          const serialParts = [
                            item.serialNumber,
                            item.gfmisAssetNo && item.gfmisAssetNo !== '-'
                              ? `GFMIS: ${item.gfmisAssetNo}`
                              : '',
                          ].filter(Boolean);

                          return (
                            <tr key={item.id} className="align-top">
                              <td className="border border-slate-900 py-1.5 px-1.5 text-center whitespace-nowrap font-mono-num">
                                {formatThaiDate(item.acquisitionDate)}
                              </td>
                              <td className="border border-slate-900 py-1.5 px-1.5 text-center font-mono-num whitespace-nowrap">
                                {item.assetCode}
                              </td>
                              <td className="border border-slate-900 py-1.5 px-2">
                                <div className="font-medium text-slate-900">
                                  {item.name}
                                </div>
                                {item.brandModel && (
                                  <div className="text-[10px] text-slate-700">
                                    {item.brandModel}
                                  </div>
                                )}
                              </td>
                              <td className="border border-slate-900 py-1.5 px-1.5 font-mono-num text-[10px]">
                                {serialParts.join(' / ')}
                              </td>
                              <td className="border border-slate-900 py-1.5 px-1.5 text-right font-mono-num whitespace-nowrap">
                                {formatTHB(item.cost)}
                              </td>
                              <td className="border border-slate-900 py-1.5 px-1.5 text-center">
                                <div>{item.acquisitionMethod}</div>
                                <div className="text-[10px] text-slate-600">
                                  {item.fundingSource}
                                </div>
                              </td>
                              <td className="border border-slate-900 py-1.5 px-1.5 text-center font-mono-num">
                                {item.documentNo || ''}
                              </td>
                              <td className="border border-slate-900 py-1.5 px-1.5 text-center">
                                {item.location}
                              </td>
                              <td className="border border-slate-900 py-1.5 px-1.5 text-center">
                                {item.disposalDocNo || ''}
                              </td>
                              <td className="border border-slate-900 py-1.5 px-1.5 text-center">
                                {changeText}
                              </td>
                              <td className="border border-slate-900 py-1.5 px-1.5 text-[10px] text-slate-700">
                                {item.notes || ''}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>

                    <tfoot>
                      <tr className="bg-slate-100 font-bold text-slate-900">
                        <td
                          colSpan={4}
                          className="border border-slate-900 py-1.5 px-2 text-right"
                        >
                          รวมประเภท {page.category.name} ({formatInt(page.items.length)} รายการ)
                        </td>
                        <td className="border border-slate-900 py-1.5 px-1.5 text-right font-mono-num whitespace-nowrap">
                          {formatTHB(pageTotal)}
                        </td>
                        <td
                          colSpan={6}
                          className="border border-slate-900 py-1.5 px-2 text-left text-[10px] font-normal text-slate-600"
                        >
                          รหัสบัญชี APC {page.category.apcCode} · อายุการใช้งานมาตรฐาน{' '}
                          {page.category.defaultUsefulLife} ปี
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Signatory Footer */}
                <div className="grid grid-cols-3 gap-6 pt-7 text-center text-xs text-slate-800">
                  <div>
                    <div>ลงชื่อ........................................ผู้จัดทำทะเบียน</div>
                    <div className="mt-1">
                      ({settings.preparer.name || '......................................'})
                    </div>
                    {settings.preparer.position.trim() && (
                      <div className="text-slate-600">
                        ตำแหน่ง {settings.preparer.position}
                      </div>
                    )}
                  </div>
                  <div>
                    <div>ลงชื่อ........................................ประธานกรรมการตรวจสอบฯ</div>
                    <div className="mt-1">
                      ({chairOrVerifier.name || '......................................'})
                    </div>
                    {chairOrVerifier.position.trim() && (
                      <div className="text-slate-600">
                        ตำแหน่ง {chairOrVerifier.position}
                      </div>
                    )}
                  </div>
                  <div>
                    <div>ลงชื่อ........................................หัวหน้าหน่วยงาน</div>
                    <div className="mt-1">
                      ({settings.director.name || '......................................'})
                    </div>
                    {settings.director.position.trim() && (
                      <div className="text-slate-600">
                        ตำแหน่ง {settings.director.position}
                      </div>
                    )}
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
