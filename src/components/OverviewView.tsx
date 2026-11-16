import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  Wrench,
} from 'lucide-react';
import {
  ActiveTab,
  AgencySettings,
  AssetAlert,
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

interface OverviewViewProps {
  settings: AgencySettings;
  reference: ReferenceConfig;
  assets: AssetItem[];
  maintenance: MaintenanceRecord[];
  alerts: AssetAlert[];
  onNavigate: (tab: ActiveTab, assetId?: string) => void;
  onOpenAssetModal: () => void;
  onOpenMaintenanceModal: (assetId?: string) => void;
}

export function OverviewView({
  settings,
  reference,
  assets,
  maintenance,
  alerts,
  onNavigate,
  onOpenAssetModal,
  onOpenMaintenanceModal,
}: OverviewViewProps) {
  const fyWindow = getFiscalYearWindow(settings.fiscalYear);

  const activeAssets = assets.filter((a) => a.status !== 'จำหน่ายแล้ว');
  const awaitingDisposal = assets.filter(
    (a) => a.status === 'ชำรุดรอจำหน่าย' || a.status === 'สูญหาย'
  );
  const inRepairCount = assets.filter(
    (a) => a.status === 'รอซ่อม' || a.status === 'อยู่ระหว่างซ่อม'
  ).length;

  let totalCost = 0;
  let totalNBV = 0;
  let totalThisYearDep = 0;
  let depreciableCount = 0;

  for (const asset of activeAssets) {
    const cat = reference.categories.find((c) => c.apcCode === asset.categoryCode);
    const dep = calculateAssetDepreciation(asset, settings, cat);
    totalCost += asset.cost;
    totalNBV += dep.netBookValue;
    totalThisYearDep += dep.thisYearDep;
    if (dep.isDepreciable) depreciableCount++;
  }

  const validationErrors = alerts.filter((a) => a.category === 'validation_error');
  const urgentAlerts = alerts.filter((a) => a.category !== 'validation_error');

  const currentFYAcqCost = assets
    .filter((a) => {
      const cat = reference.categories.find((c) => c.apcCode === a.categoryCode);
      return calculateAssetDepreciation(a, settings, cat).isAcquiredInCurrentFY;
    })
    .reduce((s, a) => s + a.cost, 0);

  const totalMaintenanceSpend = maintenance.reduce((s, m) => s + m.cost, 0);

  const workflowSteps: Array<{
    step: number;
    tab: ActiveTab;
    label: string;
    desc: string;
  }> = [
    {
      step: 1,
      tab: 'settings',
      label: 'ตั้งค่า',
      desc: 'กรอกชื่อหน่วยงาน ปีงบประมาณที่รายงาน ราคาขั้นต่ำที่คิดค่าเสื่อม คำสั่งแต่งตั้งกรรมการ และผู้ลงนาม',
    },
    {
      step: 2,
      tab: 'settings',
      label: 'รายการอ้างอิง',
      desc: 'ตรวจประเภทครุภัณฑ์ + อายุการใช้งาน (แก้ได้) · สถานที่/ห้อง · วิธีได้มา · แหล่งเงิน',
    },
    {
      step: 3,
      tab: 'registry',
      label: 'ทะเบียนครุภัณฑ์',
      desc: 'ลงทะเบียนครุภัณฑ์ 1 แถวต่อ 1 รายการ — ค่าเสื่อมต่อปี ปีนี้ สะสม และมูลค่าสุทธิคำนวณให้ทันที',
    },
    {
      step: 4,
      tab: 'maintenance',
      label: 'ซ่อมบำรุงและติดตาม',
      desc: 'บันทึกประวัติการซ่อม สอบเทียบเครื่องมือแพทย์ ค่าใช้จ่าย และกำหนดบำรุงรักษาครั้งถัดไป',
    },
    {
      step: 5,
      tab: 'individual',
      label: 'ทะเบียนรายตัว',
      desc: 'เลือกรหัสครุภัณฑ์ → ทะเบียนคุมทรัพย์สินรายตัว พร้อมตารางค่าเสื่อมและประวัติซ่อม (พิมพ์ได้ 1 หน้า)',
    },
    {
      step: 6,
      tab: 'depreciation',
      label: 'ค่าเสื่อมราคา',
      desc: 'รายงานค่าเสื่อมราคาประจำปี (ยกมา · ปีนี้ · สะสม · มูลค่าสุทธิ) พร้อมพิมพ์ A4',
    },
    {
      step: 7,
      tab: 'inspection',
      label: 'ตรวจสอบพัสดุ & GFMIS',
      desc: 'เอกสารหมายเลข 6 (ครุภัณฑ์ต่ำกว่าเกณฑ์ & ตามเกณฑ์) · เอกสารหมายเลข 5 GFMIS · บันทึกข้อความ ข้อ 213 พร้อมพิมพ์ A4 และส่งออก Excel',
    },
    {
      step: 8,
      tab: 'disposal',
      label: 'ชำรุดเสนอจำหน่าย',
      desc: 'บัญชีครุภัณฑ์ชำรุด เสื่อมสภาพ สูญไป หรือไม่จำเป็นต้องใช้ ที่เสนอขอจำหน่าย',
    },
    {
      step: 9,
      tab: 'budget',
      label: 'สรุปงบประมาณและกราฟ',
      desc: 'สรุปงบจัดซื้อ-ซ่อมบำรุงแบบเรียลไทม์ จำแนกตามประเภทครุภัณฑ์ สถานที่ และแหล่งเงิน พร้อมกราฟ',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Institutional Hero Header (Inspired by Image 1) */}
      <div className="bg-emerald-950 text-white rounded-xl border border-emerald-900 overflow-hidden">
        <div className="px-6 py-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold tracking-tight">
              ทะเบียนครุภัณฑ์และค่าเสื่อมราคาออนไลน์
            </h1>
            <p className="text-xs sm:text-sm text-emerald-100/90 mt-1">
              ทะเบียนคุมทรัพย์สิน · ค่าเสื่อมราคาแบบเส้นตรงตามหลักเกณฑ์กรมบัญชีกลาง · ติดตามซ่อมบำรุง · รายงานงบประมาณแบบเรียลไทม์
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onOpenMaintenanceModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-950 bg-emerald-100 hover:bg-white rounded-lg transition-colors whitespace-nowrap"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>บันทึกแจ้งซ่อม / PM</span>
            </button>
            <button
              type="button"
              onClick={onOpenAssetModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 border border-emerald-500/40 rounded-lg transition-colors whitespace-nowrap"
            >
              <span>+ ลงทะเบียนครุภัณฑ์</span>
            </button>
          </div>
        </div>
        <div className="bg-emerald-900/60 px-6 py-2.5 border-t border-emerald-800/80 text-xs text-emerald-100 flex flex-wrap items-center justify-between gap-2">
          <span>
            ระบบพร้อมใช้งานต่อเนื่องทุกปีงบประมาณ — เปลี่ยนปีงบประมาณที่หน้าตั้งค่าแล้วลงครุภัณฑ์ใหม่ต่อท้ายได้ทันที
          </span>
          <span className="font-mono-num text-emerald-200">
            ปีงบประมาณ {settings.fiscalYear} ({fyWindow.labelShort})
          </span>
        </div>
      </div>

      {/* Real-time Budget & Status Pulse Strip (4-column KPI grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">มูลค่าราคาทุนคงอยู่สิ้นปี</div>
          <div className="text-2xl font-bold text-slate-900 mt-1 font-mono-num">
            {formatTHB(totalCost)} <span className="text-sm font-normal text-slate-500">฿</span>
          </div>
          <div className="text-xs text-slate-500 mt-1.5">
            {formatInt(activeAssets.length)} รายการคงอยู่ · {formatInt(assets.length)} ทั้งหมด
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">มูลค่าสุทธิตามบัญชี (NBV)</div>
          <div className="text-2xl font-bold text-emerald-900 mt-1 font-mono-num">
            {formatTHB(totalNBV)} <span className="text-sm font-normal text-slate-500">฿</span>
          </div>
          <div className="text-xs text-slate-500 mt-1.5 font-mono-num">
            ค่าเสื่อมปีนี้ {formatTHB(totalThisYearDep)} ฿ ({depreciableCount} รายการ)
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">ใช้งบลงทุนจัดซื้อปี {settings.fiscalYear}</div>
          <div className="text-2xl font-bold text-slate-900 mt-1 font-mono-num">
            {formatTHB(currentFYAcqCost)} <span className="text-sm font-normal text-slate-500">฿</span>
          </div>
          <div className="text-xs text-slate-500 mt-1.5 font-mono-num">
            จากวงเงินตั้งไว้ {formatTHB(settings.annualCapitalBudget)} ฿
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">ค่าใช้จ่ายซ่อมบำรุงสะสม</div>
          <div className="text-2xl font-bold text-slate-900 mt-1 font-mono-num">
            {formatTHB(totalMaintenanceSpend)} <span className="text-sm font-normal text-slate-500">฿</span>
          </div>
          <div className="text-xs text-slate-500 mt-1.5 font-mono-num">
            งบซ่อมบำรุงตั้งไว้ {formatTHB(settings.annualMaintenanceBudget)} ฿ · ซ่อมอยู่ {inRepairCount} รายการ
          </div>
        </div>
      </div>

      {/* Main 2-column grid: สถานะข้อมูล (Image 1) + แจ้งเตือนสถานะการใช้งานและซ่อมบำรุง */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: สถานะข้อมูล (matches Image 1 table cleanly) */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">สถานะข้อมูลทะเบียนคุม</h2>
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="text-xs font-medium text-emerald-800 hover:underline"
            >
              แก้ไขการตั้งค่า
            </button>
          </div>
          <div className="divide-y divide-slate-200 text-sm">
            <div className="grid grid-cols-3 px-5 py-3 bg-emerald-50/35">
              <div className="text-slate-600 font-medium">หน่วยงาน</div>
              <div className="col-span-2 text-slate-900 font-medium">
                {settings.agencyName}
              </div>
            </div>
            <div className="grid grid-cols-3 px-5 py-3">
              <div className="text-slate-600 font-medium">ปีงบประมาณที่รายงาน</div>
              <div className="col-span-2 text-slate-900 font-mono-num">
                {settings.fiscalYear} ({fyWindow.labelShort})
              </div>
            </div>
            <div className="grid grid-cols-3 px-5 py-3 bg-emerald-50/35">
              <div className="text-slate-600 font-medium">ครุภัณฑ์ในทะเบียน</div>
              <div className="col-span-2 text-slate-900">
                {formatInt(assets.length)} รายการ · คงอยู่สิ้นปี {formatInt(activeAssets.length)} รายการ · รอจำหน่าย {formatInt(awaitingDisposal.length)} รายการ
              </div>
            </div>
            <div className="grid grid-cols-3 px-5 py-3">
              <div className="text-slate-600 font-medium">มูลค่า ณ สิ้นปีงบประมาณ</div>
              <div className="col-span-2 text-slate-900 font-mono-num">
                ราคาทุน {formatTHB(totalCost)} · มูลค่าสุทธิ {formatTHB(totalNBV)} บาท
              </div>
            </div>
            <div className="grid grid-cols-3 px-5 py-3 bg-emerald-50/35">
              <div className="text-slate-600 font-medium">ค่าเสื่อมราคาปีนี้</div>
              <div className="col-span-2 text-slate-900 font-mono-num">
                {formatTHB(totalThisYearDep)} บาท (จาก {formatInt(depreciableCount)} รายการที่คิดค่าเสื่อม)
              </div>
            </div>
            <div className="grid grid-cols-3 px-5 py-3">
              <div className="text-slate-600 font-medium">ผลการตรวจสอบข้อมูล</div>
              <div className="col-span-2">
                {validationErrors.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onNavigate('registry')}
                    className="inline-flex items-center gap-1.5 text-red-700 font-medium hover:underline text-left"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      ต้องตรวจแก้ในทะเบียนครุภัณฑ์ {validationErrors.length} รายการ
                    </span>
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>ข้อมูลทะเบียนครุภัณฑ์ครบถ้วนสมบูรณ์ทุกรายการ</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Right: Real-time Usage & Maintenance Alerts */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-semibold text-slate-900">
                แจ้งเตือนสถานะการใช้งานและซ่อมบำรุง ({alerts.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('maintenance')}
              className="text-xs font-medium text-emerald-800 hover:underline"
            >
              ดูงานซ่อมทั้งหมด
            </button>
          </div>

          {alerts.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              ไม่มีรายการแจ้งเตือนเร่งด่วน ครุภัณฑ์ทุกรายการอยู่ในสภาพพร้อมใช้งาน
            </div>
          ) : (
            <div className="divide-y divide-slate-200 max-h-[340px] overflow-y-auto">
              {[...urgentAlerts, ...validationErrors].slice(0, 8).map((al) => (
                <div
                  key={al.id}
                  className="px-5 py-3 flex items-start justify-between gap-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${
                          al.severity === 'critical'
                            ? 'text-red-700'
                            : al.severity === 'warning'
                            ? 'text-amber-700'
                            : 'text-sky-700'
                        }`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{al.title}</span>
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-xs text-slate-500 font-mono-num truncate">
                        {al.assetCode}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-slate-900 mt-0.5 truncate">
                      {al.assetName}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {al.location} · {al.detail}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 pt-1">
                    <button
                      type="button"
                      onClick={() => onNavigate('individual', al.assetId)}
                      className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
                    >
                      ดูรายตัว
                    </button>
                    {al.category !== 'validation_error' && (
                      <button
                        type="button"
                        onClick={() => onOpenMaintenanceModal(al.assetId)}
                        className="px-2.5 py-1 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 whitespace-nowrap"
                      >
                        บันทึกซ่อม
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 8-Step Workflow Navigation (Mirrors Image 2) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-emerald-800" />
            <h2 className="text-sm font-semibold text-slate-900">
              ขั้นตอนการใช้งานระบบ (คลิกเพื่อไปยังโมดูลที่ต้องการ)
            </h2>
          </div>
        </div>
        <div className="divide-y divide-slate-200">
          {workflowSteps.map((item) => (
            <button
              key={item.step}
              type="button"
              onClick={() => onNavigate(item.tab)}
              className="w-full text-left grid grid-cols-12 items-center hover:bg-emerald-50/40 transition-colors"
            >
              <div className="col-span-1 bg-emerald-900 text-white font-semibold text-sm py-3 text-center font-mono-num">
                {item.step}
              </div>
              <div className="col-span-4 sm:col-span-3 px-4 py-3 font-medium text-sm text-emerald-900 underline underline-offset-2 decoration-emerald-700/40">
                {item.label}
              </div>
              <div className="col-span-7 sm:col-span-8 px-4 py-3 text-xs sm:text-sm text-slate-600 flex items-center justify-between gap-2">
                <span>{item.desc}</span>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 hidden sm:block" />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ข้อควรรู้ (Mirrors Image 3) */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-900 pb-3 border-b border-slate-200">
          ข้อควรรู้และหลักเกณฑ์การคำนวณค่าเสื่อมราคา
        </h2>
        <ul className="mt-3 space-y-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
          <li>
            • <strong className="text-slate-800">ค่าเสื่อมราคาแบบเส้นตรง:</strong> ต่อปี = ราคาทุน ÷ อายุการใช้งาน · ปีแรกคิดตามจำนวนวัน (วัน/365) · ค่าเสื่อมสะสมไม่เกิน ราคาทุน − 1 บาท
          </li>
          <li>
            • <strong className="text-slate-800">ครุภัณฑ์ราคาต่ำกว่าเกณฑ์:</strong> ตั้งค่าเกณฑ์ขั้นต่ำได้ (ค่าเริ่มต้น {formatTHB(settings.minDepreciationCost)} บาท) และที่ดิน ลงทะเบียนคุมได้แต่ไม่คิดค่าเสื่อมราคา
          </li>
          <li>
            • <strong className="text-slate-800">ขึ้นปีงบประมาณใหม่:</strong> เปลี่ยนปีงบประมาณที่เมนูตั้งค่า แล้วลงทะเบียนครุภัณฑ์ใหม่ต่อท้าย — ค่าเสื่อมทุกรายการคำนวณถึงปีงบประมาณใหม่ให้อัตโนมัติ
          </li>
          <li>
            • <strong className="text-slate-800">จำหน่ายครุภัณฑ์:</strong> เปลี่ยนสถานะเป็น &ldquo;จำหน่ายแล้ว&rdquo; และกรอกวันที่จำหน่าย (ห้ามลบแถว เพื่อคงหลักฐานตรวจสอบย้อนหลังได้ครบถ้วน)
          </li>
          <li>
            • <strong className="text-slate-800">การพิมพ์เอกสารราชการ A4:</strong> ทุกรายงานจัดรูปแบบฟอนต์ Sarabun มาตรฐาน A4 พร้อมช่องลงนามผู้จัดทำ ผู้รับรอง และหัวหน้าหน่วยงาน กดพิมพ์ได้ทันที
          </li>
        </ul>
      </section>
    </div>
  );
}
