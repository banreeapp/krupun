import { useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  Download,
  FileDown,
  Image as ImageIcon,
  Printer,
  QrCode,
  Search,
  Square,
} from 'lucide-react';
import {
  AgencySettings,
  AssetItem,
  ReferenceConfig,
} from '../types/asset';
import { formatInt } from '../utils/depreciation';
import {
  buildQrPayload,
  downloadBatchLabelsA4Png,
  downloadLabelsPdfA4Sheet,
  downloadLabelsPdfExact50x30,
  downloadSingleLabelPng,
  QrLabelOptions,
  QrPayloadMode,
  renderQrLabelCanvas,
} from '../utils/qrLabelExport';

interface QrLabelStudioViewProps {
  settings: AgencySettings;
  reference: ReferenceConfig;
  assets: AssetItem[];
  initialAssetId?: string;
}

type PrintLayoutMode = 'a4_sheet' | 'thermal_50x30';

export function QrLabelStudioView({
  settings,
  reference,
  assets,
  initialAssetId,
}: QrLabelStudioViewProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [includeDisposed, setIncludeDisposed] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    if (initialAssetId && assets.some((a) => a.id === initialAssetId)) {
      return [initialAssetId];
    }
    return assets.slice(0, 6).map((a) => a.id);
  });
  const [previewAssetId, setPreviewAssetId] = useState<string>(() => {
    if (initialAssetId && assets.some((a) => a.id === initialAssetId)) {
      return initialAssetId;
    }
    return assets[0]?.id || '';
  });

  // Sync if user jumped from Registry / Individual Card with a specific assetId
  useEffect(() => {
    if (initialAssetId && assets.some((a) => a.id === initialAssetId)) {
      setPreviewAssetId(initialAssetId);
      setSelectedIds((prev) =>
        prev.includes(initialAssetId) ? prev : [initialAssetId, ...prev]
      );
    }
  }, [initialAssetId, assets]);

  // Label styling options
  const [agencyDisplayName, setAgencyDisplayName] = useState(
    settings.agencyName
  );
  const [payloadMode, setPayloadMode] = useState<QrPayloadMode>('url');
  const [printLayout, setPrintLayout] = useState<PrintLayoutMode>('a4_sheet');
  const [showBorder, setShowBorder] = useState(true);
  const [showGfmisAndDate, setShowGfmisAndDate] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState('');

  // Rendered high-DPI preview map: assetId -> PNG DataURL
  const [renderedImages, setRenderedImages] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    setAgencyDisplayName(settings.agencyName);
  }, [settings.agencyName]);

  const options: QrLabelOptions = useMemo(
    () => ({
      agencyDisplayName,
      payloadMode,
      showBorder,
      showGfmisAndDate,
    }),
    [agencyDisplayName, payloadMode, showBorder, showGfmisAndDate]
  );

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (!includeDisposed && a.status === 'จำหน่ายแล้ว') return false;
      if (categoryFilter !== 'ALL' && a.categoryCode !== categoryFilter) {
        return false;
      }
      if (locationFilter !== 'ALL' && a.location !== locationFilter) {
        return false;
      }
      if (q) {
        const hay = `${a.assetCode} ${a.gfmisAssetNo} ${a.name} ${a.brandModel} ${a.location}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [assets, includeDisposed, categoryFilter, locationFilter, search]);

  const selectedAssets = useMemo(
    () => assets.filter((a) => selectedIds.includes(a.id)),
    [assets, selectedIds]
  );

  const previewAsset = useMemo(
    () =>
      assets.find((a) => a.id === previewAssetId) ||
      selectedAssets[0] ||
      filteredAssets[0] ||
      assets[0] ||
      null,
    [assets, previewAssetId, selectedAssets, filteredAssets]
  );

  // Assets to render live canvases for (previewAsset + selectedAssets)
  const assetsToRender = useMemo(() => {
    const map = new Map<string, AssetItem>();
    if (previewAsset) map.set(previewAsset.id, previewAsset);
    for (const a of selectedAssets) {
      map.set(a.id, a);
    }
    return Array.from(map.values());
  }, [previewAsset, selectedAssets]);

  useEffect(() => {
    let cancelled = false;
    async function renderAll() {
      const next: Record<string, string> = {};
      for (const item of assetsToRender) {
        if (cancelled) return;
        const cat = reference.categories.find(
          (c) => c.apcCode === item.categoryCode
        );
        const canvas = await renderQrLabelCanvas(item, settings, cat, options);
        next[item.id] = canvas.toDataURL('image/png');
      }
      if (!cancelled) {
        setRenderedImages(next);
      }
    }
    renderAll();
    return () => {
      cancelled = true;
    };
  }, [assetsToRender, reference.categories, settings, options]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    const ids = filteredAssets.map((a) => a.id);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const handleExportSinglePng = async () => {
    if (!previewAsset) return;
    setExportError('');
    setExporting('single_png');
    try {
      const cat = reference.categories.find(
        (c) => c.apcCode === previewAsset.categoryCode
      );
      await downloadSingleLabelPng(previewAsset, settings, cat, options);
    } catch (err: any) {
      setExportError(err?.message || 'ส่งออกภาพไม่สำเร็จ');
    } finally {
      setExporting(null);
    }
  };

  const handleExportBatchPng = async () => {
    const target = selectedAssets.length > 0 ? selectedAssets : previewAsset ? [previewAsset] : [];
    if (target.length === 0) return;
    setExportError('');
    setExporting('batch_png');
    try {
      await downloadBatchLabelsA4Png(
        target,
        settings,
        reference.categories,
        options
      );
    } catch (err: any) {
      setExportError(err?.message || 'ส่งออกภาพ A4 ไม่สำเร็จ');
    } finally {
      setExporting(null);
    }
  };

  const handleExportPdf50x30 = async () => {
    const target = selectedAssets.length > 0 ? selectedAssets : previewAsset ? [previewAsset] : [];
    if (target.length === 0) return;
    setExportError('');
    setExporting('pdf_50x30');
    try {
      await downloadLabelsPdfExact50x30(
        target,
        settings,
        reference.categories,
        options
      );
    } catch (err: any) {
      setExportError(err?.message || 'ส่งออก PDF 50×30 มม. ไม่สำเร็จ');
    } finally {
      setExporting(null);
    }
  };

  const handleExportPdfA4 = async () => {
    const target = selectedAssets.length > 0 ? selectedAssets : previewAsset ? [previewAsset] : [];
    if (target.length === 0) return;
    setExportError('');
    setExporting('pdf_a4');
    try {
      await downloadLabelsPdfA4Sheet(
        target,
        settings,
        reference.categories,
        options
      );
    } catch (err: any) {
      setExportError(err?.message || 'ส่งออก PDF A4 ไม่สำเร็จ');
    } finally {
      setExporting(null);
    }
  };

  const printableList =
    selectedAssets.length > 0
      ? selectedAssets
      : previewAsset
      ? [previewAsset]
      : [];

  return (
    <div className="space-y-4">
      {/* Dynamic Print Page Size matching selected mode */}
      <style media="print">
        {printLayout === 'thermal_50x30'
          ? `@page { size: 50mm 30mm; margin: 0; }`
          : `@page { size: A4 portrait; margin: 12mm; }`}
      </style>

      {/* Top Controls Bar */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-slate-900">
              สร้างและพิมพ์สติกเกอร์ QR Code ครุภัณฑ์ (ขนาด 50 × 30 มิลลิเมตร)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              แสดง QR Code รหัสครุภัณฑ์ และชื่อหน่วยงานขนาดมาตรฐาน 50 × 30 มม. รองรับพิมพ์สติกเกอร์/กระดาษ A4, ส่งออกไฟล์ภาพ (.png) และไฟล์ PDF (.pdf)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={!previewAsset || exporting !== null}
              onClick={handleExportSinglePng}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              <ImageIcon className="w-3.5 h-3.5 text-emerald-800" />
              <span>
                {exporting === 'single_png' ? 'กำลังสร้าง...' : 'ภาพเดี่ยว (.png)'}
              </span>
            </button>

            <button
              type="button"
              disabled={printableList.length === 0 || exporting !== null}
              onClick={handleExportBatchPng}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-emerald-800" />
              <span>
                {exporting === 'batch_png' ? 'กำลังสร้าง...' : 'ภาพรวม A4 (.png)'}
              </span>
            </button>

            <button
              type="button"
              disabled={printableList.length === 0 || exporting !== null}
              onClick={handleExportPdf50x30}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>
                {exporting === 'pdf_50x30'
                  ? 'กำลังสร้าง...'
                  : 'PDF 50×30 มม.'}
              </span>
            </button>

            <button
              type="button"
              disabled={printableList.length === 0 || exporting !== null}
              onClick={handleExportPdfA4}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>
                {exporting === 'pdf_a4' ? 'กำลังสร้าง...' : 'PDF หน้า A4'}
              </span>
            </button>

            <button
              type="button"
              disabled={printableList.length === 0}
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 disabled:opacity-50 whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>พิมพ์ ({formatInt(printableList.length)} ดวง)</span>
            </button>
          </div>
        </div>

        {exportError && (
          <div className="px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {exportError}
          </div>
        )}

        {/* Label Settings Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              ชื่อหน่วยงานบนสติกเกอร์
            </label>
            <input
              type="text"
              value={agencyDisplayName}
              onChange={(e) => setAgencyDisplayName(e.target.value)}
              placeholder={settings.agencyName}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-800"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              ข้อมูลที่ฝังใน QR Code
            </label>
            <select
              value={payloadMode}
              onChange={(e) => setPayloadMode(e.target.value as QrPayloadMode)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-800"
            >
              <option value="url">
                ลิงก์เปิดข้อมูลครุภัณฑ์ในเว็บ (สแกนด้วยมือถือ)
              </option>
              <option value="detail">
                ข้อความรหัส+ชื่อครุภัณฑ์+หน่วยงาน (อ่านได้ออฟไลน์)
              </option>
              <option value="code_only">
                รหัสครุภัณฑ์ล้วน (สำหรับเครื่องยิงสแกน/Excel)
              </option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              รูปแบบหน้าสำหรับสั่งพิมพ์
            </label>
            <select
              value={printLayout}
              onChange={(e) =>
                setPrintLayout(e.target.value as PrintLayoutMode)
              }
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-800"
            >
              <option value="a4_sheet">
                จัดเรียงบนกระดาษ A4 (3×8 ดวง ขนาด 50×30 มม.)
              </option>
              <option value="thermal_50x30">
                สติกเกอร์ม้วนขนาด 50×30 มม. (1 ดวง/หน้า)
              </option>
            </select>
          </div>

          <div className="flex flex-col justify-center gap-1.5 pt-1">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showBorder}
                onChange={(e) => setShowBorder(e.target.checked)}
                className="rounded border-slate-300 text-emerald-900"
              />
              <span>แสดงกรอบขอบตัด (50 × 30 มม.)</span>
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showGfmisAndDate}
                onChange={(e) => setShowGfmisAndDate(e.target.checked)}
                className="rounded border-slate-300 text-emerald-900"
              />
              <span>แสดงเลข GFMIS และวันที่ได้มา</span>
            </label>
          </div>
        </div>
      </div>

      {/* Main Workspace: Asset Picker (Left) + Live 50x30mm Preview (Right) */}
      <div className="no-print grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Left: Asset Selector Table */}
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl p-4 flex flex-col space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-900">
              เลือกรายการครุภัณฑ์ที่ต้องการพิมพ์/ส่งออก (เลือกแล้ว{' '}
              <span className="font-mono-num text-emerald-800">
                {formatInt(selectedIds.length)}
              </span>{' '}
              รายการ)
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllFiltered}
                className="px-2.5 py-1 text-[11px] font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 whitespace-nowrap"
              >
                เลือกทั้งหมดที่แสดง ({formatInt(filteredAssets.length)})
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 whitespace-nowrap"
              >
                ล้างการเลือก
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหารหัส / ชื่อครุภัณฑ์..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
            >
              <option value="ALL">ทุกประเภทครุภัณฑ์</option>
              {reference.categories.map((c) => (
                <option key={c.apcCode} value={c.apcCode}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
            >
              <option value="ALL">ทุกสถานที่/ห้อง</option>
              {reference.locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          <label className="inline-flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={includeDisposed}
              onChange={(e) => setIncludeDisposed(e.target.checked)}
              className="rounded border-slate-300 text-emerald-900"
            />
            <span>แสดงครุภัณฑ์ที่จำหน่ายแล้วด้วย</span>
          </label>

          <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[340px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="py-2 px-2.5 w-9 text-center">เลือก</th>
                  <th className="py-2 px-2.5">รหัสครุภัณฑ์</th>
                  <th className="py-2 px-2.5">รายการ</th>
                  <th className="py-2 px-2.5">สถานที่</th>
                  <th className="py-2 px-2.5 text-right">ตัวอย่าง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAssets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-6 text-center text-slate-400"
                    >
                      ไม่พบรายการครุภัณฑ์
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((a) => {
                    const isChecked = selectedIds.includes(a.id);
                    const isPreview = previewAsset?.id === a.id;
                    return (
                      <tr
                        key={a.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          isPreview ? 'bg-emerald-50/50' : ''
                        }`}
                      >
                        <td className="py-2 px-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => toggleSelect(a.id)}
                            className="text-emerald-900 hover:text-emerald-700"
                            aria-label={`เลือก ${a.assetCode}`}
                          >
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                        </td>
                        <td className="py-2 px-2.5 font-mono-num whitespace-nowrap font-medium text-slate-900">
                          {a.assetCode}
                        </td>
                        <td className="py-2 px-2.5 text-slate-700">
                          <div className="line-clamp-1">{a.name}</div>
                        </td>
                        <td className="py-2 px-2.5 text-slate-500 whitespace-nowrap">
                          {a.location}
                        </td>
                        <td className="py-2 px-2.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setPreviewAssetId(a.id)}
                            className={`px-2 py-1 text-[11px] font-medium rounded border transition-colors ${
                              isPreview
                                ? 'bg-emerald-900 text-white border-emerald-900'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            ดูสติกเกอร์
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Single Sticker Zoomed & Actual Size 50x30mm Preview */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-emerald-800" />
              <span className="text-xs font-semibold text-slate-900">
                ตัวอย่างสติกเกอร์ขนาด 50 × 30 มิลลิเมตร
              </span>
            </div>
            <span className="text-[11px] font-mono-num text-slate-500">
              1200 × 720 px (610 DPI)
            </span>
          </div>

          {previewAsset ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 border border-dashed border-slate-300 rounded-xl p-5 space-y-4">
              {renderedImages[previewAsset.id] ? (
                <>
                  {/* Zoomed crisp preview (~100mm x 60mm visual for easy inspection) */}
                  <div className="shadow-sm bg-white rounded-sm overflow-hidden">
                    <img
                      src={renderedImages[previewAsset.id]}
                      alt={`QR ${previewAsset.assetCode}`}
                      className="w-[340px] max-w-full aspect-[50/30] block"
                    />
                  </div>

                  <div className="w-full pt-2 border-t border-slate-200 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>ขนาดจริงเมื่อพิมพ์ (1:1):</span>
                      <span className="font-mono-num font-semibold text-slate-800">
                        50 มม. × 30 มม.
                      </span>
                    </div>
                    <div className="flex justify-center py-1">
                      <img
                        src={renderedImages[previewAsset.id]}
                        alt={`QR 1:1 ${previewAsset.assetCode}`}
                        className="w-[50mm] h-[30mm] block shadow-xs"
                      />
                    </div>
                  </div>

                  <div className="w-full text-[11px] text-slate-500 bg-white border border-slate-200 rounded-lg p-2.5 break-all font-mono-num">
                    <div className="text-[10px] font-sans font-medium text-slate-400 mb-0.5">
                      ข้อมูลที่สแกนได้จาก QR Code:
                    </div>
                    {buildQrPayload(previewAsset, settings, payloadMode)}
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-400 py-12">
                  กำลังสร้างตัวอย่าง QR Code...
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-400 text-center py-12">
              กรุณาเลือกครุภัณฑ์เพื่อดูตัวอย่าง
            </div>
          )}
        </div>
      </div>

      {/* Printable Surface (50x30mm exact CSS sizing) */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 print-surface">
        <div className="no-print flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              ตัวอย่างหน้าจัดพิมพ์ ({formatInt(printableList.length)} ดวง · ขนาดดวงละ 50 × 30 มม.)
            </h2>
            <p className="text-xs text-slate-500">
              {printLayout === 'a4_sheet'
                ? 'จัดเรียงบนกระดาษ A4 แนวตั้ง (แถวละ 3 ดวง × 8 แถว = 24 ดวง/หน้า) พร้อมเส้นขอบตัดพอดี 50×30 มม.'
                : 'โหมดเครื่องพิมพ์สติกเกอร์ (1 ดวง ขนาด 50×30 มม. ต่อ 1 หน้า)'}
            </p>
          </div>
        </div>

        {printableList.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-8">
            ยังไม่ได้เลือกรายการครุภัณฑ์สำหรับพิมพ์
          </div>
        ) : printLayout === 'thermal_50x30' ? (
          <div className="flex flex-wrap gap-3 print:block">
            {printableList.map((item) => (
              <div
                key={item.id}
                className="w-[50mm] h-[30mm] print-page-break overflow-hidden bg-white"
              >
                {renderedImages[item.id] && (
                  <img
                    src={renderedImages[item.id]}
                    alt={`QR ${item.assetCode}`}
                    className="w-[50mm] h-[30mm] block"
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div
            className="grid gap-x-[10mm] gap-y-[4mm] justify-start"
            style={{ gridTemplateColumns: 'repeat(3, 50mm)' }}
          >
            {printableList.map((item) => (
              <div
                key={item.id}
                className="w-[50mm] h-[30mm] overflow-hidden bg-white break-inside-avoid"
              >
                {renderedImages[item.id] && (
                  <img
                    src={renderedImages[item.id]}
                    alt={`QR ${item.assetCode}`}
                    className="w-[50mm] h-[30mm] block"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
