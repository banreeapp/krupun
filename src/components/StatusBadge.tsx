import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react';
import { AssetStatus, MaintenanceStatus } from '../types/asset';

export function AssetStatusLabel({ status }: { status: AssetStatus }) {
  switch (status) {
    case 'ใช้งานปกติ':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
    case 'รอซ่อม':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
    case 'อยู่ระหว่างซ่อม':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Wrench className="w-3.5 h-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
    case 'ชำรุดรอจำหน่าย':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-700 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
    case 'สูญหาย':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
    case 'จำหน่ายแล้ว':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap">
          <Trash2 className="w-3.5 h-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
  }
}

export function MaintenanceStatusLabel({ status }: { status: MaintenanceStatus }) {
  switch (status) {
    case 'เสร็จสิ้น':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
    case 'กำลังดำเนินการ':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
    case 'รอดำเนินการ':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>{status}</span>
        </span>
      );
  }
}
