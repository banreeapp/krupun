export type AssetStatus =
  | 'ใช้งานปกติ'
  | 'รอซ่อม'
  | 'อยู่ระหว่างซ่อม'
  | 'ชำรุดรอจำหน่าย'
  | 'สูญหาย'
  | 'จำหน่ายแล้ว';

export type AcquisitionMethod =
  | 'ซื้อ'
  | 'รับบริจาค'
  | 'รับโอน'
  | 'ปรับปรุงบัญชี';

export type FundingSource =
  | 'งบประมาณแผ่นดิน'
  | 'เงินบำรุง รพ.สต.'
  | 'เงินบริจาค'
  | 'งบ อปท./อบจ.'
  | 'เงินนอกงบประมาณอื่น';

export type MaintenanceType =
  | 'บำรุงรักษาเชิงป้องกัน (PM)'
  | 'ซ่อมแซมแก้ไข (CM)'
  | 'สอบเทียบเครื่องมือแพทย์ (Calibration)'
  | 'เปลี่ยนอะไหล่';

export type MaintenanceStatus =
  | 'รอดำเนินการ'
  | 'กำลังดำเนินการ'
  | 'เสร็จสิ้น';

export interface Signatory {
  name: string;
  position: string;
}

export interface AgencySettings {
  agencyName: string;
  agencyCode: string;
  disbursementUnit: string;
  department: string;
  fiscalYear: number; // พ.ศ. e.g. 2569 (1 ต.ค. 68 - 30 ก.ย. 69)
  minDepreciationCost: number; // default 10000
  committeeOrderNo: string;
  inspectionDate: string; // YYYY-MM-DD
  annualCapitalBudget: number;
  annualMaintenanceBudget: number;
  preparer: Signatory; // เจ้าหน้าที่พัสดุ (ผู้จัดทำทะเบียน)
  verifier: Signatory; // หัวหน้าเจ้าหน้าที่
  committeeChair?: Signatory; // ประธานกรรมการตรวจสอบพัสดุ
  committeeMember2?: Signatory; // กรรมการตรวจสอบพัสดุ คนที่ 2
  committeeMember3?: Signatory; // กรรมการตรวจสอบพัสดุ คนที่ 3
  director: Signatory; // หัวหน้าหน่วยงาน (ผู้อำนวยการ)
}

export interface AssetCategory {
  apcCode: string; // e.g. 1206090101
  classCode: string; // e.g. 12060900
  name: string; // e.g. ครุภัณฑ์วิทยาศาสตร์และการแพทย์
  defaultUsefulLife: number; // years (0 for land)
  isIntangible?: boolean;
  isLand?: boolean;
  isBuilding?: boolean;
}

export interface ReferenceConfig {
  categories: AssetCategory[];
  locations: string[];
  acquisitionMethods: AcquisitionMethod[];
  fundingSources: FundingSource[];
}

export interface AssetItem {
  id: string;
  assetCode: string;
  gfmisAssetNo: string;
  name: string;
  brandModel: string;
  serialNumber: string;
  categoryCode: string; // matches AssetCategory.apcCode
  location: string;
  acquisitionDate: string; // YYYY-MM-DD
  acquisitionMethod: AcquisitionMethod;
  fundingSource: FundingSource;
  cost: number;
  usefulLifeYears: number;
  status: AssetStatus;
  disposalDate?: string;
  disposalReason?: string;
  warrantyExpiryDate?: string;
  nextMaintenanceDate?: string;
  maintenanceIntervalDays?: number;
  responsiblePerson: string;
  unit?: string; // หน่วยนับ เช่น เครื่อง, หลัง, คัน, ชุด
  documentNo?: string; // เลขที่เอกสาร (เช่น เลขที่หนังสือ/ใบสั่งซื้อ/ตรวจรับ)
  disposalDocNo?: string; // หลักฐานการจ่าย / เลขที่เอกสารจำหน่าย
  notes?: string;
  gfmisRecordedCost?: number; // optional manual GFMIS figure for Doc 5 diff check
}

export interface MaintenanceRecord {
  id: string;
  assetId: string;
  date: string; // YYYY-MM-DD
  type: MaintenanceType;
  description: string;
  vendorOrTechnician: string;
  cost: number;
  fundingSource: FundingSource;
  status: MaintenanceStatus;
  nextDueDate?: string;
  notes?: string;
}

export interface DepreciationResult {
  isDepreciable: boolean;
  nonDepreciableReason?: string;
  annualRate: number;
  broughtForwardDep: number;
  thisYearDep: number;
  accumulatedDep: number;
  netBookValue: number;
  firstYearDays: number;
  remainingLifeYears: number;
  isFullyDepreciated: boolean;
  isDisposedInCurrentFY: boolean;
  isDisposedPriorFY: boolean;
  isAcquiredInCurrentFY: boolean;
  schedule: YearlyDepreciationRow[];
}

export interface YearlyDepreciationRow {
  fiscalYear: number;
  periodLabel: string;
  daysInPeriod: number;
  broughtForward: number;
  depreciationThisYear: number;
  accumulated: number;
  netBookValue: number;
}

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface AssetAlert {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  location: string;
  severity: AlertSeverity;
  category:
    | 'maintenance_overdue'
    | 'maintenance_upcoming'
    | 'repair_pending'
    | 'warranty_expiring'
    | 'disposal_pending'
    | 'validation_error';
  title: string;
  detail: string;
  dueDate?: string;
}

export type ActiveTab =
  | 'overview'
  | 'registry'
  | 'maintenance'
  | 'individual'
  | 'depreciation'
  | 'inspection'
  | 'survey'
  | 'doc10'
  | 'disposal'
  | 'budget'
  | 'settings';
