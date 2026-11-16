import * as XLSX from 'xlsx';
import {
  AgencySettings,
  AssetCategory,
  AssetItem,
  ReferenceConfig,
} from '../types/asset';
import {
  calculateAssetDepreciation,
  formatThaiDate,
  formatThaiDateNumeric,
  getFiscalYearWindow,
  inferAssetUnit,
  round2,
} from './depreciation';

export interface Doc6MovementRow {
  cat: AssetCategory;
  broughtForward: number;
  incPurchase: number;
  incDonate: number;
  incTransfer: number;
  incAdjust: number;
  decDisposed: number;
  decAdjust: number;
  endCost: number;
  endNBV: number;
}

export interface Doc6Totals {
  bf: number;
  p: number;
  d: number;
  t: number;
  ia: number;
  dd: number;
  da: number;
  ec: number;
  nbv: number;
}

export interface BelowThresholdDetailRow {
  asset: AssetItem;
  categoryName: string;
  broughtForward: number;
  incPurchase: number;
  incDonate: number;
  incTransfer: number;
  incAdjust: number;
  decDisposed: number;
  endCost: number;
}

function applyCurrencyFormat(ws: XLSX.WorkSheet, colIndices: number[], startRow: number, endRow: number) {
  for (let r = startRow; r <= endRow; r++) {
    for (const c of colIndices) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell && typeof cell.v === 'number') {
        cell.t = 'n';
        cell.z = '#,##0.00';
      }
    }
  }
}

