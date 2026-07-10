import React, { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  Download,
  Loader2,
  Upload,
  Trash2,
  FileSpreadsheet,
  Copy,
  Eye,
} from "lucide-react";

type Row = {
  id: number;
  geneName: string;
  sequence: string;
};

type Field = "geneName" | "sequence";

type FillState = {
  field: Field;
  sourceRowId: number;
  sourceValue: string;
};

function getAutoIncrementGeneName(sourceValue: string, offset: number) {
  if (!sourceValue || offset <= 0) return sourceValue;

  const numericSuffixMatch = sourceValue.match(/^(.*?)(\d+)$/);
  if (numericSuffixMatch) {
    const [, prefix, numericSuffix] = numericSuffixMatch;
    const nextValue = String(Number(numericSuffix) + offset).padStart(numericSuffix.length, "0");
    return `${prefix}${nextValue}`;
  }

  if (/[A-Za-z]$/.test(sourceValue)) {
    return `${sourceValue}${offset}`;
  }

  return sourceValue;
}

function normalizeSeq(v: unknown) {
  return (v ?? "").toString().trim().toUpperCase().replace(/\s/g, "");
}

function createEmptyRow(id: number): Row {
  return { id, geneName: "", sequence: "" };
}

async function readXlsx(file: File): Promise<Record<string, any>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" }) as any[];
}

