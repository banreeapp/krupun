import { useMemo, useState } from 'react';
import { CheckCircle2, Printer, Trash2 } from 'lucide-react';
import { AgencySettings, AssetItem, ReferenceConfig } from '../types/asset';
import {
  calculateAssetDepreciation,
  formatThaiDate,
  formatTHB,
} from '../utils/depreciation';
import { AssetStatusLabel } from './StatusBadge';

interface DisposalViewProps {
  settings: AgencySettings;
  reference: ReferenceConfig;
  assets: AssetItem[];
  onDisposeAsset: (
    assetId: string,
    disposalDate: string,
    disposalReason: string
  ) => void;
}

export function DisposalView({
  settings,
  reference,
  assets,
  onDisposeAsset,
}: DisposalViewProps) {
  const [filter, setFilter] = useState<'pending' | 'disposed' | 'all'>('all');
  const [disposalTarget, setDisposalTarget] = useState<AssetItem | null>(null);
  const [disposalDate, setDisposalDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [disposalReason, setDisposalReason] = useState(
    'ชำรุดเสื่อมสภาพ ซ่อมแซมไม่คุ้มค่า ขออนุมัติจำหน่ายตามระเบียบฯ พัสดุ 2560'
  );

  const disposalItems = useMemo(() => {
    return assets.filter((a) => {
      const isPending = a.status === 'ชำรุดรอจำหน่าย' || a.status === 'สูญหาย';
      const isDisposed = a.status === 'จำหน่ายแล้ว';
      if (filter === 'pending') return isPending;
      if (filter === 'disposed') return isDisposed;
      return isPending || isDisposed;
    });
  }, [assets, filter]);

  const totalCost = disposalItems.reduce((s, a) => s + a.cost, 0);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            บัญชีครุภัณฑ์ชำรุด เสื่อมสภาพ สูญไป และจำหน่ายแล้ว
          </h1>
          <p className="text-xs text-slate-500">
            เปลี่ยนสถานะเป็น &ldquo;จำหน่ายแล้ว&rdquo; พร้อมระบุวันที่จำหน่าย (ระบบไม่ลบแถวออก เพื่อให้ทะเบียนครบถ้วนตรวจสอบย้อนหลังได้)
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'all', label: 'ทั้งหมด' },
                { id: 'pending', label: 'รอเสนอจำหน่าย' },
                { id: 'disposed', label: 'จำหน่ายแล้ว' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilter(opt.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  filter === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-800 whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>พิมพ์บัญชีเสนอจำหน่าย (A4)</span>
          </button>
        </div>
      </div>

      {/* Printable Official Disposal Form */}
      <div className="print-surface bg-white border border-slate-200 rounded-xl p-6 font-sarabun">
        <div className="text-center mb-5">
          <h2 className="text-lg font-bold text-slate-900">
            บัญชีครุภัณฑ์ชำรุด เสื่อมสภาพ สูญไป หรือไม่จำเป็นต้องใช้ เสนอขอจำหน่าย
          </h2>
          <p className="text-sm text-slate-700">
            หน่วยงาน: {settings.agencyName} · ประจำปีงบประมาณ {settings.fiscalYear}
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
                <th className="border border-slate-400 py-2 px-2 text-right">ค่าเสื่อมสะสม</th>
                <th className="border border-slate-400 py-2 px-2 text-right">มูลค่าสุทธิ</th>
                <th className="border border-slate-400 py-2 px-2 text-left">สถานะ / เหตุผล</th>
                <th className="no-print border border-slate-400 py-2 px-2 text-right">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {disposalItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="border border-slate-400 py-8 text-center text-slate-500"
                  >
                    ไม่มีรายการครุภัณฑ์ชำรุดรอจำหน่ายหรือจำหน่ายแล้วในหมวดที่เลือก
                  </td>
                </tr>
              ) : (
                disposalItems.map((asset, idx) => {
                  const cat = reference.categories.find(
                    (c) => c.apcCode === asset.categoryCode
                  );
                  const dep = calculateAssetDepreciation(asset, settings, cat);
                  return (
                    <tr key={asset.id}>
                      <td className="border border-slate-400 py-2 px-2 text-center font-mono-num">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-400 py-2 px-2.5 font-mono-num whitespace-nowrap">
                        {asset.assetCode}
                      </td>
                      <td className="border border-slate-400 py-2 px-2.5">
                        <div className="font-medium text-slate-900">{asset.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {asset.location} · {asset.brandModel}
                        </div>
                      </td>
                      <td className="border border-slate-400 py-2 px-2 text-center whitespace-nowrap">
                        {formatThaiDate(asset.acquisitionDate)}
                      </td>
                      <td className="border border-slate-400 py-2 px-2 text-right font-mono-num">
                        {formatTHB(asset.cost)}
                      </td>
                      <td className="border border-slate-400 py-2 px-2 text-right font-mono-num">
                        {formatTHB(dep.accumulatedDep)}
                      </td>
                      <td className="border border-slate-400 py-2 px-2 text-right font-mono-num">
                        {formatTHB(dep.netBookValue)}
                      </td>
                      <td className="border border-slate-400 py-2 px-2">
                        <AssetStatusLabel status={asset.status} />
                        {asset.disposalDate && (
                          <div className="text-[11px] text-slate-600 mt-0.5">
                            จำหน่าย: {formatThaiDate(asset.disposalDate)}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {asset.disposalReason || asset.notes || '-'}
                        </div>
                      </td>
                      <td className="no-print border border-slate-400 py-2 px-2 text-right whitespace-nowrap">
                        {asset.status !== 'จำหน่ายแล้ว' ? (
                          <button
                            type="button"
                            onClick={() => setDisposalTarget(asset)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 rounded hover:bg-red-100"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>บันทึกจำหน่าย</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>จำหน่ายแล้ว</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {disposalItems.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-900">
                  <td colSpan={4} className="border border-slate-400 py-2 px-3 text-right">
                    รวมราคาทุน ({disposalItems.length} รายการ)
                  </td>
                  <td className="border border-slate-400 py-2 px-2 text-right font-mono-num">
                    {formatTHB(totalCost)}
                  </td>
                  <td colSpan={4} className="border border-slate-400 py-2 px-2"></td>
                </tr>
              </tfoot>
            )}
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

      {/* Confirm Disposal Modal */}
      {disposalTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-lg p-5 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">
              บันทึกจำหน่ายครุภัณฑ์ออกจากทะเบียนใช้งาน
            </h3>
            <p className="text-xs text-slate-600">
              [{disposalTarget.assetCode}] {disposalTarget.name} — ระบบจะเปลี่ยนสถานะเป็น &ldquo;จำหน่ายแล้ว&rdquo; และยังคงรายการไว้เพื่อการตรวจสอบ
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                วันที่อนุมัติจำหน่าย *
              </label>
              <input
                type="date"
                value={disposalDate}
                onChange={(e) => setDisposalDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                วิธีการ / เหตุผลการจำหน่าย
              </label>
              <textarea
                rows={2}
                value={disposalReason}
                onChange={(e) => setDisposalReason(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDisposalTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => {
                  onDisposeAsset(disposalTarget.id, disposalDate, disposalReason);
                  setDisposalTarget(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
              >
                ยืนยันบันทึกจำหน่ายแล้ว
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
