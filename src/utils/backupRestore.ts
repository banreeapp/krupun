import {
  AcquisitionMethod,
  AgencySettings,
  AssetCategory,
  AssetItem,
  AssetStatus,
  FundingSource,
  MaintenanceRecord,
  MaintenanceStatus,
  MaintenanceType,
  ReferenceConfig,
} from '../types/asset';

export interface AssetBackupPayload {
  schemaVersion: 1;
  app: 'thai-asset-registry';
  exportedAt: string;
  data: {
    settings: AgencySettings;
    reference: ReferenceConfig;
    assets: AssetItem[];
    maintenance: MaintenanceRecord[];
  };
}

export interface BackupValidationSuccess {
  ok: true;
  data: {
    settings: AgencySettings;
    reference: ReferenceConfig;
    assets: AssetItem[];
    maintenance: MaintenanceRecord[];
  };
  summary: {
    agencyName: string;
    fiscalYear: number;
    exportedAt?: string;
    assetCount: number;
    maintenanceCount: number;
    categoryCount: number;
    locationCount: number;
    warnings: string[];
  };
}

export interface BackupValidationFailure {
  ok: false;
  error: string;
}

export type BackupValidationResult =
  | BackupValidationSuccess
  | BackupValidationFailure;

const VALID_ASSET_STATUSES: AssetStatus[] = [
  'ใช้งานปกติ',
  'รอซ่อม',
  'อยู่ระหว่างซ่อม',
  'ชำรุดรอจำหน่าย',
  'สูญหาย',
  'จำหน่ายแล้ว',
];

const VALID_ACQUISITION_METHODS: AcquisitionMethod[] = [
  'ซื้อ',
  'รับบริจาค',
  'รับโอน',
  'ปรับปรุงบัญชี',
];

const VALID_FUNDING_SOURCES: FundingSource[] = [
  'งบประมาณแผ่นดิน',
  'เงินบำรุง รพ.สต.',
  'เงินบริจาค',
  'งบ อปท./อบจ.',
  'เงินนอกงบประมาณอื่น',
];

const VALID_MAINT_TYPES: MaintenanceType[] = [
  'บำรุงรักษาเชิงป้องกัน (PM)',
  'ซ่อมแซมแก้ไข (CM)',
  'สอบเทียบเครื่องมือแพทย์ (Calibration)',
  'เปลี่ยนอะไหล่',
];

