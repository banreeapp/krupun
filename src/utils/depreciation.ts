import {
  AgencySettings,
  AssetAlert,
  AssetCategory,
  AssetItem,
  DepreciationResult,
  MaintenanceRecord,
  YearlyDepreciationRow,
} from '../types/asset';

const MS_PER_DAY = 86_400_000;

export function parseISODate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function getFiscalYearWindow(fiscalYearBE: number): {
  start: Date;
  end: Date;
  prevEnd: Date;
  labelShort: string;
} {
  const endAD = fiscalYearBE - 543;
  const start = new Date(endAD - 1, 9, 1); // 1 Oct
  const end = new Date(endAD, 8, 30); // 30 Sep
  const prevEnd = new Date(endAD - 1, 8, 30);
  const startYearShort = String((fiscalYearBE - 1) % 100).padStart(2, '0');
  const endYearShort = String(fiscalYearBE % 100).padStart(2, '0');
  return {
    start,
    end,
    prevEnd,
    labelShort: `1 ต.ค. ${startYearShort} – 30 ก.ย. ${endYearShort}`,
  };
}

export function getFiscalYearOfDate(date: Date): number {
  const yearAD = date.getFullYear();
  const month = date.getMonth(); // 0-indexed (9 = Oct)
  const fyAD = month >= 9 ? yearAD + 1 : yearAD;
  return fyAD + 543;
}

export function daysInclusive(start: Date, end: Date): number {
  const diff = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  return Math.max(0, diff);
}

/**
 * Straight-line depreciation per Thai Comptroller General's Department (กรมบัญชีกลาง):
 * - Annual = Cost / Useful Life
 * - First year pro-rated by actual days (days / 365)
 * - Accumulated depreciation capped at Cost - 1 THB (residual value = 1 THB)
 * - Land and assets below minDepreciationCost (default 10,000 THB) do not depreciate
 */
