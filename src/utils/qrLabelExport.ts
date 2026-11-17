import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { AgencySettings, AssetCategory, AssetItem } from '../types/asset';
import { formatThaiDateNumeric } from './depreciation';

export type QrPayloadMode = 'url' | 'code_only' | 'detail';

export interface QrLabelOptions {
  agencyDisplayName: string;
  payloadMode: QrPayloadMode;
  showBorder: boolean;
  showGfmisAndDate: boolean;
}

export function buildQrPayload(
  asset: AssetItem,
  settings: AgencySettings,
  mode: QrPayloadMode
): string {
  if (mode === 'code_only') {
    return asset.assetCode || asset.id;
  }
  if (mode === 'detail') {
    const gf =
      asset.cost < settings.minDepreciationCost
        ? 'ต่ำกว่าเกณฑ์'
        : asset.gfmisAssetNo && asset.gfmisAssetNo !== '-'
        ? asset.gfmisAssetNo
        : '-';
    return `${asset.assetCode}\n${asset.name}\n${settings.agencyName}\nGFMIS: ${gf} | ${asset.location}`;
  }
  const baseUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : '';
  const param = encodeURIComponent(asset.assetCode || asset.id);
  return `${baseUrl}?asset=${param}`;
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];

  const words = cleaned.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  const pushCharByChar = (segment: string) => {
    for (const ch of segment) {
      if (ctx.measureText(current + ch).width <= maxWidth) {
        current += ch;
      } else {
        if (current) lines.push(current);
        current = ch;
        if (lines.length >= maxLines) return;
      }
    }
  };

  for (const word of words) {
    if (lines.length >= maxLines) break;
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else if (!current) {
      pushCharByChar(word);
    } else {
      lines.push(current);
      if (lines.length >= maxLines) {
        current = '';
        break;
      }
      if (ctx.measureText(word).width <= maxWidth) {
        current = word;
      } else {
        current = '';
        pushCharByChar(word);
      }
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  // Ellipsis on last line if truncated
  if (lines.length === maxLines) {
    const joined = lines.join('');
    if (joined.length < cleaned.replace(/\s+/g, '').length) {
      let last = lines[maxLines - 1];
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last}…`;
    }
  }

  return lines.slice(0, maxLines);
}

/**
 * Renders a crisp 50mm x 30mm asset QR label onto a high-DPI HTML5 Canvas
 * Resolution: 1200 x 720 px (24 px/mm ≈ 610 DPI), exact 5:3 ratio.
 */
export async function renderQrLabelCanvas(
  asset: AssetItem,
  settings: AgencySettings,
  category: AssetCategory | undefined,
  options: QrLabelOptions
): Promise<HTMLCanvasElement> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore font loading failures
    }
  }

  const width = 1200; // 50mm * 24px/mm
  const height = 720; // 30mm * 24px/mm
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('ไม่สามารถสร้าง Canvas สำหรับส่งออกภาพ QR Code ได้');
  }

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  if (options.showBorder) {
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, width - 4, height - 4);
  }

  // Left side QR Code (~24mm x 24mm = 576 x 576 px)
  const payload = buildQrPayload(asset, settings, options.payloadMode);
  const qrSize = 560;
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, payload, {
    width: qrSize,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  const qrX = 36;
  const qrY = Math.round((height - qrSize) / 2);
  ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

  // Subtle vertical separator
  const sepX = qrX + qrSize + 24;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sepX, 42);
  ctx.lineTo(sepX, height - 42);
  ctx.stroke();

  // Right text column
  const textX = sepX + 26;
  const textW = width - textX - 36;
  let cursorY = 50;

  // 1. Agency name header badge/bar
  const agencyTitle = options.agencyDisplayName.trim() || settings.agencyName;
  ctx.fillStyle = '#064e3b';
  ctx.font = '700 32px "Noto Sans Thai", "Sarabun", sans-serif';
  const agencyLines = wrapTextLines(ctx, agencyTitle, textW, 2);
  for (const line of agencyLines) {
    ctx.textBaseline = 'top';
    ctx.fillText(line, textX, cursorY);
    cursorY += 38;
  }

  cursorY += 6;
  ctx.strokeStyle = '#065f46';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(textX, cursorY);
  ctx.lineTo(textX + textW, cursorY);
  ctx.stroke();
  cursorY += 16;

  // 2. Prominent Asset Code (ตัวเลข / รหัสครุภัณฑ์)
  const codeText = asset.assetCode || asset.id;
  let codeFontSize = 44;
  ctx.font = `700 ${codeFontSize}px "IBM Plex Mono", "Noto Sans Thai", monospace`;
  while (codeFontSize > 24 && ctx.measureText(codeText).width > textW) {
    codeFontSize -= 2;
    ctx.font = `700 ${codeFontSize}px "IBM Plex Mono", "Noto Sans Thai", monospace`;
  }
  ctx.fillStyle = '#0f172a';
  ctx.textBaseline = 'top';
  ctx.fillText(codeText, textX, cursorY);
  cursorY += codeFontSize + 16;

  // 3. Asset Name (ชื่อรายการครุภัณฑ์)
  ctx.fillStyle = '#334155';
  ctx.font = '600 30px "Noto Sans Thai", "Sarabun", sans-serif';
  const nameLines = wrapTextLines(ctx, asset.name, textW, 2);
  for (const line of nameLines) {
    ctx.fillText(line, textX, cursorY);
    cursorY += 36;
  }

  // 4. Bottom numeric & location details
  const bottomY = height - 44;
  ctx.textBaseline = 'bottom';

  if (options.showGfmisAndDate) {
    const isBelow = asset.cost < settings.minDepreciationCost;
    const gfLabel = isBelow
      ? 'GF: ต่ำกว่าเกณฑ์'
      : asset.gfmisAssetNo && asset.gfmisAssetNo !== '-'
      ? `GF: ${asset.gfmisAssetNo}`
      : 'GF: -';
    const dateLabel = formatThaiDateNumeric(asset.acquisitionDate);

    ctx.fillStyle = '#475569';
    ctx.font = '500 24px "IBM Plex Mono", "Noto Sans Thai", sans-serif';
    ctx.fillText(`${gfLabel} · ${dateLabel}`, textX, bottomY - 34);
  }

  const footerText = `${asset.location || category?.name || ''}`;
  ctx.fillStyle = '#0f172a';
  ctx.font = '500 25px "Noto Sans Thai", "Sarabun", sans-serif';
  const locLines = wrapTextLines(ctx, footerText, textW, 1);
  if (locLines[0]) {
    ctx.fillText(locLines[0], textX, bottomY);
  }

  // Tiny 50x30mm micro mark at bottom right corner if needed? Omit to keep label super clean!
  return canvas;
}

function triggerDownload(blobOrUrl: Blob | string, filename: string) {
  const url =
    typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  if (typeof blobOrUrl !== 'string') {
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}

function safeFileSegment(input: string): string {
  return input.replace(/[^\w\u0E00-\u0E7F-]+/g, '_').replace(/^_+|_+$/g, '') || 'asset';
}

export async function downloadSingleLabelPng(
  asset: AssetItem,
  settings: AgencySettings,
  category: AssetCategory | undefined,
  options: QrLabelOptions
) {
  const canvas = await renderQrLabelCanvas(asset, settings, category, options);
  const dataUrl = canvas.toDataURL('image/png');
  triggerDownload(
    dataUrl,
    `QR_${safeFileSegment(asset.assetCode)}_50x30mm.png`
  );
}

/**
 * Exports selected labels arranged on A4 Portrait PNG sheet(s)
 * with exact 50mm x 30mm proportions (3 cols x 8 rows = 24 labels/page at 300 DPI).
 */
export async function downloadBatchLabelsA4Png(
  assets: AssetItem[],
  settings: AgencySettings,
  categories: AssetCategory[],
  options: QrLabelOptions
) {
  if (assets.length === 0) return;

  // A4 at 300 DPI: 210mm x 297mm -> 2480 x 3508 px (~11.811 px/mm)
  const pxPerMm = 300 / 25.4;
  const pageW = Math.round(210 * pxPerMm);
  const pageH = Math.round(297 * pxPerMm);
  const labelW = Math.round(50 * pxPerMm);
  const labelH = Math.round(30 * pxPerMm);
  const marginX = Math.round(18 * pxPerMm);
  const marginY = Math.round(16 * pxPerMm);
  const gapX = Math.round(12 * pxPerMm);
  const gapY = Math.round(4 * pxPerMm);

  const perPage = 24; // 3 x 8
  const totalPages = Math.ceil(assets.length / perPage);

  for (let p = 0; p < totalPages; p++) {
    const slice = assets.slice(p * perPage, (p + 1) * perPage);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = pageW;
    pageCanvas.height = pageH;
    const ctx = pageCanvas.getContext('2d');
    if (!ctx) continue;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageW, pageH);

    for (let i = 0; i < slice.length; i++) {
      const item = slice[i];
      const cat = categories.find((c) => c.apcCode === item.categoryCode);
      const labelCanvas = await renderQrLabelCanvas(item, settings, cat, options);
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = marginX + col * (labelW + gapX);
      const y = marginY + row * (labelH + gapY);
      ctx.drawImage(labelCanvas, x, y, labelW, labelH);
    }

    const suffix = totalPages > 1 ? `_หน้า${p + 1}` : '';
    const dataUrl = pageCanvas.toDataURL('image/png');
    triggerDownload(
      dataUrl,
      `QR_รวมสติกเกอร์_A4_50x30mm${suffix}.png`
    );
  }
}

/**
 * Exports a PDF where EVERY page is literally 50mm x 30mm (for thermal sticker printers).
 */
export async function downloadLabelsPdfExact50x30(
  assets: AssetItem[],
  settings: AgencySettings,
  categories: AssetCategory[],
  options: QrLabelOptions
) {
  if (assets.length === 0) return;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [50, 30],
    compress: true,
  });

  for (let i = 0; i < assets.length; i++) {
    if (i > 0) doc.addPage([50, 30], 'landscape');
    const item = assets[i];
    const cat = categories.find((c) => c.apcCode === item.categoryCode);
    const canvas = await renderQrLabelCanvas(item, settings, cat, options);
    const dataUrl = canvas.toDataURL('image/png');
    doc.addImage(dataUrl, 'PNG', 0, 0, 50, 30, undefined, 'FAST');
  }

  const filename =
    assets.length === 1
      ? `QR_${safeFileSegment(assets[0].assetCode)}_50x30mm.pdf`
      : `QR_สติกเกอร์_50x30mm_${assets.length}รายการ.pdf`;
  doc.save(filename);
}

/**
 * Exports an A4 Portrait PDF containing 50mm x 30mm labels arranged in 3x8 grid.
 */
export async function downloadLabelsPdfA4Sheet(
  assets: AssetItem[],
  settings: AgencySettings,
  categories: AssetCategory[],
  options: QrLabelOptions
) {
  if (assets.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const labelW = 50;
  const labelH = 30;
  const marginX = 18;
  const marginY = 16;
  const gapX = 12;
  const gapY = 4;
  const perPage = 24; // 3 cols x 8 rows

  for (let i = 0; i < assets.length; i++) {
    if (i > 0 && i % perPage === 0) {
      doc.addPage('a4', 'portrait');
    }
    const idxOnPage = i % perPage;
    const col = idxOnPage % 3;
    const row = Math.floor(idxOnPage / 3);
    const x = marginX + col * (labelW + gapX);
    const y = marginY + row * (labelH + gapY);

    const item = assets[i];
    const cat = categories.find((c) => c.apcCode === item.categoryCode);
    const canvas = await renderQrLabelCanvas(item, settings, cat, options);
    const dataUrl = canvas.toDataURL('image/png');
    doc.addImage(dataUrl, 'PNG', x, y, labelW, labelH, undefined, 'FAST');
  }

  doc.save(`QR_สติกเกอร์ครุภัณฑ์_A4_50x30mm_${settings.fiscalYear}.pdf`);
}