const VALID_MAINT_STATUSES: MaintenanceStatus[] = [
  'รอดำเนินการ',
  'กำลังดำเนินการ',
  'เสร็จสิ้น',
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeSignatory(
  v: unknown,
  fallback: { name: string; position: string }
): { name: string; position: string } {
  if (!isRecord(v)) return { ...fallback };
  return {
    name: asString(v.name, fallback.name),
    position: asString(v.position, fallback.position),
  };
}

export function exportSystemBackupJson(params: {
  settings: AgencySettings;
  reference: ReferenceConfig;
  assets: AssetItem[];
  maintenance: MaintenanceRecord[];
}) {
  const { settings, reference, assets, maintenance } = params;
  const payload: AssetBackupPayload = {
    schemaVersion: 1,
    app: 'thai-asset-registry',
    exportedAt: new Date().toISOString(),
    data: {
      settings,
      reference,
      assets,
      maintenance,
    },
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const safeAgency =
    settings.agencyName
      .replace(/[^\w\u0E00-\u0E7F-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'หน่วยงาน';
  const datePart = new Date().toISOString().slice(0, 10);

  const link = document.createElement('a');
  link.href = url;
  link.download = `สำรองข้อมูลครุภัณฑ์_${safeAgency}_ปี${settings.fiscalYear}_${datePart}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function parseAndValidateBackupJson(
  rawText: string,
  fallbackSettings: AgencySettings,
  fallbackReference: ReferenceConfig
): BackupValidationResult {
  if (!rawText.trim()) {
    return { ok: false, error: 'ไฟล์ที่เลือกไม่มีข้อมูล (ไฟล์ว่างเปล่า)' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      error: 'รูปแบบไฟล์ JSON ไม่ถูกต้อง ไม่สามารถอ่านข้อมูลได้',
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      error: 'โครงสร้างไฟล์ไม่ถูกต้อง (ต้องเป็น JSON Object)',
    };
  }

  if (parsed.app && parsed.app !== 'thai-asset-registry') {
    return {
      ok: false,
      error: 'ไฟล์นี้ไม่ใช่ไฟล์สำรองข้อมูลจากระบบทะเบียนครุภัณฑ์ออนไลน์',
    };
  }

  const exportedAt =
    typeof parsed.exportedAt === 'string' ? parsed.exportedAt : undefined;
  const root = isRecord(parsed.data) ? parsed.data : parsed;

  if (!Array.isArray(root.assets)) {
    return {
      ok: false,
      error: 'ไม่พบรายการข้อมูลครุภัณฑ์ (assets) ในไฟล์สำรองข้อมูล',
    };
  }

  if (!isRecord(root.settings)) {
    return {
      ok: false,
      error: 'ไม่พบข้อมูลการตั้งค่าหน่วยงาน (settings) ในไฟล์สำรองข้อมูล',
    };
  }

  const warnings: string[] = [];

  // Validate settings
  const rawSettings = root.settings;
  const fiscalYear = Math.round(
    asNumber(rawSettings.fiscalYear, fallbackSettings.fiscalYear)
  );
  if (fiscalYear < 2500 || fiscalYear > 2700) {
    return {
      ok: false,
      error: `ปีงบประมาณในไฟล์ (${fiscalYear}) ไม่อยู่ในช่วง พ.ศ. ที่รองรับ`,
    };
  }

  const settings: AgencySettings = {
    agencyName:
      asString(rawSettings.agencyName).trim() || fallbackSettings.agencyName,
    agencyCode: asString(rawSettings.agencyCode, fallbackSettings.agencyCode),
    disbursementUnit: asString(
      rawSettings.disbursementUnit,
      fallbackSettings.disbursementUnit
    ),
    department: asString(rawSettings.department, fallbackSettings.department),
    fiscalYear,
    minDepreciationCost: Math.max(
      0,
      asNumber(
        rawSettings.minDepreciationCost,
        fallbackSettings.minDepreciationCost
      )
    ),
    committeeOrderNo: asString(
      rawSettings.committeeOrderNo,
      fallbackSettings.committeeOrderNo
    ),
    inspectionDate: asString(
      rawSettings.inspectionDate,
      fallbackSettings.inspectionDate
    ),
    annualCapitalBudget: Math.max(
      0,
      asNumber(
        rawSettings.annualCapitalBudget,
        fallbackSettings.annualCapitalBudget
      )
    ),
    annualMaintenanceBudget: Math.max(
      0,
      asNumber(
        rawSettings.annualMaintenanceBudget,
        fallbackSettings.annualMaintenanceBudget
      )
    ),
    preparer: sanitizeSignatory(rawSettings.preparer, fallbackSettings.preparer),
    verifier: sanitizeSignatory(rawSettings.verifier, fallbackSettings.verifier),
    committeeChair: sanitizeSignatory(
      rawSettings.committeeChair,
      fallbackSettings.committeeChair || { name: '', position: '' }
    ),
    committeeMember2: sanitizeSignatory(
      rawSettings.committeeMember2,
      fallbackSettings.committeeMember2 || { name: '', position: '' }
    ),
    committeeMember3: sanitizeSignatory(
      rawSettings.committeeMember3,
      fallbackSettings.committeeMember3 || { name: '', position: '' }
    ),
    director: sanitizeSignatory(rawSettings.director, fallbackSettings.director),
  };

  // Validate reference
  let reference: ReferenceConfig = {
    ...fallbackReference,
  };
  if (isRecord(root.reference)) {
    const rawCats = Array.isArray(root.reference.categories)
      ? root.reference.categories
      : [];
    const parsedCats: AssetCategory[] = [];
    for (const c of rawCats) {
      if (!isRecord(c)) continue;
      const apcCode = asString(c.apcCode).trim();
      const name = asString(c.name).trim();
      if (!apcCode || !name) continue;
      parsedCats.push({
        apcCode,
        classCode: asString(c.classCode, apcCode.slice(0, 8)),
        name,
        defaultUsefulLife: Math.max(0, asNumber(c.defaultUsefulLife, 5)),
        isBuilding: Boolean(c.isBuilding),
        isIntangible: Boolean(c.isIntangible),
        isLand: Boolean(c.isLand),
      });
    }

    const parsedLocs = Array.isArray(root.reference.locations)
      ? root.reference.locations
          .map((l) => (typeof l === 'string' ? l.trim() : ''))
          .filter(Boolean)
      : fallbackReference.locations;

    reference = {
      categories:
        parsedCats.length > 0 ? parsedCats : fallbackReference.categories,
      locations:
        parsedLocs.length > 0 ? parsedLocs : fallbackReference.locations,
      acquisitionMethods: fallbackReference.acquisitionMethods,
      fundingSources: fallbackReference.fundingSources,
    };
  } else {
    warnings.push(
      'ไม่พบรายการอ้างอิงในไฟล์ ระบบจะใช้รายการอ้างอิงมาตรฐานแทน'
    );
  }

  // Validate assets
  const assets: AssetItem[] = [];
  let skippedAssets = 0;
  root.assets.forEach((raw, idx) => {
    if (!isRecord(raw)) {
      skippedAssets++;
      return;
    }
    const name = asString(raw.name).trim();
    const assetCode = asString(raw.assetCode).trim();
    if (!name && !assetCode) {
      skippedAssets++;
      return;
    }

    const status = VALID_ASSET_STATUSES.includes(raw.status as AssetStatus)
      ? (raw.status as AssetStatus)
      : 'ใช้งานปกติ';
    const acquisitionMethod = VALID_ACQUISITION_METHODS.includes(
      raw.acquisitionMethod as AcquisitionMethod
    )
      ? (raw.acquisitionMethod as AcquisitionMethod)
      : 'ซื้อ';
    const fundingSource = VALID_FUNDING_SOURCES.includes(
      raw.fundingSource as FundingSource
    )
      ? (raw.fundingSource as FundingSource)
      : 'งบประมาณแผ่นดิน';

    assets.push({
      id: asString(raw.id).trim() || `ast-restored-${idx + 1}`,
      assetCode: assetCode || `AST-${idx + 1}`,
      gfmisAssetNo: asString(raw.gfmisAssetNo, '-'),
      name: name || assetCode,
      brandModel: asString(raw.brandModel, ''),
      serialNumber: asString(raw.serialNumber, ''),
      categoryCode:
        asString(raw.categoryCode).trim() ||
        reference.categories[0]?.apcCode ||
        '1206010101',
      location:
        asString(raw.location).trim() ||
        reference.locations[0] ||
        'ห้องประชุมและสำนักงาน',
      acquisitionDate: asString(raw.acquisitionDate, ''),
      acquisitionMethod,
      fundingSource,
      cost: Math.max(0, asNumber(raw.cost, 0)),
      usefulLifeYears: Math.max(0, asNumber(raw.usefulLifeYears, 5)),
      status,
      disposalDate:
        typeof raw.disposalDate === 'string' && raw.disposalDate
          ? raw.disposalDate
          : undefined,
      disposalReason:
        typeof raw.disposalReason === 'string' && raw.disposalReason
          ? raw.disposalReason
          : undefined,
      warrantyExpiryDate:
        typeof raw.warrantyExpiryDate === 'string' && raw.warrantyExpiryDate
          ? raw.warrantyExpiryDate
          : undefined,
      nextMaintenanceDate:
        typeof raw.nextMaintenanceDate === 'string' && raw.nextMaintenanceDate
          ? raw.nextMaintenanceDate
          : undefined,
      maintenanceIntervalDays:
        raw.maintenanceIntervalDays !== undefined
          ? Math.max(0, asNumber(raw.maintenanceIntervalDays, 180))
          : undefined,
      responsiblePerson: asString(raw.responsiblePerson, ''),
      unit:
        typeof raw.unit === 'string' && raw.unit ? raw.unit : undefined,
      documentNo:
        typeof raw.documentNo === 'string' && raw.documentNo
          ? raw.documentNo
          : undefined,
      disposalDocNo:
        typeof raw.disposalDocNo === 'string' && raw.disposalDocNo
          ? raw.disposalDocNo
          : undefined,
      notes:
        typeof raw.notes === 'string' && raw.notes ? raw.notes : undefined,
      gfmisRecordedCost:
        raw.gfmisRecordedCost !== undefined
          ? Math.max(0, asNumber(raw.gfmisRecordedCost, 0))
          : undefined,
    });
  });

  if (skippedAssets > 0) {
    warnings.push(
      `ข้ามรายการครุภัณฑ์ที่ไม่สมบูรณ์จำนวน ${skippedAssets} รายการ`
    );
  }

  // Validate maintenance records
  const maintenance: MaintenanceRecord[] = [];
  if (Array.isArray(root.maintenance)) {
    root.maintenance.forEach((raw, idx) => {
      if (!isRecord(raw)) return;
      const assetId = asString(raw.assetId).trim();
      if (!assetId) return;
      const type = VALID_MAINT_TYPES.includes(raw.type as MaintenanceType)
        ? (raw.type as MaintenanceType)
        : 'บำรุงรักษาเชิงป้องกัน (PM)';
      const mStatus = VALID_MAINT_STATUSES.includes(
        raw.status as MaintenanceStatus
      )
        ? (raw.status as MaintenanceStatus)
        : 'เสร็จสิ้น';
      const mFunding = VALID_FUNDING_SOURCES.includes(
        raw.fundingSource as FundingSource
      )
        ? (raw.fundingSource as FundingSource)
        : 'เงินบำรุง รพ.สต.';

      maintenance.push({
        id: asString(raw.id).trim() || `mnt-restored-${idx + 1}`,
        assetId,
        date: asString(raw.date, ''),
        type,
        description: asString(raw.description, ''),
        vendorOrTechnician: asString(raw.vendorOrTechnician, ''),
        cost: Math.max(0, asNumber(raw.cost, 0)),
        fundingSource: mFunding,
        status: mStatus,
        nextDueDate:
          typeof raw.nextDueDate === 'string' && raw.nextDueDate
            ? raw.nextDueDate
            : undefined,
        notes:
          typeof raw.notes === 'string' && raw.notes ? raw.notes : undefined,
      });
    });
  } else {
    warnings.push('ไม่พบประวัติซ่อมบำรุงในไฟล์ (นำเข้า 0 รายการ)');
  }

  return {
    ok: true,
    data: { settings, reference, assets, maintenance },
    summary: {
      agencyName: settings.agencyName,
      fiscalYear: settings.fiscalYear,
      exportedAt,
      assetCount: assets.length,
      maintenanceCount: maintenance.length,
      categoryCount: reference.categories.length,
      locationCount: reference.locations.length,
      warnings,
    },
  };
}