export function calculateAssetDepreciation(
  asset: AssetItem,
  settings: AgencySettings,
  category?: AssetCategory
): DepreciationResult {
  const { start: fyStart, end: fyEnd } = getFiscalYearWindow(settings.fiscalYear);
  const acqDate = parseISODate(asset.acquisitionDate);
  const disposalDate = parseISODate(asset.disposalDate);

  const isLand = Boolean(category?.isLand);
  const isBelowThreshold = asset.cost < settings.minDepreciationCost;
  const hasInvalidLife = asset.usefulLifeYears <= 0;

  if (isLand || isBelowThreshold || hasInvalidLife || !acqDate) {
    let reason = 'ไม่คิดค่าเสื่อมราคา';
    if (isLand) reason = 'ที่ดิน (ไม่คิดค่าเสื่อมราคา)';
    else if (isBelowThreshold)
      reason = `ราคาทุนต่ำกว่าเกณฑ์ (${formatTHB(settings.minDepreciationCost)} บาท)`;
    else if (hasInvalidLife) reason = 'อายุการใช้งาน 0 ปี';
    else if (!acqDate) reason = 'ไม่ระบุวันที่ได้มา';

    const isDisposedPrior =
      asset.status === 'จำหน่ายแล้ว' && disposalDate !== null && disposalDate < fyStart;
    const isDisposedThisYear =
      asset.status === 'จำหน่ายแล้ว' &&
      disposalDate !== null &&
      disposalDate >= fyStart &&
      disposalDate <= fyEnd;

    return {
      isDepreciable: false,
      nonDepreciableReason: reason,
      annualRate: 0,
      broughtForwardDep: 0,
      thisYearDep: 0,
      accumulatedDep: 0,
      netBookValue: asset.status === 'จำหน่ายแล้ว' ? 0 : asset.cost,
      firstYearDays: 0,
      remainingLifeYears: asset.usefulLifeYears,
      isFullyDepreciated: false,
      isDisposedInCurrentFY: isDisposedThisYear,
      isDisposedPriorFY: isDisposedPrior,
      isAcquiredInCurrentFY: Boolean(acqDate && acqDate >= fyStart && acqDate <= fyEnd),
      schedule: [],
    };
  }

  const maxDepreciable = Math.max(0, asset.cost - 1);
  const annualRate = asset.cost / asset.usefulLifeYears;
  const acqFY = getFiscalYearOfDate(acqDate);
  const firstFYWindow = getFiscalYearWindow(acqFY);
  const firstYearDays = Math.min(365, daysInclusive(acqDate, firstFYWindow.end));

  // Build full multi-year schedule from acquisition FY up to max(currentFY, acqFY + usefulLifeYears + 1)
  const schedule: YearlyDepreciationRow[] = [];
  const totalScheduleYears = Math.max(
    asset.usefulLifeYears + 2,
    settings.fiscalYear - acqFY + 1
  );

  let runningAccum = 0;
  let bfForSelectedFY = 0;
  let thisYearForSelectedFY = 0;
  let accumForSelectedFY = 0;
  let nbvForSelectedFY = asset.cost;

  const isDisposed = asset.status === 'จำหน่ายแล้ว';
  const effectiveDisposalDate = isDisposed ? disposalDate : null;

  for (let i = 0; i < totalScheduleYears; i++) {
    const fy = acqFY + i;
    const win = getFiscalYearWindow(fy);
    const prevAccum = runningAccum;

    let depThisYear = 0;
    let daysInPeriod = 365;

    if (effectiveDisposalDate && effectiveDisposalDate < win.start) {
      depThisYear = 0;
      daysInPeriod = 0;
    } else if (i === 0) {
      const endDate =
        effectiveDisposalDate && effectiveDisposalDate < win.end
          ? effectiveDisposalDate
          : win.end;
      daysInPeriod = Math.min(365, daysInclusive(acqDate, endDate));
      depThisYear = Math.min(maxDepreciable - prevAccum, annualRate * (daysInPeriod / 365));
    } else if (
      effectiveDisposalDate &&
      effectiveDisposalDate >= win.start &&
      effectiveDisposalDate <= win.end
    ) {
      daysInPeriod = Math.min(365, daysInclusive(win.start, effectiveDisposalDate));
      depThisYear = Math.min(maxDepreciable - prevAccum, annualRate * (daysInPeriod / 365));
    } else {
      depThisYear = Math.min(maxDepreciable - prevAccum, annualRate);
    }

    depThisYear = Math.max(0, round2(depThisYear));
    runningAccum = Math.min(maxDepreciable, round2(prevAccum + depThisYear));

    const disposedByEnd = Boolean(
      effectiveDisposalDate && effectiveDisposalDate <= win.end
    );
    const nbv = disposedByEnd ? 0 : Math.max(1, round2(asset.cost - runningAccum));

    schedule.push({
      fiscalYear: fy,
      periodLabel: win.labelShort,
      daysInPeriod,
      broughtForward: round2(prevAccum),
      depreciationThisYear: depThisYear,
      accumulated: runningAccum,
      netBookValue: nbv,
    });

    if (fy === settings.fiscalYear) {
      bfForSelectedFY = round2(prevAccum);
      thisYearForSelectedFY = depThisYear;
      accumForSelectedFY = runningAccum;
      nbvForSelectedFY = nbv;
    }

    if (runningAccum >= maxDepreciable && i >= asset.usefulLifeYears) {
      // Continue only until selected fiscal year is captured
      if (fy >= settings.fiscalYear) break;
    }
  }

  // Handle case where acquisition date is in a future fiscal year relative to settings.fiscalYear
  if (acqFY > settings.fiscalYear) {
    bfForSelectedFY = 0;
    thisYearForSelectedFY = 0;
    accumForSelectedFY = 0;
    nbvForSelectedFY = 0;
  }

  const isDisposedPriorFY = Boolean(
    isDisposed && effectiveDisposalDate && effectiveDisposalDate < fyStart
  );
  const isDisposedInCurrentFY = Boolean(
    isDisposed &&
      effectiveDisposalDate &&
      effectiveDisposalDate >= fyStart &&
      effectiveDisposalDate <= fyEnd
  );
  const isAcquiredInCurrentFY = Boolean(acqDate >= fyStart && acqDate <= fyEnd);

  const yearsElapsed = Math.max(0, settings.fiscalYear - acqFY + 1);
  const remainingLifeYears = Math.max(0, asset.usefulLifeYears - yearsElapsed);

  return {
    isDepreciable: true,
    annualRate: round2(annualRate),
    broughtForwardDep: bfForSelectedFY,
    thisYearDep: thisYearForSelectedFY,
    accumulatedDep: accumForSelectedFY,
    netBookValue: isDisposed ? 0 : nbvForSelectedFY,
    firstYearDays,
    remainingLifeYears,
    isFullyDepreciated: accumForSelectedFY >= maxDepreciable - 0.01 && !isDisposed,
    isDisposedInCurrentFY,
    isDisposedPriorFY,
    isAcquiredInCurrentFY,
    schedule,
  };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatTHB(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatInt(n: number): string {
  return new Intl.NumberFormat('th-TH').format(n);
}

const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

const THAI_MONTHS_FULL = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

export function formatThaiDate(dateStr?: string, fullMonth = false): string {
  const d = parseISODate(dateStr);
  if (!d) return '-';
  const day = d.getDate();
  const month = fullMonth
    ? THAI_MONTHS_FULL[d.getMonth()]
    : THAI_MONTHS_SHORT[d.getMonth()];
  const yearBE = d.getFullYear() + 543;
  return `${day} ${month} ${fullMonth ? yearBE : String(yearBE).slice(-2)}`;
}

export function formatThaiDateLong(dateStr?: string): string {
  return formatThaiDate(dateStr, true);
}

export function formatThaiDateNumeric(dateStr?: string): string {
  const d = parseISODate(dateStr);
  if (!d) return '-';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const yearBE = d.getFullYear() + 543;
  return `${day}.${month}.${yearBE}`;
}

export function inferAssetUnit(
  asset: AssetItem,
  category?: AssetCategory
): string {
  if (asset.unit && asset.unit.trim()) return asset.unit.trim();
  if (category?.isBuilding) return 'หลัง';
  if (category?.apcCode === '1206020101') return 'คัน';
  if (category?.isIntangible) return 'ระบบ';
  const n = asset.name;
  if (n.includes('ตู้')) return 'ตู้';
  if (n.includes('เก้าอี้') || n.includes('โต๊ะ')) return 'ตัว';
  if (n.includes('รถ')) return 'คัน';
  if (n.includes('อาคาร')) return 'หลัง';
  if (n.includes('ชุด') || n.includes('ยูนิต')) return 'ชุด';
  return 'เครื่อง';
}

/**
 * Generates real-time alerts for asset usage status, maintenance schedules,
 * warranty expirations, pending disposals, and registry data validation errors.
 */
export function computeAssetAlerts(
  assets: AssetItem[],
  maintenanceRecords: MaintenanceRecord[],
  referenceDate: Date = new Date()
): AssetAlert[] {
  const alerts: AssetAlert[] = [];
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );

  for (const asset of assets) {
    // 1. Data validation checks (mirrors Image 1: "ผลการตรวจสอบข้อมูล: ต้องตรวจแก้...")
    const missingFields: string[] = [];
    if (!asset.assetCode.trim()) missingFields.push('รหัสครุภัณฑ์');
    if (!asset.acquisitionDate) missingFields.push('วันที่ได้มา');
    if (!asset.location.trim()) missingFields.push('สถานที่/ห้อง');
    if (asset.cost <= 0) missingFields.push('ราคาทุน');
    if (asset.status === 'จำหน่ายแล้ว' && !asset.disposalDate)
      missingFields.push('วันที่จำหน่าย');

    if (missingFields.length > 0) {
      alerts.push({
        id: `val-${asset.id}`,
        assetId: asset.id,
        assetCode: asset.assetCode || '(ไม่มีรหัส)',
        assetName: asset.name,
        location: asset.location || '-',
        severity: 'warning',
        category: 'validation_error',
        title: 'ข้อมูลทะเบียนไม่สมบูรณ์',
        detail: `ต้องตรวจสอบ/แก้ไข: ${missingFields.join(', ')}`,
      });
    }

    if (asset.status === 'จำหน่ายแล้ว') continue;

    // 2. Repair status alerts
    if (asset.status === 'รอซ่อม' || asset.status === 'อยู่ระหว่างซ่อม') {
      const activeJob = maintenanceRecords.find(
        (m) => m.assetId === asset.id && m.status !== 'เสร็จสิ้น'
      );
      alerts.push({
        id: `repair-${asset.id}`,
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.name,
        location: asset.location,
        severity: asset.status === 'รอซ่อม' ? 'critical' : 'warning',
        category: 'repair_pending',
        title: asset.status === 'รอซ่อม' ? 'ครุภัณฑ์รอการซ่อมบำรุง' : 'กำลังอยู่ระหว่างซ่อมแซม',
        detail: activeJob
          ? `${activeJob.description} (${activeJob.vendorOrTechnician})`
          : 'รอเปิดใบแจ้งซ่อมหรือติดตามผลการซ่อม',
      });
    }

    // 3. Damaged / awaiting disposal
    if (asset.status === 'ชำรุดรอจำหน่าย' || asset.status === 'สูญหาย') {
      alerts.push({
        id: `disp-${asset.id}`,
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.name,
        location: asset.location,
        severity: 'warning',
        category: 'disposal_pending',
        title: asset.status === 'สูญหาย' ? 'ครุภัณฑ์สูญหาย รอตรวจสอบ' : 'ชำรุด รอเสนอจำหน่าย',
        detail: 'เตรียมจัดทำบัญชีเสนอจำหน่ายตามระเบียบฯ พัสดุ 2560',
      });
    }

    // 4. Maintenance / Calibration schedule alerts
    if (asset.nextMaintenanceDate) {
      const nextDate = parseISODate(asset.nextMaintenanceDate);
      if (nextDate) {
        const diffDays = Math.floor((nextDate.getTime() - today.getTime()) / MS_PER_DAY);
        if (diffDays < 0) {
          alerts.push({
            id: `maint-over-${asset.id}`,
            assetId: asset.id,
            assetCode: asset.assetCode,
            assetName: asset.name,
            location: asset.location,
            severity: 'critical',
            category: 'maintenance_overdue',
            title: `เลยกำหนดบำรุงรักษา/สอบเทียบ ${Math.abs(diffDays)} วัน`,
            detail: `ครบกำหนดเมื่อ ${formatThaiDate(asset.nextMaintenanceDate)}`,
            dueDate: asset.nextMaintenanceDate,
          });
        } else if (diffDays <= 30) {
          alerts.push({
            id: `maint-soon-${asset.id}`,
            assetId: asset.id,
            assetCode: asset.assetCode,
            assetName: asset.name,
            location: asset.location,
            severity: 'warning',
            category: 'maintenance_upcoming',
            title: `ใกล้ครบกำหนดบำรุงรักษาใน ${diffDays} วัน`,
            detail: `กำหนดวันที่ ${formatThaiDate(asset.nextMaintenanceDate)}`,
            dueDate: asset.nextMaintenanceDate,
          });
        }
      }
    }

    // 5. Warranty expiring within 60 days
    if (asset.warrantyExpiryDate) {
      const warDate = parseISODate(asset.warrantyExpiryDate);
      if (warDate) {
        const diffDays = Math.floor((warDate.getTime() - today.getTime()) / MS_PER_DAY);
        if (diffDays >= 0 && diffDays <= 60) {
          alerts.push({
            id: `war-${asset.id}`,
            assetId: asset.id,
            assetCode: asset.assetCode,
            assetName: asset.name,
            location: asset.location,
            severity: 'info',
            category: 'warranty_expiring',
            title: `การรับประกันใกล้หมดใน ${diffDays} วัน`,
            detail: `สิ้นสุดประกัน ${formatThaiDate(asset.warrantyExpiryDate)}`,
            dueDate: asset.warrantyExpiryDate,
          });
        }
      }
    }
  }

  const severityOrder = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
