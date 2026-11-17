import {
  AgencySettings,
  AssetCategory,
  AssetItem,
  AcquisitionMethod,
  FundingSource,
  MaintenanceRecord,
  MaintenanceStatus,
  MaintenanceType,
  ReferenceConfig,
  AssetStatus,
} from '../types/asset';
import { calculateAssetDepreciation, round2 } from '../utils/depreciation';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

export class SheetsApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'SheetsApiError';
    this.status = status;
  }
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  sheetNames: string[];
}

export interface SheetsSyncConfig {
  locked: boolean;
  autoSyncEnabled: boolean;
  intervalSeconds: number;
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return trimmed;
}

async function sheetsFetch<T>(
  url: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `Google Sheets API Error (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody?.error?.message) {
        message = errBody.error.message;
      }
    } catch {
      // ignore JSON parse failure
    }
    throw new SheetsApiError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export async function getSpreadsheetMetadata(
  accessToken: string,
  rawIdOrUrl: string
): Promise<SpreadsheetMetadata> {
  const spreadsheetId = extractSpreadsheetId(rawIdOrUrl);
  if (!spreadsheetId) {
    throw new Error('กรุณาระบุ Spreadsheet ID หรือลิงก์ Google Sheets');
  }

  const data = await sheetsFetch<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    properties: { title: string };
    sheets: Array<{ properties: { title: string } }>;
  }>(
    `${SHEETS_API}/${encodeURIComponent(
      spreadsheetId
    )}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties.title`,
    accessToken
  );

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties.title,
    spreadsheetUrl: data.spreadsheetUrl,
    sheetNames: (data.sheets || []).map((s) => s.properties.title),
  };
}

export const TARGET_TABS = [
  'ตั้งค่า',
  'รายการอ้างอิง',
  'ทะเบียนครุภัณฑ์',
  'ประวัติซ่อมบำรุง',
  'ค่าเสื่อมราคา',
  'สรุปงบประมาณ',
  'GFMIS_เอกสาร5',
] as const;

export function hasAllTargetTabs(meta: SpreadsheetMetadata | null | undefined): boolean {
  if (!meta) return false;
  return TARGET_TABS.every((tab) => meta.sheetNames.includes(tab));
}

export async function createAssetWorkbook(
  accessToken: string,
  title: string,
  payload: {
    settings: AgencySettings;
    reference: ReferenceConfig;
    assets: AssetItem[];
    maintenance: MaintenanceRecord[];
  }
): Promise<SpreadsheetMetadata> {
  const created = await sheetsFetch<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    properties: { title: string };
    sheets: Array<{ properties: { title: string } }>;
  }>(SHEETS_API, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        title: title.trim() || `ทะเบียนครุภัณฑ์_${payload.settings.agencyName}_${payload.settings.fiscalYear}`,
        locale: 'th_TH',
      },
      sheets: TARGET_TABS.map((tabName) => ({
        properties: { title: tabName },
      })),
    }),
  });

  await writeAllWorkbookData(accessToken, created.spreadsheetId, payload);

  return {
    spreadsheetId: created.spreadsheetId,
    title: created.properties.title,
    spreadsheetUrl: created.spreadsheetUrl,
    sheetNames: TARGET_TABS.slice(),
  };
}

export async function syncAllToGoogleSheets(
  accessToken: string,
  rawIdOrUrl: string,
  payload: {
    settings: AgencySettings;
    reference: ReferenceConfig;
    assets: AssetItem[];
    maintenance: MaintenanceRecord[];
  },
  options?: {
    knownMetadata?: SpreadsheetMetadata | null;
  }
): Promise<SpreadsheetMetadata> {
  const targetId = extractSpreadsheetId(rawIdOrUrl);
  const known = options?.knownMetadata;

  if (known && known.spreadsheetId === targetId && hasAllTargetTabs(known)) {
    try {
      await writeAllWorkbookData(accessToken, known.spreadsheetId, payload);
      return known;
    } catch (err) {
      // Only fall back to full metadata check if a sheet/range error (400) occurred
      if (!(err instanceof SheetsApiError) || err.status !== 400) {
        throw err;
      }
    }
  }

  const meta = await getSpreadsheetMetadata(accessToken, targetId);
  const missingTabs = TARGET_TABS.filter((tab) => !meta.sheetNames.includes(tab));

  if (missingTabs.length > 0) {
    await sheetsFetch(`${SHEETS_API}/${meta.spreadsheetId}:batchUpdate`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        requests: missingTabs.map((tabTitle) => ({
          addSheet: { properties: { title: tabTitle } },
        })),
      }),
    });
  }

  await writeAllWorkbookData(accessToken, meta.spreadsheetId, payload);
  return {
    ...meta,
    sheetNames: Array.from(new Set([...meta.sheetNames, ...TARGET_TABS])),
  };
}

async function writeAllWorkbookData(
  accessToken: string,
  spreadsheetId: string,
  payload: {
    settings: AgencySettings;
    reference: ReferenceConfig;
    assets: AssetItem[];
    maintenance: MaintenanceRecord[];
  }
) {
  const { settings, reference, assets, maintenance } = payload;

  // Clear existing content on target tabs before rewriting
  await sheetsFetch(
    `${SHEETS_API}/${spreadsheetId}/values:batchClear`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        ranges: TARGET_TABS.map((t) => `'${t}'!A1:Z2000`),
      }),
    }
  );

  const settingsRows: (string | number)[][] = [
    ['หัวข้อตั้งค่าระบบ', 'ค่าที่กำหนด'],
    ['ชื่อหน่วยงาน', settings.agencyName],
    ['รหัสหน่วยงาน GFMIS', settings.agencyCode],
    ['หน่วยเบิกจ่าย', settings.disbursementUnit],
    ['ส่วนราชการ/กรม', settings.department],
    ['ปีงบประมาณ (พ.ศ.)', settings.fiscalYear],
    ['ราคาขั้นต่ำคิดค่าเสื่อม (บาท)', settings.minDepreciationCost],
    ['คำสั่งแต่งตั้งกรรมการ', settings.committeeOrderNo],
    ['วันที่ตรวจสอบพัสดุ', settings.inspectionDate],
    ['งบลงทุนครุภัณฑ์ประจำปี (บาท)', settings.annualCapitalBudget],
    ['งบซ่อมบำรุงประจำปี (บาท)', settings.annualMaintenanceBudget],
    ['เจ้าหน้าที่พัสดุ (ผู้จัดทำทะเบียน) - ชื่อ', settings.preparer.name],
    ['เจ้าหน้าที่พัสดุ (ผู้จัดทำทะเบียน) - ตำแหน่ง', settings.preparer.position],
    ['หัวหน้าเจ้าหน้าที่ - ชื่อ', settings.verifier.name],
    ['หัวหน้าเจ้าหน้าที่ - ตำแหน่ง', settings.verifier.position],
    ['ประธานกรรมการตรวจสอบพัสดุ - ชื่อ', settings.committeeChair?.name || ''],
    ['ประธานกรรมการตรวจสอบพัสดุ - ตำแหน่ง', settings.committeeChair?.position || ''],
    ['กรรมการตรวจสอบพัสดุ คนที่ 2 - ชื่อ', settings.committeeMember2?.name || ''],
    ['กรรมการตรวจสอบพัสดุ คนที่ 2 - ตำแหน่ง', settings.committeeMember2?.position || ''],
    ['กรรมการตรวจสอบพัสดุ คนที่ 3 - ชื่อ', settings.committeeMember3?.name || ''],
    ['กรรมการตรวจสอบพัสดุ คนที่ 3 - ตำแหน่ง', settings.committeeMember3?.position || ''],
    ['หัวหน้าหน่วยงาน (ผู้อำนวยการ) - ชื่อ', settings.director.name],
    ['หัวหน้าหน่วยงาน (ผู้อำนวยการ) - ตำแหน่ง', settings.director.position],
  ];

  const refRows: (string | number)[][] = [
    ['รหัส APC', 'รหัสคลาส', 'ประเภทครุภัณฑ์', 'อายุการใช้งาน (ปี)', 'หมวดอาคาร', 'สินทรัพย์ไม่มีตัวตน'],
    ...reference.categories.map((c) => [
      c.apcCode,
      c.classCode,
      c.name,
      c.defaultUsefulLife,
      c.isBuilding ? 'ใช่' : 'ไม่ใช่',
      c.isIntangible ? 'ใช่' : 'ไม่ใช่',
    ]),
    [],
    ['สถานที่/ห้องใช้งาน'],
    ...reference.locations.map((loc) => [loc]),
  ];

  const assetRows: (string | number)[][] = [
    [
      'ID',
      'รหัสครุภัณฑ์',
      'เลขที่สินทรัพย์ GFMIS',
      'รายการครุภัณฑ์',
      'ยี่ห้อ/รุ่น/รายละเอียด',
      'Serial Number',
      'รหัสประเภท (APC)',
      'สถานที่/ห้อง',
      'วันที่ได้มา (YYYY-MM-DD)',
      'วิธีได้มา',
      'แหล่งเงิน',
      'ราคาทุน (บาท)',
      'อายุใช้งาน (ปี)',
      'สถานะการใช้งาน',
      'วันที่จำหน่าย',
      'เหตุผลการจำหน่าย',
      'วันหมดประกัน',
      'กำหนดบำรุงรักษาถัดไป',
      'ผู้รับผิดชอบ',
      'หมายเหตุ',
      'ราคาทุนใน GFMIS',
      'เลขที่เอกสาร',
      'หลักฐานการจ่าย',
      'หน่วยนับ',
    ],
    ...assets.map((a) => [
      a.id,
      a.assetCode,
      a.gfmisAssetNo,
      a.name,
      a.brandModel,
      a.serialNumber,
      a.categoryCode,
      a.location,
      a.acquisitionDate,
      a.acquisitionMethod,
      a.fundingSource,
      a.cost,
      a.usefulLifeYears,
      a.status,
      a.disposalDate || '',
      a.disposalReason || '',
      a.warrantyExpiryDate || '',
      a.nextMaintenanceDate || '',
      a.responsiblePerson,
      a.notes || '',
      a.gfmisRecordedCost ?? a.cost,
      a.documentNo || '',
      a.disposalDocNo || '',
      a.unit || '',
    ]),
  ];

  const maintRows: (string | number)[][] = [
    [
      'ID',
      'Asset ID',
      'รหัสครุภัณฑ์',
      'ชื่อครุภัณฑ์',
      'วันที่ดำเนินการ',
      'ประเภทงาน',
      'รายละเอียดการซ่อม/บำรุงรักษา',
      'ผู้ซ่อม/บริษัท/ช่าง',
      'ค่าใช้จ่าย (บาท)',
      'แหล่งเงิน',
      'สถานะงาน',
      'กำหนดครั้งถัดไป',
      'หมายเหตุ',
    ],
    ...maintenance.map((m) => {
      const asset = assets.find((a) => a.id === m.assetId);
      return [
        m.id,
        m.assetId,
        asset?.assetCode || '',
        asset?.name || '',
        m.date,
        m.type,
        m.description,
        m.vendorOrTechnician,
        m.cost,
        m.fundingSource,
        m.status,
        m.nextDueDate || '',
        m.notes || '',
      ];
    }),
  ];

  const depRows: (string | number)[][] = [
    [
      'รหัสครุภัณฑ์',
      'รายการครุภัณฑ์',
      'ประเภท',
      'วันที่ได้มา',
      'ราคาทุน',
      'อายุ(ปี)',
      'ค่าเสื่อมต่อปี',
      'ค่าเสื่อมยกมา',
      'ค่าเสื่อมปีนี้',
      'ค่าเสื่อมสะสม',
      'มูลค่าสุทธิ',
      'หมายเหตุการคิดค่าเสื่อม',
    ],
    ...assets.map((a) => {
      const cat = reference.categories.find((c) => c.apcCode === a.categoryCode);
      const dep = calculateAssetDepreciation(a, settings, cat);
      return [
        a.assetCode,
        a.name,
        cat?.name || a.categoryCode,
        a.acquisitionDate,
        a.cost,
        a.usefulLifeYears,
        dep.annualRate,
        dep.broughtForwardDep,
        dep.thisYearDep,
        dep.accumulatedDep,
        dep.netBookValue,
        dep.isDepreciable ? (dep.isFullyDepreciated ? 'คิดครบมูลค่าซาก 1 บาทแล้ว' : 'คิดค่าเสื่อมปกติ') : dep.nonDepreciableReason || '',
      ];
    }),
  ];

  // Budget summary rows
  const totalAssetCost = assets
    .filter((a) => a.status !== 'จำหน่ายแล้ว')
    .reduce((sum, a) => sum + a.cost, 0);
  const totalMaintCost = maintenance.reduce((sum, m) => sum + m.cost, 0);
  const totalDepThisYear = assets.reduce((sum, a) => {
    const cat = reference.categories.find((c) => c.apcCode === a.categoryCode);
    return sum + calculateAssetDepreciation(a, settings, cat).thisYearDep;
  }, 0);
  const totalNBV = assets.reduce((sum, a) => {
    const cat = reference.categories.find((c) => c.apcCode === a.categoryCode);
    return sum + calculateAssetDepreciation(a, settings, cat).netBookValue;
  }, 0);

  const budgetRows: (string | number)[][] = [
    ['รายงานสรุปงบประมาณและทรัพย์สินแบบเรียลไทม์', `ปีงบประมาณ ${settings.fiscalYear}`],
    ['หน่วยงาน', settings.agencyName],
    [],
    ['รายการสรุป', 'จำนวนเงิน (บาท)'],
    ['งบลงทุนจัดซื้อครุภัณฑ์ที่ตั้งไว้ประจำปี', settings.annualCapitalBudget],
    ['งบซ่อมบำรุงรักษาครุภัณฑ์ที่ตั้งไว้ประจำปี', settings.annualMaintenanceBudget],
    ['มูลค่าราคาทุนทรัพย์สินคงเหลือในทะเบียน', round2(totalAssetCost)],
    ['ค่าเสื่อมราคาประจำปีงบประมาณปัจจุบัน', round2(totalDepThisYear)],
    ['มูลค่าสุทธิตามบัญชี (Net Book Value)', round2(totalNBV)],
    ['ค่าใช้จ่ายซ่อมบำรุงสะสมทั้งหมด', round2(totalMaintCost)],
    [],
    ['สรุปตามแหล่งเงิน (ราคาทุนจัดซื้อ + ค่าซ่อมบำรุง)'],
    ['แหล่งเงิน', 'มูลค่าครุภัณฑ์ (บาท)', 'ค่าซ่อมบำรุง (บาท)', 'รวมทั้งสิ้น (บาท)'],
    ...reference.fundingSources.map((fs) => {
      const cap = assets
        .filter((a) => a.fundingSource === fs)
        .reduce((s, a) => s + a.cost, 0);
      const mnt = maintenance
        .filter((m) => m.fundingSource === fs)
        .reduce((s, m) => s + m.cost, 0);
      return [fs, round2(cap), round2(mnt), round2(cap + mnt)];
    }),
  ];

  // Doc 5 New GFMIS Thai reconciliation rows
  const gfmisRows: (string | number)[][] = [
    ['เอกสารหมายเลข 5: รายงานผลการตรวจสอบสินทรัพย์ถาวรในระบบ New GFMIS Thai'],
    ['หน่วยงาน', settings.agencyName, 'ปีงบประมาณ', settings.fiscalYear],
    [
      'รหัสบัญชี APC',
      'คลาส',
      'ประเภทสินทรัพย์',
      'ราคาทุน (New GFMIS Thai)',
      'ค่าเสื่อมสะสม',
      'มูลค่าตามบัญชี (สุทธิ)',
      'ราคาทุนตามทะเบียนคุมทรัพย์สิน',
      'ผลต่าง (GFMIS - ทะเบียน)',
    ],
    ...reference.categories.map((cat) => {
      const catAssets = assets.filter(
        (a) => a.categoryCode === cat.apcCode && a.status !== 'จำหน่ายแล้ว'
      );
      const regCost = catAssets.reduce((s, a) => s + a.cost, 0);
      const gfmisCost = catAssets.reduce(
        (s, a) => s + (a.gfmisRecordedCost ?? a.cost),
        0
      );
      const accum = catAssets.reduce(
        (s, a) => s + calculateAssetDepreciation(a, settings, cat).accumulatedDep,
        0
      );
      const nbv = catAssets.reduce(
        (s, a) => s + calculateAssetDepreciation(a, settings, cat).netBookValue,
        0
      );
      return [
        cat.apcCode,
        cat.classCode,
        cat.name,
        round2(gfmisCost),
        round2(accum),
        round2(nbv),
        round2(regCost),
        round2(gfmisCost - regCost),
      ];
    }),
  ];

  await sheetsFetch(
    `${SHEETS_API}/${spreadsheetId}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `'ตั้งค่า'!A1`, values: settingsRows },
          { range: `'รายการอ้างอิง'!A1`, values: refRows },
          { range: `'ทะเบียนครุภัณฑ์'!A1`, values: assetRows },
          { range: `'ประวัติซ่อมบำรุง'!A1`, values: maintRows },
          { range: `'ค่าเสื่อมราคา'!A1`, values: depRows },
          { range: `'สรุปงบประมาณ'!A1`, values: budgetRows },
          { range: `'GFMIS_เอกสาร5'!A1`, values: gfmisRows },
        ],
      }),
    }
  );
}