function downloadTemplate() {
  const rows = Array.from({ length: 10 }).map((_, i) => ({
    基因名: "",
    碱基序列: "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, "primer_synthesis_template.xlsx");
}

// Filters out CF_HTML clipboard descriptor lines (e.g. "Version:1.0",
// "StartHTML:...", "EndFragment:...") that some editors leak into text/plain.
const CF_HTML_HEADER_RE = /^(Version|StartHTML|EndHTML|StartFragment|EndFragment|StartSelection|EndSelection|SourceURL):/i;

function parseClipboardRows(raw: string) {
  return raw
    .replace(/\u2028/g, "\n")
    .replace(/\u2029/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter(line => line.trim() !== "")
    .filter(line => !CF_HTML_HEADER_RE.test(line.trim()))
    .map(line => line.split("\t").map(cell => cell.trim()));
}

function hasTableLikeSeparator(text: string) {
  return /[\t\r\n\u2028\u2029]/.test(text);
}

function getClipboardText(e: React.ClipboardEvent<HTMLInputElement>) {
  const plain = e.clipboardData.getData("text/plain") || "";
  if (plain) return plain;
  const html = e.clipboardData.getData("text/html") || "";
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = Array.from(doc.querySelectorAll("tr"));
  if (!rows.length) return "";
  return rows
    .map(tr =>
      Array.from(tr.querySelectorAll("th,td"))
        .map(td => (td.textContent || "").trim())
        .join("\t")
    )
    .join("\n");
}

function normalizeClipboardColumns(cells: string[]) {
  const cols = [...cells];
  if (cols.length >= 3 && /^\d+$/.test(cols[0] || "")) cols.shift();
  return cols;
}

export default function PrimerDesignPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const fillStateRef = useRef<FillState | null>(null);

  const [rows, setRows] = useState<Row[]>(Array.from({ length: 10 }, (_, i) => createEmptyRow(i + 1)));
  const [activeCell, setActiveCell] = useState<{ rowId: number; field: Field } | null>({
    rowId: 1,
    field: "geneName",
  });

  const [synthesisOligoLength, setSynthesisOligoLength] = useState("70");
  const [synthesisMinOverlap, setSynthesisMinOverlap] = useState("19");

  const [detail, setDetail] = useState<any | null>(null);
  const [repeatDetail, setRepeatDetail] = useState<any | null>(null);

  const synthesisBatchDesign = trpc.primers.synthesisBatchDesign.useMutation();
  const repeatAnalysisQuery = trpc.primers.analyzeRepeats.useQuery(
    {
      items: rows.map((row) => ({
        rowId: row.id,
        geneName: row.geneName.trim(),
        sequence: normalizeSeq(row.sequence),
      })),
    },
    {
      enabled: rows.some((row) => normalizeSeq(row.sequence).length > 0),
      refetchOnWindowFocus: false,
    }
  );

  const fieldOrder: Field[] = ["geneName", "sequence"];
  const makeCellKey = (rowId: number, field: Field) => `${rowId}:${field}`;

  const ensureRowCount = (targetRows: number) => {
    setRows(prev => {
      if (prev.length >= targetRows) return prev;
      const next = [...prev];
      for (let i = prev.length; i < targetRows; i++) next.push(createEmptyRow(i + 1));
      return next;
    });
  };

  const setCellValue = (rowId: number, field: Field, value: string) => {
    setRows(prev =>
      prev.map(r => (r.id === rowId ? { ...r, [field]: value } : r))
    );
  };

  const focusCell = (rowId: number, field: Field) => {
    ensureRowCount(rowId);
    setActiveCell({ rowId, field });
    requestAnimationFrame(() => {
      const el = inputRefs.current[makeCellKey(rowId, field)];
      if (el) {
        el.focus();
        el.select();
      }
    });
  };

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowId: number, field: Field) => {
    const col = fieldOrder.indexOf(field);
    if (e.key === "Enter") {
      e.preventDefault();
      focusCell(rowId + 1, field);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const nextCol = e.shiftKey ? Math.max(0, col - 1) : Math.min(fieldOrder.length - 1, col + 1);
      focusCell(rowId, fieldOrder[nextCol]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusCell(rowId + 1, field);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(Math.max(1, rowId - 1), field);
      return;
    }
  };

  useEffect(() => {
    const stopFill = () => {
      fillStateRef.current = null;
    };
    window.addEventListener("mouseup", stopFill);
    return () => window.removeEventListener("mouseup", stopFill);
  }, []);

  const startFillDown = (rowId: number, field: Field, value: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = { field, sourceRowId: rowId, sourceValue: value };
    fillStateRef.current = next;
  };

  const applyFillDownToRow = (targetRowId: number, field: Field) => {
    setRows(prev => {
      const activeFillState = fillStateRef.current;
      if (!activeFillState || activeFillState.field !== field) return prev;
      if (targetRowId <= activeFillState.sourceRowId) return prev;
      ensureRowCount(targetRowId);
      return prev.map(r => {
        if (r.id <= activeFillState.sourceRowId || r.id > targetRowId) return r;
        const offset = r.id - activeFillState.sourceRowId;
        const nextValue =
          field === "geneName"
            ? getAutoIncrementGeneName(activeFillState.sourceValue, offset)
            : activeFillState.sourceValue;
        return { ...r, [field]: nextValue };
      });
    });
  };

  const handleFillHover = (targetRowId: number, field: Field, e: React.MouseEvent) => {
    const active = fillStateRef.current;
    if (!active || active.field !== field) return;
    if ((e.buttons & 1) !== 1) return;
    applyFillDownToRow(targetRowId, field);
  };

  const applyBulkPaste = (startRowId: number, startField: Field, text: string) => {
    const parsedRows = parseClipboardRows(text);
    if (!parsedRows.length) return;
    const startRowIndex = Math.max(0, startRowId - 1);
    const startColIndex = fieldOrder.indexOf(startField);
    if (startColIndex < 0) return;

    const requiredRows = startRowIndex + parsedRows.length;
    ensureRowCount(Math.max(10, requiredRows));

    setRows(prev => {
      const next: Row[] = Array.from({ length: Math.max(prev.length, requiredRows) }, (_, i) =>
        prev[i] ? { ...prev[i], id: i + 1 } : createEmptyRow(i + 1)
      );

      parsedRows.forEach((cellsRaw, rowOffset) => {
        const rowIndex = startRowIndex + rowOffset;
        if (!next[rowIndex]) return;
        const cells = normalizeClipboardColumns(cellsRaw);
        fieldOrder.slice(startColIndex).forEach((field, colOffset) => {
          const cell = cells[colOffset];
          if (cell === undefined) return;
          (next[rowIndex] as any)[field] = cell;
        });
      });

      return next;
    });
  };

  const handleCellPaste = (e: React.ClipboardEvent<HTMLInputElement>, rowId: number, field: Field) => {
    const text = getClipboardText(e);
    if (!hasTableLikeSeparator(text)) return;
    const parsed = parseClipboardRows(text);
    if (!parsed.length) return;
    e.preventDefault();
    applyBulkPaste(rowId, field, text);
  };

  const handleClear = () => {
    if (!window.confirm("将清空当前表格与结果，此操作不可撤销。是否继续？")) return;
    setRows(Array.from({ length: 10 }, (_, i) => createEmptyRow(i + 1)));
    setDetail(null);
  };

  const handleImportXlsx = async (file: File) => {
    const data = await readXlsx(file);
    const mapped = data.map((r, idx) => {
      const geneName = (r.基因名 ?? r.GeneName ?? r.geneName ?? "").toString().trim();
      const sequence = (r.碱基序列 ?? r.Sequence ?? r.sequence ?? r.TargetSequence ?? r.TemplateOrTargetSequence ?? "").toString();
      return {
        id: idx + 1,
        geneName,
        sequence,
      } as Row;
    });

    const nextRows = mapped.filter(r => r.geneName || r.sequence);
    const padded = [
      ...nextRows,
      ...Array.from({ length: Math.max(0, 10 - nextRows.length) }, (_, i) => createEmptyRow(nextRows.length + i + 1)),
    ];
    setRows(padded.map((r, i) => ({ ...r, id: i + 1 })));
    toast.success("已导入", { description: `共 ${nextRows.length} 条` });
  };

  const validItems = useMemo(() => {
    return rows
      .map(r => ({
        geneName: r.geneName.trim(),
        sequence: normalizeSeq(r.sequence),
      }))
      .filter(r => r.geneName && r.sequence);
  }, [rows]);

  const results = (synthesisBatchDesign.data as any)?.results ?? null;
  const repeatStatsByRowId = useMemo(() => {
    const map = new Map<number, any>();
    for (const item of repeatAnalysisQuery.data ?? []) {
      map.set(item.rowId, item.repeatStats);
    }
    return map;
  }, [repeatAnalysisQuery.data]);

  const formatRepeatStats = (repeatStats?: any | null) => {
    if (!repeatStats) return "—";
    const total = Number(repeatStats.total ?? 0);
    const direct = Number(repeatStats.direct ?? 0);
    const inverted = Number(repeatStats.inverted ?? 0);
    const palindromic = Number(repeatStats.palindromic ?? 0);
    const minLength = Number(repeatStats.minLength ?? 9);
    if (total <= 0) return `0（阈值 ${minLength} nt）`;
    return `${total}（DR ${direct} / IR ${inverted} / PR ${palindromic}）`;
  };

  const getRepeatRangeLabel = (position: number, length: number) => {
    const start = Number(position || 0);
    const size = Number(length || 0);
    if (start <= 0 || size <= 0) return "—";
    return `${start}-${start + size - 1}`;
  };

  const getGroupedRepeatPairs = (repeatStats?: any | null) => {
    const pairs = Array.isArray(repeatStats?.pairs) ? repeatStats.pairs : [];
    const groups = new Map<string, any>();

    for (const pair of pairs) {
      const sequence1 = pair.sequence1 ?? "";
      const sequence2 =
        pair.type === "DR" || !pair.sequence2 || pair.sequence2 === pair.sequence1
          ? sequence1
          : pair.sequence2;
      const key = [pair.type ?? "", pair.length ?? 0, sequence1, sequence2].join("::");
      const existing = groups.get(key);
      if (existing) {
        if (!existing.position1List.includes(pair.position1)) existing.position1List.push(pair.position1);
        if (!existing.position2List.includes(pair.position2)) existing.position2List.push(pair.position2);
      } else {
        groups.set(key, {
          type: pair.type ?? "",
          length: Number(pair.length ?? 0),
          sequence1,
          sequence2,
          position1List: [pair.position1],
          position2List: [pair.position2],
        });
      }
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        position1List: group.position1List.sort((a: number, b: number) => a - b),
        position2List: group.position2List.sort((a: number, b: number) => a - b),
      }))
      .sort((a, b) => {
        const firstPos1A = a.position1List[0] ?? 0;
        const firstPos1B = b.position1List[0] ?? 0;
        if (firstPos1A !== firstPos1B) return firstPos1A - firstPos1B;
        const firstPos2A = a.position2List[0] ?? 0;
        const firstPos2B = b.position2List[0] ?? 0;
        if (firstPos2A !== firstPos2B) return firstPos2A - firstPos2B;
        return b.length - a.length;
      });
  };

  const formatRepeatRangeList = (positions: number[], length: number) => {
    if (!Array.isArray(positions) || !positions.length) return "—";
    return positions.map((position) => getRepeatRangeLabel(position, length)).join(", ");
  };

  const formatSequenceForView = (sequence?: string | null) => {
    if (!sequence) return "—";
    const clean = sequence.replace(/\s+/g, "");
    return clean.replace(/(.{60})/g, "$1\n");
  };

  const exportOligosRows = useMemo(() => {
    if (!results) return [];
    const rows: any[] = [];
    const blankRow = {
      寡核苷酸序号: "",
      序列: "",
      方向: "",
      起始位置: "",
      结束位置: "",
      长度: "",
      与下一条重叠长度: "",
      重叠区Tm: "",
      自二聚评分: "",
      发卡评分: "",
      质量评分: "",
      方案全局评分: "",
    };

    const successfulResults = results.filter((r: any) => r?.success);
    successfulResults.forEach((r: any, resultIndex: number) => {
      const oligos = Array.isArray(r.synthesisOligos) ? r.synthesisOligos : [];
      for (const o of oligos) {
        rows.push({
          寡核苷酸序号: `${r.geneName}-${o.index}`,
          序列: o.sequence ?? "",
          方向: o.strand === "forward" ? "正向" : "反向",
          起始位置: o.start ?? "",
          结束位置: o.end ?? "",
          长度: o.length ?? "",
          与下一条重叠长度: o.overlapWithNext ?? "",
          重叠区Tm: o.overlapTm ?? "",
          自二聚评分: o.selfDimerScore ?? "",
          发卡评分: o.hairpinScore ?? "",
          质量评分: o.qualityScore ?? "",
          方案全局评分: r.synthesisMeta?.globalScore ?? "",
        });
      }
      if (resultIndex < successfulResults.length - 1) {
        rows.push({ ...blankRow });
      }
    });
    return rows;
  }, [results]);

  const handleExportXlsx = () => {
    if (!exportOligosRows.length) {
      toast.error("没有可导出的结果");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(exportOligosRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SynthesisOligos");
    XLSX.writeFile(wb, `gene_synthesis_primers_${(synthesisBatchDesign.data as any)?.runId ?? "run"}.xlsx`);
  };

  const handleRun = async () => {
    if (validItems.length === 0) {
      toast.error("请至少填写一行", { description: "基因名与碱基序列为必填项" });
      return;
    }
    const oligoLen = Number(synthesisOligoLength);
    const minOv = Number(synthesisMinOverlap);
    if (!Number.isFinite(oligoLen) || oligoLen <= 0) {
      toast.error("引物长度参数无效");
      return;
    }
    if (!Number.isFinite(minOv) || minOv < 0) {
      toast.error("重叠长度参数无效");
      return;
    }
    try {
      await synthesisBatchDesign.mutateAsync({
        items: validItems.map((x: { geneName: string; sequence: string }) => ({
          geneName: x.geneName,
          sequence: x.sequence,
          leftArm: null,
          rightArm: null,
        })),
        params: {
          synthesisOligoLength: oligoLen,
          synthesisMinOverlap: minOv,
        },
      });
      toast.success("引物设计完成");
    } catch (e: any) {
      toast.error(e?.message ?? "引物设计失败");
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="text-2xl font-semibold">引物设计</div>
        <div className="text-muted-foreground text-sm">
          统一使用“基因合成引物”模式。支持单条/多条同一张表格录入，支持 Excel 复制粘贴与下拉填充。
        </div>
      </div>

      <Card className="gap-0">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>引物类型</CardTitle>
              <CardDescription>基因合成引物（寡核苷酸拼接）</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                下载模板
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={async e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  await handleImportXlsx(f);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                导入XLSX
              </Button>
              <Button variant="outline" onClick={handleClear}>
                <Trash2 className="mr-2 h-4 w-4" />
                清空
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>寡核苷酸长度</Label>
              <Input value={synthesisOligoLength} onChange={e => setSynthesisOligoLength(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>最小重叠长度</Label>
              <Input value={synthesisMinOverlap} onChange={e => setSynthesisMinOverlap(e.target.value)} />
            </div>
            <div className="flex items-end justify-end">
              <Button onClick={handleRun} disabled={synthesisBatchDesign.isPending}>
                {synthesisBatchDesign.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    设计中
                  </>
                ) : (
                  "开始设计"
                )}
              </Button>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="border p-2 text-sm font-medium w-12">#</th>
                    <th className="border p-2 text-sm font-medium min-w-[150px]">基因名</th>
                    <th className="border p-2 text-sm font-medium min-w-[300px]">碱基序列</th>
                    <th className="border p-2 text-sm font-medium min-w-[220px]">重复序列统计</th>
                    <th className="border p-2 text-sm font-medium w-[100px]">详情</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/50">
                      <td className="border p-1 text-center text-sm text-muted-foreground">{row.id}</td>
                      <td
                        className="border p-1 relative"
                        onMouseMove={(e) => handleFillHover(row.id, "geneName", e)}
                      >
                        <Input
                          ref={(el) => {
                            inputRefs.current[makeCellKey(row.id, "geneName")] = el;
                          }}
                          value={row.geneName}
                          onChange={(e) => setCellValue(row.id, "geneName", e.target.value)}
                          onPaste={(e) => handleCellPaste(e, row.id, "geneName")}
                          onFocus={() => setActiveCell({ rowId: row.id, field: "geneName" })}
                          onKeyDown={(e) => handleCellKeyDown(e, row.id, "geneName")}
                          className="border-0 focus-visible:ring-0 h-8"
                        />
                        <button
                          type="button"
                          className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-[2px] bg-primary/40 hover:bg-primary/70 cursor-ns-resize"
                          onMouseDown={(e) => startFillDown(row.id, "geneName", row.geneName || "", e)}
                          title="下拉填充"
                        />
                      </td>
                      <td
                        className="border p-1 relative"
                        onMouseMove={(e) => handleFillHover(row.id, "sequence", e)}
                      >
                        <Input
                          ref={(el) => {
                            inputRefs.current[makeCellKey(row.id, "sequence")] = el;
                          }}
                          value={row.sequence}
                          onChange={(e) => setCellValue(row.id, "sequence", e.target.value)}
                          onPaste={(e) => handleCellPaste(e, row.id, "sequence")}
                          onFocus={() => setActiveCell({ rowId: row.id, field: "sequence" })}
                          onKeyDown={(e) => handleCellKeyDown(e, row.id, "sequence")}
                          className="border-0 focus-visible:ring-0 h-8 font-mono"
                        />
                        <button
                          type="button"
                          className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-[2px] bg-primary/40 hover:bg-primary/70 cursor-ns-resize"
                          onMouseDown={(e) => startFillDown(row.id, "sequence", row.sequence || "", e)}
                          title="下拉填充"
                        />
                      </td>
                      <td className="border p-2 text-sm">
                        {normalizeSeq(row.sequence)
                          ? (repeatStatsByRowId.has(row.id)
                              ? formatRepeatStats(repeatStatsByRowId.get(row.id))
                              : repeatAnalysisQuery.isFetching
                                ? "计算中..."
                                : "—")
                          : "—"}
                      </td>
                      <td className="border p-2 text-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1"
                          disabled={!normalizeSeq(row.sequence)}
                          onClick={() =>
                            setRepeatDetail({
                              rowId: row.id,
                              geneName: row.geneName || `第 ${row.id} 行`,
                              sequence: normalizeSeq(row.sequence),
                              repeatStats: repeatStatsByRowId.get(row.id) ?? null,
                            })
                          }
                        >
                          <Eye className="h-3.5 w-3.5" />
                          查看
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div>已填写 {validItems.length} 条</div>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>设计结果</CardTitle>
              <CardDescription>每行输出一组基因合成寡核苷酸（可导出）。</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExportXlsx} disabled={!exportOligosRows.length}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                导出XLSX
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {!results ? (
            <div className="text-sm text-muted-foreground">暂无结果</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="border p-2 text-sm font-medium w-12">#</th>
                      <th className="border p-2 text-sm font-medium min-w-[180px]">基因名</th>
                      <th className="border p-2 text-sm font-medium w-24">状态</th>
                      <th className="border p-2 text-sm font-medium w-24">条数</th>
                      <th className="border p-2 text-sm font-medium w-32">详情</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r: any, idx: number) => {
                      const count = Array.isArray(r.synthesisOligos) ? r.synthesisOligos.length : 0;
                      return (
                        <tr key={`${r.geneName}_${idx}`} className="hover:bg-muted/50">
                          <td className="border p-2 text-center text-sm text-muted-foreground">{idx + 1}</td>
                          <td className="border p-2 text-sm">{r.geneName ?? ""}</td>
                          <td className="border p-2 text-sm text-center">{r.success ? "成功" : "失败"}</td>
                          <td className="border p-2 text-sm text-center">{r.success ? count : "-"}</td>
                          <td className="border p-2 text-sm text-center">
                            <Button variant="outline" size="sm" onClick={() => setDetail(r)} disabled={!r}>
                              查看
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{detail?.geneName ?? ""} 详情</DialogTitle>
          </DialogHeader>
          {detail?.success ? (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                全局评分：{detail?.synthesisMeta?.globalScore ?? "-"}，最大自二聚：{detail?.synthesisMeta?.maxSelfDimer ?? "-"}，最大发卡：{detail?.synthesisMeta?.maxHairpin ?? "-"}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="border p-2 text-sm font-medium w-16">序号</th>
                        <th className="border p-2 text-sm font-medium w-16">方向</th>
                        <th className="border p-2 text-sm font-medium w-24">长度</th>
                        <th className="border p-2 text-sm font-medium">序列</th>
                        <th className="border p-2 text-sm font-medium w-24">复制</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail?.synthesisOligos ?? []).map((o: any) => (
                        <tr key={o.index} className="hover:bg-muted/50">
                          <td className="border p-2 text-sm text-center">{o.index}</td>
                          <td className="border p-2 text-sm text-center">{o.strand === "forward" ? "正向" : "反向"}</td>
                          <td className="border p-2 text-sm text-center">{o.length}</td>
                          <td className="border p-2 text-xs font-mono break-all">{o.sequence}</td>
                          <td className="border p-2 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(o.sequence ?? "");
                                  toast.success("已复制");
                                } catch {
                                  toast.error("复制失败");
                                }
                              }}
                              title="复制"
                            >
                              <Copy className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-destructive">{detail?.error ?? "设计失败"}</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(repeatDetail)} onOpenChange={(open) => !open && setRepeatDetail(null)}>
        <DialogContent className="w-[95vw] sm:max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{repeatDetail?.geneName ?? ""} 重复序列详情</DialogTitle>
          </DialogHeader>
          {repeatDetail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">序列长度</p>
                  <p className="text-base font-semibold">{repeatDetail.sequence?.length ?? 0} bp</p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">重复序列统计</p>
                  <p className="text-base font-semibold">{formatRepeatStats(repeatDetail.repeatStats)}</p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">碱基序列</p>
                <pre className="max-h-44 overflow-y-auto rounded-xl border bg-muted/30 p-3 text-xs leading-6 font-mono whitespace-pre-wrap break-words">
                  {formatSequenceForView(repeatDetail.sequence)}
                </pre>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">重复序列明细</p>
                {!getGroupedRepeatPairs(repeatDetail.repeatStats).length ? (
                  <div className="rounded-xl border bg-muted/20 p-3 text-sm text-muted-foreground">
                    未检测到达到阈值的重复序列
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[760px]">
                      <thead className="bg-muted/60">
                        <tr>
                          <th className="border p-2 text-left text-xs font-medium">类型</th>
                          <th className="border p-2 text-left text-xs font-medium">重复序列</th>
                          <th className="border p-2 text-left text-xs font-medium">位置 1</th>
                          <th className="border p-2 text-left text-xs font-medium">位置 2</th>
                          <th className="border p-2 text-left text-xs font-medium">长度</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getGroupedRepeatPairs(repeatDetail.repeatStats).map((group: any, index: number) => (
                          <tr key={`${group.type}_${group.sequence1}_${group.length}_${index}`} className="hover:bg-muted/30">
                            <td className="border p-2 text-xs font-medium">{group.type}</td>
                            <td className="border p-2 text-xs font-mono break-all">
                              {group.sequence1}
                              {group.type !== "DR" && group.sequence2 && group.sequence2 !== group.sequence1 ? (
                                <React.Fragment>
                                  <span className="mx-1 text-muted-foreground">/</span>
                                  {group.sequence2}
                                </React.Fragment>
                              ) : null}
                            </td>
                            <td className="border p-2 text-xs font-mono">{formatRepeatRangeList(group.position1List, group.length)}</td>
                            <td className="border p-2 text-xs font-mono">{formatRepeatRangeList(group.position2List, group.length)}</td>
                            <td className="border p-2 text-xs font-mono">{group.length} nt</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
