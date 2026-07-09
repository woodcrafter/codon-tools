import { Fragment, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Check, Copy, FileText, FileSpreadsheet, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export default function OptimizationResults() {
  const params = useParams<{ jobId: string }>();
  const [, setLocation] = useLocation();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailResult, setDetailResult] = useState<any | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const { data, isLoading, error } = trpc.optimizationJobs.getByJobId.useQuery(
    { jobId: params.jobId || "" },
    { enabled: !!params.jobId }
  );
  const rerunMutation = trpc.optimizationJobs.rerunByJobId.useMutation({
    onSuccess: ({ newJobId }) => {
      toast.success("已创建重跑任务");
      setLocation(`/optimization/${newJobId}`);
    },
    onError: (e) => {
      toast.error(e.message || "重跑失败，请稍后重试");
    },
  });

  const job = data?.job;
  const results = data?.results ?? [];

  const allSelected = results.length > 0 && results.every((r: any) => selectedIds.includes(r.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(results.map((r: any) => r.id));
  };
  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleDownloadExcel = () => {
    const summaryRows = results.map((r: any) => ({
      基因名称: r.geneName,
      优化后序列: r.optimizedSequence ?? "",
      原始序列: r.originalSequence ?? "",
      序列长度: (r.optimizedSequence ?? "").replace(/\s/g, "").length || "",
      CAI得分: r.caiScore ?? "",
      平均GC含量: r.avgGcContent ? `${r.avgGcContent}%` : "",
      重复序列统计: formatRepeatStats(r.repeatStats),
      表达宿主: r.hostName ?? "",
      二级表达宿主: r.secondaryHostName ?? "",
      避免的酶切位点: r.avoidEnzymesDisplay ?? "",
    }));

    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    summarySheet["!cols"] = [
      { wch: 18 },
      { wch: 48 },
      { wch: 48 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 24 },
      { wch: 22 },
      { wch: 18 },
      { wch: 24 },
    ];
    summarySheet["!autofilter"] = { ref: "A1:J1" };

    const detailRows = results.flatMap((r: any) => {
      const groups = getGroupedRepeatPairs(r.repeatStats);
      if (!groups.length) {
        return [{
          基因名称: r.geneName ?? "",
          重复序列统计: formatRepeatStats(r.repeatStats),
          类型: "—",
          重复序列: "未检测到达到阈值的重复序列",
          配对序列: "—",
          位置1: "—",
          位置2: "—",
          长度: "—",
        }];
      }

      return groups.map((group: any) => ({
        基因名称: r.geneName ?? "",
        重复序列统计: formatRepeatStats(r.repeatStats),
        类型: group.type ?? "",
        重复序列: group.sequence1 ?? "",
        配对序列:
          group.type === "DR" || !group.sequence2 || group.sequence2 === group.sequence1
            ? group.sequence1 ?? ""
            : group.sequence2,
        位置1: formatRepeatRangeList(group.position1List, group.length),
        位置2: formatRepeatRangeList(group.position2List, group.length),
        长度: group.length ? `${group.length} nt` : "",
      }));
    });

    const detailSheetRows: Array<Array<string>> = [
      ["优化结果重复序列明细"],
      [`Job ID: ${job?.jobId ?? params.jobId ?? ""}`, `批号: ${job?.batchNo || "-"}`, `导出时间: ${formatReportDate(new Date())}`],
      ["说明：每一行对应一条重复片段；位置采用 1-based 闭区间表示。"],
      [],
      ["基因名称", "重复序列统计", "类型", "重复序列", "配对序列", "位置1", "位置2", "长度"],
      ...detailRows.map((row: any) => [
        row.基因名称,
        row.重复序列统计,
        row.类型,
        row.重复序列,
        row.配对序列,
        row.位置1,
        row.位置2,
        row.长度,
      ]),
    ];

    const detailSheet = XLSX.utils.aoa_to_sheet(detailSheetRows);
    detailSheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
    ];
    detailSheet["!cols"] = [
      { wch: 18 },
      { wch: 24 },
      { wch: 8 },
      { wch: 26 },
      { wch: 26 },
      { wch: 14 },
      { wch: 14 },
      { wch: 10 },
    ];
    detailSheet["!rows"] = [
      { hpt: 24 },
      { hpt: 20 },
      { hpt: 20 },
      { hpt: 8 },
      { hpt: 20 },
    ];
    detailSheet["!autofilter"] = { ref: `A5:H${Math.max(5, detailSheetRows.length)}` };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summarySheet, "优化结果");
    XLSX.utils.book_append_sheet(wb, detailSheet, "重复序列明细");
    const filename = `优化结果_${job?.jobId ?? params.jobId}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast.success("Excel 已下载");
  };

  const handleDownloadPdf = () => {
    window.print();
  };

  const handleRerun = () => {
    if (!params.jobId) return;
    rerunMutation.mutate({ jobId: params.jobId });
  };

  const fallbackCopyText = (text: string) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);

    const selection = document.getSelection();
    const originalRange =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    let copied = false;
    try {
      copied = document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
      if (selection) {
        selection.removeAllRanges();
        if (originalRange) {
          selection.addRange(originalRange);
        }
      }
    }

    return copied;
  };

  const handleCopyText = async (
    key: string,
    sequence: string | null | undefined,
    successMessage: string,
    emptyMessage: string
  ) => {
    if (!sequence) {
      toast.error(emptyMessage);
      return;
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(sequence);
      } else if (!fallbackCopyText(sequence)) {
        throw new Error("Clipboard unavailable");
      }
      setCopiedKey(key);
      toast.success(successMessage);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1500);
    } catch {
      if (fallbackCopyText(sequence)) {
        setCopiedKey(key);
        toast.success(successMessage);
        setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1500);
      } else {
        toast.error("复制失败，请重试");
      }
    }
  };

  const formatSequenceForView = (sequence?: string | null) => {
    if (!sequence) return "—";
    const clean = sequence.replace(/\s+/g, "");
    return clean.replace(/(.{60})/g, "$1\n");
  };

  const formatReportDate = (value?: Date | string | null) => {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("zh-CN", { hour12: false });
  };

  const getSequenceTypeLabel = (sequence?: string | null) => {
    const clean = (sequence || "").toUpperCase().replace(/\s/g, "");
    if (!clean) return "未知";
    if (/^[ATCGN]+$/.test(clean)) return "DNA";
    if (/^[ACDEFGHIKLMNPQRSTVWY*]+$/.test(clean)) return "Protein";
    return "Mixed";
  };

  const getSequenceSizeLabel = (sequence?: string | null) => {
    const clean = (sequence || "").replace(/\s/g, "");
    if (!clean) return "0";
    const type = getSequenceTypeLabel(sequence);
    return `${clean.length}${type === "Protein" ? "aa" : "bp"}`;
  };

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

  const formatRepeatPairs = (repeatStats?: any | null) => {
    const groups = getGroupedRepeatPairs(repeatStats);
    if (!groups.length) return "—";
    return groups
      .map((group: any) => {
        const sequence = group.sequence1 || group.sequence2 || "";
        return `${group.type} ${sequence} [${formatRepeatRangeList(group.position1List, group.length)} / ${formatRepeatRangeList(group.position2List, group.length)}]`;
      })
      .join("; ");
  };

  if (isLoading || !params.jobId) {
    return (
      <div className="w-full py-2">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="w-full py-2">
        <p className="text-destructive">未找到该优化记录</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/codon")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full py-2 print:py-4">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h1 className="text-3xl font-bold">优化结果汇总</h1>
          <p className="text-muted-foreground mt-1">(Job ID: {job.jobId} | 批号: {job.batchNo || "-"})</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setLocation("/codon")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
          <Button variant="outline" size="sm" onClick={handleRerun} disabled={rerunMutation.isPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${rerunMutation.isPending ? "animate-spin" : ""}`} />
            {rerunMutation.isPending ? "重跑中..." : "一键重跑"}
          </Button>
          <span className="text-sm text-muted-foreground">下载：</span>
          <Button variant="ghost" size="icon" onClick={handleDownloadPdf} title="导出 PDF">
            <FileText className="h-5 w-5 text-red-600" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleDownloadExcel} title="导出 Excel">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
          </Button>
        </div>
      </div>

      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold">优化结果汇总</h1>
        <p className="text-sm text-muted-foreground">(Job ID: {job.jobId} | 批号: {job.batchNo || "-"})</p>
      </div>

      <Card className="print:hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1160px]">
              <thead className="bg-muted">
                <tr>
                  <th className="border p-2 text-sm font-medium w-12">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      className="print:hidden"
                    />
                  </th>
                  <th className="border p-2 text-sm font-medium min-w-[120px]">基因名称</th>
                  <th className="border p-2 text-sm font-medium min-w-[100px]">平均GC含量</th>
                  <th className="border p-2 text-sm font-medium min-w-[100px]">CAI 得分</th>
                  <th className="border p-2 text-sm font-medium min-w-[160px]">表达宿主</th>
                  <th className="border p-2 text-sm font-medium min-w-[110px]">二级表达宿主</th>
                  <th className="border p-2 text-sm font-medium min-w-[180px]">避免的酶切位点</th>
                  <th className="border p-2 pr-3 text-sm font-medium min-w-[180px] whitespace-nowrap">重复序列统计</th>
                  <th className="sticky right-0 z-20 border bg-muted p-2 text-sm font-medium min-w-[120px] whitespace-nowrap shadow-[-1px_0_0_0_hsl(var(--border))]">
                    优化结果
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((r: any) => (
                  <tr key={r.id} className="hover:bg-muted/50">
                    <td className="border p-2 print:hidden">
                      <Checkbox
                        checked={selectedIds.includes(r.id)}
                        onCheckedChange={() => toggleSelected(r.id)}
                      />
                    </td>
                    <td className="border p-2 text-sm">{r.geneName}</td>
                    <td className="border p-2 text-sm">
                      {r.avgGcContent ? `${r.avgGcContent}%` : "—"}
                    </td>
                    <td className="border p-2 text-sm">{r.caiScore ?? "—"}</td>
                    <td className="border p-2 text-sm break-words">{r.hostName ?? "—"}</td>
                    <td className="border p-2 text-sm">{r.secondaryHostName ?? "—"}</td>
                    <td className="border p-2 text-sm text-muted-foreground break-words">
                      {r.avoidEnzymesDisplay ?? "—"}
                    </td>
                    <td className="border p-2 pr-3 text-sm whitespace-nowrap">{formatRepeatStats(r.repeatStats)}</td>
                    <td className="sticky right-0 z-10 border bg-background p-2 text-sm whitespace-nowrap shadow-[-1px_0_0_0_hsl(var(--border))]">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-primary"
                          onClick={() => setDetailResult(r)}
                        >
                          Details
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="复制优化后序列"
                          onClick={() =>
                            handleCopyText(
                              `row-${r.id}`,
                              r.optimizedSequence,
                              "优化后序列已复制",
                              "当前条目暂无可复制序列"
                            )
                          }
                        >
                          {copiedKey === `row-${r.id}` ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="hidden print:block">
        <div className="text-center pb-6" style={{ breakAfter: "page" as const }}>
          <h1 className="text-3xl font-bold">Optimization Report</h1>
          <p className="text-sm mt-2">Tool Version Beta 1.0</p>
          <p className="text-sm mt-1">Job ID: {job.jobId}</p>
        </div>
        {results.map((r: any, idx: number) => (
          <section key={`print-${r.id}`} className="text-[11px] leading-5" style={{ breakBefore: idx === 0 ? "auto" : "page" }}>
            <div className="flex items-start justify-between border-b pb-2 mb-3">
              <div>
                <h2 className="text-xl font-semibold">Optimization Report</h2>
                <p>Job ID: {job.jobId}</p>
              </div>
              <p>{idx + 2} / {results.length + 1}</p>
            </div>
            <div className="space-y-1 mb-3">
              <p><span className="font-semibold">Date:</span> {formatReportDate(job.createdAt)}</p>
              <p><span className="font-semibold">Gene Name:</span> {r.geneName || "—"}</p>
              <p><span className="font-semibold">Expression Host Organism:</span> {r.hostName || "—"}</p>
              <p><span className="font-semibold">Secondary Host Organism:</span> {r.secondaryHostName || "—"}</p>
              <p><span className="font-semibold">Sequence Type:</span> {getSequenceTypeLabel(r.originalSequence)}</p>
              <p><span className="font-semibold">Size:</span> {getSequenceSizeLabel(r.originalSequence)}</p>
              <p><span className="font-semibold">Excluded enzyme sites:</span> {r.avoidEnzymesDisplay || "[]"}</p>
              <p><span className="font-semibold">Repeat Stats:</span> {formatRepeatStats(r.repeatStats)}</p>
              <p><span className="font-semibold">Repeat Details:</span> {formatRepeatPairs(r.repeatStats)}</p>
              <p><span className="font-semibold">CAI:</span> {r.caiScore || "—"}</p>
              <p><span className="font-semibold">GC%:</span> {r.avgGcContent ? `${r.avgGcContent}%` : "—"}</p>
            </div>
            <div className="mb-3">
              <p className="font-semibold mb-1">Original Sequence (Length: {getSequenceSizeLabel(r.originalSequence)}):</p>
              <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-4">{formatSequenceForView(r.originalSequence)}</pre>
            </div>
            <div>
              <p className="font-semibold mb-1">Optimized Sequence (Length: {getSequenceSizeLabel(r.optimizedSequence)}, GC%: {r.avgGcContent ? `${r.avgGcContent}%` : "—"}):</p>
              <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-4">{formatSequenceForView(r.optimizedSequence)}</pre>
            </div>
          </section>
        ))}
      </div>

      <Dialog open={!!detailResult} onOpenChange={(o) => !o && setDetailResult(null)}>
        <DialogContent className="w-[95vw] sm:max-w-6xl max-h-[85vh] overflow-y-auto rounded-2xl border-border/60 p-0">
          <DialogHeader>
            <DialogTitle className="px-6 pt-6 pb-4 text-lg">{detailResult?.geneName ?? ""} 优化详情</DialogTitle>
          </DialogHeader>
          {detailResult && (
            <div className="space-y-5 px-6 pb-6 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">平均GC含量</p>
                  <p className="text-base font-semibold">{detailResult.avgGcContent ? `${detailResult.avgGcContent}%` : "—"}</p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">CAI 得分</p>
                  <p className="text-base font-semibold">{detailResult.caiScore ?? "—"}</p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3 col-span-2">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">重复序列统计</p>
                  <p className="text-base font-semibold">{formatRepeatStats(detailResult.repeatStats)}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">原始序列</p>
                </div>
                <pre className="max-h-44 overflow-y-scroll overflow-x-hidden rounded-xl border bg-muted/30 p-3 pr-2 text-xs leading-6 font-mono whitespace-pre-wrap break-words">
                  {formatSequenceForView(detailResult.originalSequence)}
                </pre>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">优化后序列</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1"
                    onClick={() =>
                      handleCopyText(
                        `detail-optimized-${detailResult.id ?? detailResult.geneName ?? "unknown"}`,
                        detailResult.optimizedSequence,
                        "优化后序列已复制",
                        "当前条目暂无优化后序列"
                      )
                    }
                  >
                    {copiedKey === `detail-optimized-${detailResult.id ?? detailResult.geneName ?? "unknown"}` ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    复制
                  </Button>
                </div>
                <pre className="max-h-60 overflow-y-scroll overflow-x-hidden rounded-xl border border-primary/20 bg-primary/5 p-3 pr-2 text-xs leading-6 font-mono whitespace-pre-wrap break-words">
                  {formatSequenceForView(detailResult.optimizedSequence)}
                </pre>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">重复序列明细</p>
                {!getGroupedRepeatPairs(detailResult.repeatStats).length ? (
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
                        {getGroupedRepeatPairs(detailResult.repeatStats).map((group: any, index: number) => (
                          <tr key={`${group.type}_${group.sequence1}_${group.length}_${index}`} className="hover:bg-muted/30">
                            <td className="border p-2 text-xs font-medium">{group.type}</td>
                            <td className="border p-2 text-xs font-mono break-all">
                              {group.sequence1}
                              {group.type !== "DR" && group.sequence2 && group.sequence2 !== group.sequence1 ? (
                                <Fragment>
                                  <span className="mx-1 text-muted-foreground">/</span>
                                  {group.sequence2}
                                </Fragment>
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