export async function pullFromGoogleSheets(
  accessToken: string,
  rawIdOrUrl: string,
  fallbackSettings: AgencySettings,
  fallbackRef: ReferenceConfig
): Promise<{
  metadata: SpreadsheetMetadata;
  settings?: AgencySettings;
  categories?: AssetCategory[];
  locations?: string[];
  assets?: AssetItem[];
  maintenance?: MaintenanceRecord[];
}> {
  const metadata = await getSpreadsheetMetadata(accessToken, rawIdOrUrl);
  const rangesToFetch: string[] = [];
  if (metadata.sheetNames.includes('ตั้งค่า')) rangesToFetch.push(`'ตั้งค่า'!A1:B30`);
  if (metadata.sheetNames.includes('รายการอ้างอิง'))
    rangesToFetch.push(`'รายการอ้างอิง'!A1:F100`);
  if (metadata.sheetNames.includes('ทะเบียนครุภัณฑ์'))
    rangesToFetch.push(`'ทะเบียนครุภัณฑ์'!A1:X2000`);
  if (metadata.sheetNames.includes('ประวัติซ่อมบำรุง'))
    rangesToFetch.push(`'ประวัติซ่อมบำรุง'!A1:M2000`);

  // Fallback: if user connected a custom sheet without Thai tab names, read the first sheet tab
  if (rangesToFetch.length === 0 && metadata.sheetNames.length > 0) {
    rangesToFetch.push(`'${metadata.sheetNames[0]}'!A1:X2000`);
  }

  if (rangesToFetch.length === 0) {
    throw new Error('ไม่พบแผ่นงาน (Sheet Tab) ในไฟล์ Google Sheets นี้');
  }

  const query = rangesToFetch
    .map((r) => `ranges=${encodeURIComponent(r)}`)
    .join('&');

  const res = await sheetsFetch<{
    valueRanges: Array<{ range: string; values?: string[][] }>;
  }>(`${SHEETS_API}/${metadata.spreadsheetId}/values:batchGet?${query}`, accessToken);

  const result: {
    metadata: SpreadsheetMetadata;
    settings?: AgencySettings;
    categories?: AssetCategory[];
    locations?: string[];
    assets?: AssetItem[];
    maintenance?: MaintenanceRecord[];
  } = { metadata };

  for (const vr of res.valueRanges || []) {
    const rows = vr.values || [];
    if (rows.length === 0) continue;

    if (vr.range.includes('ตั้งค่า')) {
      const map = new Map<string, string>();
      for (const r of rows.slice(1)) {
        if (r[0]) map.set(String(r[0]).trim(), String(r[1] ?? '').trim());
      }
      result.settings = {
        ...fallbackSettings,
        agencyName: map.get('ชื่อหน่วยงาน') || fallbackSettings.agencyName,
        agencyCode: map.get('รหัสหน่วยงาน GFMIS') || fallbackSettings.agencyCode,
        disbursementUnit: map.get('หน่วยเบิกจ่าย') || fallbackSettings.disbursementUnit,
        department: map.get('ส่วนราชการ/กรม') || fallbackSettings.department,
        fiscalYear:
          Number(map.get('ปีงบประมาณ (พ.ศ.)')) || fallbackSettings.fiscalYear,
        minDepreciationCost:
          Number(map.get('ราคาขั้นต่ำคิดค่าเสื่อม (บาท)')) ||
          fallbackSettings.minDepreciationCost,
        committeeOrderNo:
          map.get('คำสั่งแต่งตั้งกรรมการ') || fallbackSettings.committeeOrderNo,
        inspectionDate:
          map.get('วันที่ตรวจสอบพัสดุ') || fallbackSettings.inspectionDate,
        annualCapitalBudget:
          Number(map.get('งบลงทุนครุภัณฑ์ประจำปี (บาท)')) ||
          fallbackSettings.annualCapitalBudget,
        annualMaintenanceBudget:
          Number(map.get('งบซ่อมบำรุงประจำปี (บาท)')) ||
          fallbackSettings.annualMaintenanceBudget,
        preparer: {
          name:
            map.get('เจ้าหน้าที่พัสดุ (ผู้จัดทำทะเบียน) - ชื่อ') ||
            map.get('ผู้จัดทำ - ชื่อ') ||
            fallbackSettings.preparer.name,
          position:
            map.get('เจ้าหน้าที่พัสดุ (ผู้จัดทำทะเบียน) - ตำแหน่ง') ||
            map.get('ผู้จัดทำ - ตำแหน่ง') ||
            fallbackSettings.preparer.position,
        },
        verifier: {
          name:
            map.get('หัวหน้าเจ้าหน้าที่ - ชื่อ') ||
            map.get('ผู้รับรอง - ชื่อ') ||
            fallbackSettings.verifier.name,
          position:
            map.get('หัวหน้าเจ้าหน้าที่ - ตำแหน่ง') ||
            map.get('ผู้รับรอง - ตำแหน่ง') ||
            fallbackSettings.verifier.position,
        },
        committeeChair: {
          name:
            map.get('ประธานกรรมการตรวจสอบพัสดุ - ชื่อ') ??
            fallbackSettings.committeeChair?.name ??
            '',
          position:
            map.get('ประธานกรรมการตรวจสอบพัสดุ - ตำแหน่ง') ??
            fallbackSettings.committeeChair?.position ??
            '',
        },
        committeeMember2: {
          name:
            map.get('กรรมการตรวจสอบพัสดุ คนที่ 2 - ชื่อ') ??
            fallbackSettings.committeeMember2?.name ??
            '',
          position:
            map.get('กรรมการตรวจสอบพัสดุ คนที่ 2 - ตำแหน่ง') ??
            fallbackSettings.committeeMember2?.position ??
            '',
        },
        committeeMember3: {
          name:
            map.get('กรรมการตรวจสอบพัสดุ คนที่ 3 - ชื่อ') ??
            fallbackSettings.committeeMember3?.name ??
            '',
          position:
            map.get('กรรมการตรวจสอบพัสดุ คนที่ 3 - ตำแหน่ง') ??
            fallbackSettings.committeeMember3?.position ??
            '',
        },
        director: {
          name:
            map.get('หัวหน้าหน่วยงาน (ผู้อำนวยการ) - ชื่อ') ||
            map.get('หัวหน้าหน่วยงาน - ชื่อ') ||
            fallbackSettings.director.name,
          position:
            map.get('หัวหน้าหน่วยงาน (ผู้อำนวยการ) - ตำแหน่ง') ??
            map.get('หัวหน้าหน่วยงาน - ตำแหน่ง') ??
            fallbackSettings.director.position,
        },
      };
    } else if (vr.range.includes('รายการอ้างอิง')) {
      const cats: AssetCategory[] = [];
      const locs: string[] = [];
      let readingLocations = false;
      for (const r of rows.slice(1)) {
        if (!r || r.length === 0) continue;
        if (r[0] === 'สถานที่/ห้องใช้งาน') {
          readingLocations = true;
          continue;
        }
        if (readingLocations) {
          if (r[0]) locs.push(String(r[0]).trim());
        } else if (r[0] && r[2]) {
          cats.push({
            apcCode: String(r[0]).trim(),
            classCode: String(r[1] || '').trim(),
            name: String(r[2]).trim(),
            defaultUsefulLife: Number(r[3]) || 5,
            isBuilding: r[4] === 'ใช่',
            isIntangible: r[5] === 'ใช่',
          });
        }
      }
      if (cats.length > 0) result.categories = cats;
      if (locs.length > 0) result.locations = locs;
    } else if (vr.range.includes('ประวัติซ่อมบำรุง')) {
      const parsedMaint: MaintenanceRecord[] = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[1]) continue;
        parsedMaint.push({
          id: String(r[0] || `mnt-gs-${i}`),
          assetId: String(r[1]),
          date: String(r[4] || ''),
          type: (r[5] as MaintenanceType) || 'บำรุงรักษาเชิงป้องกัน (PM)',
          description: String(r[6] || ''),
          vendorOrTechnician: String(r[7] || ''),
          cost: Number(String(r[8] || '0').replace(/,/g, '')) || 0,
          fundingSource: (r[9] as FundingSource) || 'เงินบำรุง รพ.สต.',
          status: (r[10] as MaintenanceStatus) || 'เสร็จสิ้น',
          nextDueDate: r[11] ? String(r[11]) : undefined,
          notes: r[12] ? String(r[12]) : undefined,
        });
      }
      result.maintenance = parsedMaint;
    } else {
      // Asset registry (ทะเบียนครุภัณฑ์ or fallback first sheet)
      const parsedAssets: AssetItem[] = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || (!r[1] && !r[3])) continue;
        const costVal = Number(String(r[11] || '0').replace(/,/g, '')) || 0;
        const gfmisVal =
          r[20] !== undefined && r[20] !== ''
            ? Number(String(r[20]).replace(/,/g, ''))
            : costVal;
        parsedAssets.push({
          id: String(r[0] || `ast-gs-${i}`),
          assetCode: String(r[1] || ''),
          gfmisAssetNo: String(r[2] || '-'),
          name: String(r[3] || 'ไม่ระบุชื่อครุภัณฑ์'),
          brandModel: String(r[4] || ''),
          serialNumber: String(r[5] || ''),
          categoryCode:
            String(r[6] || '') || fallbackRef.categories[0]?.apcCode || '1206010101',
          location: String(r[7] || fallbackRef.locations[0] || ''),
          acquisitionDate: String(r[8] || ''),
          acquisitionMethod: (r[9] as AcquisitionMethod) || 'ซื้อ',
          fundingSource: (r[10] as FundingSource) || 'งบประมาณแผ่นดิน',
          cost: costVal,
          usefulLifeYears: Number(r[12]) || 5,
          status: (r[13] as AssetStatus) || 'ใช้งานปกติ',
          disposalDate: r[14] ? String(r[14]) : undefined,
          disposalReason: r[15] ? String(r[15]) : undefined,
          warrantyExpiryDate: r[16] ? String(r[16]) : undefined,
          nextMaintenanceDate: r[17] ? String(r[17]) : undefined,
          responsiblePerson: String(r[18] || ''),
          notes: r[19] ? String(r[19]) : undefined,
          gfmisRecordedCost: isNaN(gfmisVal) ? costVal : gfmisVal,
          documentNo: r[21] ? String(r[21]) : undefined,
          disposalDocNo: r[22] ? String(r[22]) : undefined,
          unit: r[23] ? String(r[23]) : undefined,
        });
      }
      result.assets = parsedAssets;
    }
  }

  return result;
}