export function exportDoc6Excel(params: {
  mode: 'below_threshold' | 'standard';
  settings: AgencySettings;
  rows: Doc6MovementRow[];
  totals: Doc6Totals;
  detailRows?: BelowThresholdDetailRow[];
}) {
  const { mode, settings, rows, totals, detailRows } = params;
  const fyWindow = getFiscalYearWindow(settings.fiscalYear);
  const startLabel = fyWindow.labelShort.split('–')[0].trim();
  const endShort = String(settings.fiscalYear).slice(-2);

  const isBelow = mode === 'below_threshold';
  const titleText = isBelow
    ? `รายงานมูลค่าบัญชีสินทรัพย์ เฉพาะครุภัณฑ์ที่ต่ำกว่าเกณฑ์ (ต่ำกว่า ${settings.minDepreciationCost.toLocaleString('th-TH')} บาท ไม่คิดค่าเสื่อมราคา)`
    : `รายงานมูลค่าบัญชีสินทรัพย์ ครุภัณฑ์ตามเกณฑ์ (ตั้งแต่ ${settings.minDepreciationCost.toLocaleString('th-TH')} บาทขึ้นไป)`;

  const aoa: (string | number)[][] = [
    ['', '', '', '', '', '', '', '', '', '', 'เอกสารหมายเลข 6'],
    [titleText],
    [`หน่วยงาน: ${settings.agencyName}   ${settings.department}`],
    [`หน่วยเบิกจ่าย: ${settings.disbursementUnit}   ปีงบประมาณ: ${settings.fiscalYear} (${fyWindow.labelShort})`],
    [],
    // Row 5 (0-indexed): Top merged header
    [
      'รหัสบัญชี',
      'ชื่อบัญชี',
      'ราคาทุน',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'มูลค่าตามบัญชี (สินทรัพย์สุทธิ)',
    ],
    // Row 6: Sub-header group
    [
      '',
      '',
      `ราคาทุนยกมา (${startLabel})`,
      'มูลค่าสินทรัพย์ที่เพิ่มขึ้น',
      '',
      '',
      '',
      'การตัดจำหน่าย',
      '',
      `ราคาทุนยกไป (30 ก.ย. ${endShort})`,
      '',
    ],
    // Row 7: Leaf headers
    [
      '',
      '',
      '',
      'ซื้อเพิ่ม',
      'รับบริจาค',
      'รับโอน',
      'ปรับปรุงบัญชี',
      'การขาย/โอน/แลกเปลี่ยน/ตัดจ่าย/สูญหาย',
      'ปรับปรุงบัญชี',
      '',
      '',
    ],
    // Section sub-header
    [
      isBelow ? '1206170101' : '',
      isBelow ? 'ครุภัณฑ์ต่ำกว่าเกณฑ์ (จำแนกตามประเภทครุภัณฑ์)' : 'ครุภัณฑ์',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ],
  ];

  const dataStartRow = aoa.length;
  for (const r of rows) {
    aoa.push([
      isBelow ? `${r.cat.apcCode} (ต่ำกว่าเกณฑ์)` : r.cat.apcCode,
      r.cat.name,
      round2(r.broughtForward),
      round2(r.incPurchase),
      round2(r.incDonate),
      round2(r.incTransfer),
      round2(r.incAdjust),
      round2(r.decDisposed),
      round2(r.decAdjust),
      round2(r.endCost),
      round2(r.endNBV),
    ]);
  }
  const dataEndRow = aoa.length - 1;

  // Totals row
  aoa.push([
    '',
    isBelow ? 'รวมครุภัณฑ์ต่ำกว่าเกณฑ์ทั้งสิ้น' : 'รวมครุภัณฑ์ทั้งสิ้น',
    round2(totals.bf),
    round2(totals.p),
    round2(totals.d),
    round2(totals.t),
    round2(totals.ia),
    round2(totals.dd),
    round2(totals.da),
    round2(totals.ec),
    round2(totals.nbv),
  ]);
  const totalsRowIdx = aoa.length - 1;

  aoa.push([]);
  aoa.push([
    `ผู้จัดทำ: ${settings.preparer.name} (${settings.preparer.position})`,
    '',
    '',
    '',
    `ผู้รับรอง: ${settings.verifier.name} (${settings.verifier.position})`,
    '',
    '',
    '',
    `หัวหน้าหน่วยงาน: ${settings.director.name} (${settings.director.position})`,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws['!merges'] = [
    { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 10 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 10 } },
    // Column headers
    { s: { r: 5, c: 0 }, e: { r: 7, c: 0 } }, // รหัสบัญชี
    { s: { r: 5, c: 1 }, e: { r: 7, c: 1 } }, // ชื่อบัญชี
    { s: { r: 5, c: 2 }, e: { r: 5, c: 9 } }, // ราคาทุน
    { s: { r: 5, c: 10 }, e: { r: 7, c: 10 } }, // มูลค่าตามบัญชี
    { s: { r: 6, c: 2 }, e: { r: 7, c: 2 } }, // ยกมา
    { s: { r: 6, c: 3 }, e: { r: 6, c: 6 } }, // เพิ่มขึ้น
    { s: { r: 6, c: 7 }, e: { r: 6, c: 8 } }, // การตัดจำหน่าย
    { s: { r: 6, c: 9 }, e: { r: 7, c: 9 } }, // ยกไป
    // Total label
    { s: { r: totalsRowIdx, c: 0 }, e: { r: totalsRowIdx, c: 1 } },
  ];

  ws['!cols'] = [
    { wch: 22 },
    { wch: 32 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
  ];

  applyCurrencyFormat(ws, [2, 3, 4, 5, 6, 7, 8, 9, 10], dataStartRow, totalsRowIdx);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    ws,
    isBelow ? 'มูลค่าบัญชี_ต่ำกว่าเกณฑ์' : 'มูลค่าบัญชี_ครุภัณฑ์'
  );

  // Sheet 2: Itemized detail rows for below-threshold assets
  if (detailRows && detailRows.length > 0) {
    const detailAoa: (string | number)[][] = [
      [`รายละเอียดครุภัณฑ์ต่ำกว่าเกณฑ์รายรายการ — ${settings.agencyName} (ปีงบประมาณ ${settings.fiscalYear})`],
      [],
      [
        'ลำดับ',
        'รหัสครุภัณฑ์',
        'รายการครุภัณฑ์',
        'ยี่ห้อ/รุ่น',
        'ประเภทครุภัณฑ์',
        'สถานที่/ห้อง',
        'วันที่ได้มา',
        'วิธีได้มา',
        'แหล่งเงิน',
        'สถานะปัจจุบัน',
        'ราคาทุนยกมา',
        'ซื้อเพิ่ม',
        'รับบริจาค',
        'รับโอน',
        'ปรับปรุงเพิ่ม',
        'จำหน่าย/โอนออก',
        'ราคาทุนยกไป',
      ],
    ];

    detailRows.forEach((d, idx) => {
      detailAoa.push([
        idx + 1,
        d.asset.assetCode,
        d.asset.name,
        d.asset.brandModel || '-',
        d.categoryName,
        d.asset.location,
        formatThaiDate(d.asset.acquisitionDate),
        d.asset.acquisitionMethod,
        d.asset.fundingSource,
        d.asset.status,
        round2(d.broughtForward),
        round2(d.incPurchase),
        round2(d.incDonate),
        round2(d.incTransfer),
        round2(d.incAdjust),
        round2(d.decDisposed),
        round2(d.endCost),
      ]);
    });

    const ds = XLSX.utils.aoa_to_sheet(detailAoa);
    ds['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 16 } }];
    ds['!cols'] = [
      { wch: 7 },
      { wch: 22 },
      { wch: 36 },
      { wch: 24 },
      { wch: 26 },
      { wch: 24 },
      { wch: 14 },
      { wch: 12 },
      { wch: 18 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
    ];
    applyCurrencyFormat(ds, [10, 11, 12, 13, 14, 15, 16], 3, detailAoa.length - 1);
    XLSX.utils.book_append_sheet(wb, ds, 'รายละเอียดรายตัว');
  }

  const fileName = isBelow
    ? `เอกสารหมายเลข6_ครุภัณฑ์ต่ำกว่าเกณฑ์_${settings.fiscalYear}.xlsx`
    : `เอกสารหมายเลข6_มูลค่าบัญชีสินทรัพย์_${settings.fiscalYear}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export function exportGfmisDoc5Excel(params: {
  settings: AgencySettings;
  rows: Array<{
    cat: AssetCategory;
    gfmisCost: number;
    accumDep: number;
    nbv: number;
    registryCost: number;
    diff: number;
  }>;
  totals: {
    gfmisCost: number;
    accumDep: number;
    nbv: number;
    registryCost: number;
    diff: number;
  };
}) {
  const { settings, rows, totals } = params;
  const aoa: (string | number)[][] = [
    ['', '', '', '', '', '', '', '', '', '', 'เอกสารหมายเลข 5'],
    [`รายงานผลการตรวจสอบสินทรัพย์ถาวรในระบบ New GFMIS Thai (ณ วันที่ 30 กันยายน ${settings.fiscalYear})`],
    [`รหัสหน่วยงาน: ${settings.agencyCode}   หน่วยเบิกจ่าย: ${settings.agencyName}`],
    [],
    [
      'รหัส',
      'รหัสพื้นที่',
      'บัญชี : APC',
      'คลาส',
      'ชื่อประเภทสินทรัพย์',
      'มูลค่าการได้มา (GFMIS) (1)',
      'ค่าเสื่อมสะสม',
      'มูลค่าตามบัญชี (สุทธิ)',
      'มูลค่าตามทะเบียนคุม (2)',
      'ผลต่าง (1)-(2)',
      'หมายเหตุ',
    ],
  ];

  const start = aoa.length;
  for (const r of rows) {
    aoa.push([
      '2102',
      '',
      r.cat.apcCode,
      r.cat.classCode,
      r.cat.name,
      round2(r.gfmisCost),
      round2(r.accumDep),
      round2(r.nbv),
      round2(r.registryCost),
      round2(r.diff),
      Math.abs(r.diff) > 0.01 ? 'ตรวจสอบยอด' : '',
    ]);
  }
  const end = aoa.length;
  aoa.push([
    '',
    '',
    '',
    '',
    'รายงานยอดสินทรัพย์คงเหลือ (ทั้งสิ้น)',
    round2(totals.gfmisCost),
    round2(totals.accumDep),
    round2(totals.nbv),
    round2(totals.registryCost),
    round2(totals.diff),
    '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [
    { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 10 } },
    { s: { r: end, c: 0 }, e: { r: end, c: 4 } },
  ];
  ws['!cols'] = [
    { wch: 8 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 34 },
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 15 },
    { wch: 16 },
  ];
  applyCurrencyFormat(ws, [5, 6, 7, 8, 9], start, end);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'GFMIS_เอกสาร5');
  XLSX.writeFile(wb, `เอกสารหมายเลข5_GFMIS_${settings.fiscalYear}.xlsx`);
}

export function exportDepreciationExcel(params: {
  settings: AgencySettings;
  reference: ReferenceConfig;
  assets: AssetItem[];
}) {
  const { settings, reference, assets } = params;
  const aoa: (string | number)[][] = [
    [`รายงานค่าเสื่อมราคาทรัพย์สินถาวร ประจำปีงบประมาณ ${settings.fiscalYear}`],
    [`หน่วยงาน: ${settings.agencyName}`],
    [],
    [
      'ลำดับ',
      'รหัสครุภัณฑ์',
      'รายการครุภัณฑ์',
      'ประเภท',
      'วันที่ได้มา',
      'ราคาทุน',
      'อายุ (ปี)',
      'ค่าเสื่อมต่อปี',
      'ค่าเสื่อมยกมา',
      'ค่าเสื่อมปีนี้',
      'ค่าเสื่อมสะสม',
      'มูลค่าสุทธิ',
      'หมายเหตุ',
    ],
  ];

  const start = aoa.length;
  assets.forEach((a, idx) => {
    const cat = reference.categories.find((c) => c.apcCode === a.categoryCode);
    const dep = calculateAssetDepreciation(a, settings, cat);
    if (dep.isDisposedPriorFY) return;
    aoa.push([
      idx + 1,
      a.assetCode,
      a.name,
      cat?.name || a.categoryCode,
      formatThaiDate(a.acquisitionDate),
      round2(a.cost),
      a.usefulLifeYears,
      round2(dep.annualRate),
      round2(dep.broughtForwardDep),
      round2(dep.thisYearDep),
      round2(dep.accumulatedDep),
      round2(dep.netBookValue),
      dep.isDepreciable ? '' : dep.nonDepreciableReason || '',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } },
  ];
  ws['!cols'] = [
    { wch: 7 },
    { wch: 22 },
    { wch: 36 },
    { wch: 26 },
    { wch: 14 },
    { wch: 15 },
    { wch: 10 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 28 },
  ];
  applyCurrencyFormat(ws, [5, 7, 8, 9, 10, 11], start, aoa.length - 1);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ค่าเสื่อมราคา');
  XLSX.writeFile(wb, `รายงานค่าเสื่อมราคา_${settings.fiscalYear}.xlsx`);
}

export interface SurveyCategoryPage {
  sheetNumber: number;
  category: AssetCategory;
  items: AssetItem[];
}

function sanitizeSheetName(name: string, usedNames: Set<string>): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').trim() || 'หมวดครุภัณฑ์';
  let base = cleaned.slice(0, 28);
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    const suffixStr = `_${suffix}`;
    candidate = `${base.slice(0, 31 - suffixStr.length)}${suffixStr}`;
    suffix++;
  }
  usedNames.add(candidate);
  return candidate;
}

export function exportAssetSurveyExcel(params: {
  settings: AgencySettings;
  pages: SurveyCategoryPage[];
}) {
  const { settings, pages } = params;
  if (pages.length === 0) return;

  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  for (const page of pages) {
    const aoa: (string | number)[][] = [
      [`แบบสำรวจครุภัณฑ์  ปี ${settings.fiscalYear}`],
      ['แผ่นที่', page.sheetNumber, '', '', '', '', '', 'ส่วนราชการ', settings.department, '', ''],
      ['ประเภท', page.category.name, '', '', '', '', '', 'หน่วยงาน', settings.agencyName, '', ''],
      [
        'วัน เดือน ปี',
        'เลขที่หรือรหัส',
        'ยี่ห้อ ชนิด ขนาด',
        'หมายเลข',
        'ราคา',
        'วิธีการ',
        'เลขที่',
        'ใช้ประจำที่',
        'หลักฐาน',
        'รายการ',
        'หมาย',
      ],
      [
        '',
        '',
        'และลักษณะ',
        'และทะเบียน',
        'ต่อหน่วย',
        'ได้มา',
        'เอกสาร',
        '',
        'การจ่าย',
        'เปลี่ยนแปลง',
        'เหตุ',
      ],
    ];

    const dataStartRow = aoa.length;
    let totalCost = 0;

    for (const item of page.items) {
      totalCost += item.cost;
      const desc = item.brandModel
        ? `${item.name} ${item.brandModel}`
        : item.name;
      const serialAndReg = [
        item.serialNumber,
        item.gfmisAssetNo && item.gfmisAssetNo !== '-'
          ? `GFMIS: ${item.gfmisAssetNo}`
          : '',
      ]
        .filter(Boolean)
        .join(' / ');

      let changeNote = '';
      if (item.status === 'จำหน่ายแล้ว') {
        changeNote = item.disposalDate
          ? `จำหน่ายแล้ว (${formatThaiDate(item.disposalDate)})`
          : 'จำหน่ายแล้ว';
        if (item.disposalReason) {
          changeNote += ` - ${item.disposalReason}`;
        }
      } else if (item.status !== 'ใช้งานปกติ') {
        changeNote = item.status;
      }

      aoa.push([
        formatThaiDate(item.acquisitionDate),
        item.assetCode,
        desc,
        serialAndReg,
        round2(item.cost),
        `${item.acquisitionMethod} (${item.fundingSource})`,
        item.documentNo || '',
        item.location,
        item.disposalDocNo || '',
        changeNote,
        item.notes || '',
      ]);
    }

    const dataEndRow = aoa.length - 1;

    // Summary row
    aoa.push([
      '',
      `รวม ${page.items.length} รายการ`,
      '',
      '',
      round2(totalCost),
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
    const totalRowIdx = aoa.length - 1;

    aoa.push([]);
    aoa.push([
      `เจ้าหน้าที่พัสดุ: ${settings.preparer.name}`,
      '',
      '',
      '',
      `หัวหน้าเจ้าหน้าที่: ${settings.verifier.name}`,
      '',
      '',
      '',
      `หัวหน้าหน่วยงาน: ${settings.director.name}`,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
      { s: { r: 1, c: 1 }, e: { r: 1, c: 6 } },
      { s: { r: 1, c: 8 }, e: { r: 1, c: 10 } },
      { s: { r: 2, c: 1 }, e: { r: 2, c: 6 } },
      { s: { r: 2, c: 8 }, e: { r: 2, c: 10 } },
      { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } },
      { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } },
      { s: { r: 3, c: 7 }, e: { r: 4, c: 7 } },
    ];
    ws['!cols'] = [
      { wch: 12 },
      { wch: 20 },
      { wch: 38 },
      { wch: 22 },
      { wch: 14 },
      { wch: 22 },
      { wch: 16 },
      { wch: 22 },
      { wch: 18 },
      { wch: 22 },
      { wch: 24 },
    ];
    if (dataEndRow >= dataStartRow) {
      applyCurrencyFormat(ws, [4], dataStartRow, totalRowIdx);
    }

    const sheetName = sanitizeSheetName(
      `${page.sheetNumber}_${page.category.name}`,
      usedNames
    );
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const fileSuffix =
    pages.length === 1
      ? sanitizeSheetName(pages[0].category.name, new Set())
      : 'ทุกประเภท';
  XLSX.writeFile(
    wb,
    `แบบสำรวจครุภัณฑ์_${fileSuffix}_ปี${settings.fiscalYear}.xlsx`
  );
}

export interface Doc10Page {
  pageNumber: number;
  categoryLabel: string;
  items: Array<{
    asset: AssetItem;
    category?: AssetCategory;
    accumDep: number;
    nbv: number;
  }>;
}

export function exportDoc10Excel(params: {
  settings: AgencySettings;
  pages: Doc10Page[];
}) {
  const { settings, pages } = params;
  if (pages.length === 0) return;

  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  const chairName =
    settings.committeeChair?.name?.trim() || settings.verifier.name || '';
  const member2Name = settings.committeeMember2?.name?.trim() || '';
  const member3Name = settings.committeeMember3?.name?.trim() || '';

  for (const page of pages) {
    const aoa: (string | number)[][] = [
      ['', '', '', '', '', '', '', '', '', '', '', '', 'เอกสารหมายเลข 10'],
      ['แบบบัญชีรายงานครุภัณฑ์'],
      [`ชื่อหน่วยงาน. ${settings.agencyName}`],
      [`ข้อมูล ณ วันที่ 30 กันยายน ${settings.fiscalYear}`],
      ['ประเภทครุภัณฑ์'],
      [
        page.categoryLabel,
        '',
        '',
        'อาคารและสิ่งปลูกสร้าง / สำนักงาน / โปรแกรมคอมพิวเตอร์ / ครุภัณฑ์ต่ำกว่าเกณฑ์ / อื่นๆ',
      ],
      [
        'ลำดับ',
        'รหัสครุภัณฑ์',
        'รหัสสินทรัพย์ GF',
        'ชื่อรายการ/รายละเอียด',
        'จำนวนหน่วย',
        'หน่วยนับ',
        'วันที่ได้มา',
        'มูลค่าการได้มา',
        'ค่าเสื่อมราคาสะสม',
        'มูลค่าตามบัญชี',
        'สถานะพัสดุ',
        'ตรวจพบ/ไม่พบ',
        'หมายเหตุ',
      ],
    ];

    const dataStartRow = aoa.length;
    let totalCost = 0;
    let totalAccum = 0;
    let totalNBV = 0;

    page.items.forEach((entry, idx) => {
      const { asset, category, accumDep, nbv } = entry;
      const isBelow = asset.cost < settings.minDepreciationCost;
      const gfCode = isBelow
        ? 'ต่ำกว่าเกณฑ์'
        : asset.gfmisAssetNo && asset.gfmisAssetNo !== '-'
        ? asset.gfmisAssetNo
        : '-';
      const detailName = asset.brandModel
        ? `${asset.name} (${asset.brandModel})`
        : asset.name;
      const shortStatus =
        asset.status === 'ใช้งานปกติ' ? 'ปกติ' : asset.status;
      const foundStatus = asset.status === 'สูญหาย' ? 'ไม่พบ' : 'พบ';

      totalCost += asset.cost;
      totalAccum += accumDep;
      totalNBV += nbv;

      aoa.push([
        idx + 1,
        asset.assetCode,
        gfCode,
        detailName,
        1,
        inferAssetUnit(asset, category),
        formatThaiDateNumeric(asset.acquisitionDate),
        round2(asset.cost),
        round2(accumDep),
        round2(nbv),
        shortStatus,
        foundStatus,
        asset.notes || '',
      ]);
    });

    // Pad with blank rows up to at least 8 rows for clean paper ledger appearance
    const minLedgerRows = 8;
    for (let k = page.items.length; k < minLedgerRows; k++) {
      aoa.push(['', '', '', '', '', '', '', '', '', '', '', '', '']);
    }

    const totalRowIdx = aoa.length;
    aoa.push([
      '',
      '',
      '',
      '',
      '',
      '',
      'จำนวนเงิน',
      round2(totalCost),
      round2(totalAccum),
      round2(totalNBV),
      '',
      '',
      '',
    ]);

    aoa.push([]);
    aoa.push([
      '',
      `ลงชื่อ............................ ประธานกรรมการ (${chairName})`,
      '',
      '',
      '',
      `ลงชื่อ............................ กรรมการ (${member2Name})`,
      '',
      '',
      '',
      `ลงชื่อ............................ กรรมการ (${member3Name})`,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = [
      { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 12 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 12 } },
      { s: { r: 5, c: 0 }, e: { r: 5, c: 2 } },
      { s: { r: 5, c: 3 }, e: { r: 5, c: 11 } },
    ];
    ws['!cols'] = [
      { wch: 7 },
      { wch: 20 },
      { wch: 16 },
      { wch: 36 },
      { wch: 11 },
      { wch: 10 },
      { wch: 13 },
      { wch: 15 },
      { wch: 16 },
      { wch: 15 },
      { wch: 14 },
      { wch: 13 },
      { wch: 24 },
    ];
    applyCurrencyFormat(ws, [7, 8, 9], dataStartRow, totalRowIdx);

    const rawName =
      pages.length > 1
        ? `หน้า${page.pageNumber}_${page.categoryLabel}`
        : `เอกสาร10_${page.categoryLabel}`;
    const sheetName = sanitizeSheetName(rawName, usedNames);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  XLSX.writeFile(
    wb,
    `เอกสารหมายเลข10_บัญชีรายงานครุภัณฑ์_${settings.fiscalYear}.xlsx`
  );
}
