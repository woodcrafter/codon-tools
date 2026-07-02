import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ArrowRight, Check, Copy, FileText, FileSpreadsheet, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export default function OptimizationResults() {
  const params = useParams<{ jobId: string }>();
  const [, setLocation] = useLocation();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailResult, setDetailResult] = useState<any | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

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
    const rows = results.map((r: any) => ({
      基因名称: r.geneName,
      平均GC含量: r.avgGcContent ? `${r.avgGcContent}%` : "",
      表达宿主: r.hostName ?? "",
      二级表达宿主: r.secondaryHostName ?? "",
      避免的酶切位点: r.avoidEnzymesDisplay ?? "",
      重复序列统计: formatRepeatStats(r.repeatStats),
      CAI得分: r.caiScore ?? "",
      原始序列: r.originalSequence ?? "",
      优化后序列: r.optimizedSequence ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "优化结果");
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

  const handleGoToPrimerDesign = () => {
    const jobId = job?.jobId ?? params.jobId;
    const picked = selectedIds.length > 0 ? results.filter((r: any) => selectedIds.includes(r.id)) : results;
    const items = picked
      .map((r: any) => ({
        geneName: r.geneName ?? "",
        targetSequence: (r.optimizedSequence ?? "").toString(),
      }))
      .filter((x: any) => x.geneName && x.targetSequence);

    if (items.length === 0) {
      toast.error("没有可用于引物设计的优化序列");
      return;
    }

    try {
      sessionStorage.setItem(
        `primerSeed:${jobId}`,
        JSON.stringify({ source: "optimization", jobId, items })
      );
    } catch {
      toast.error("写入跳转数据失败");
      return;
    }

    toast.success("已导入到引物设计", { description: `共 ${items.length} 条` });
    setLocation(`/primers?from=optimization&jobId=${encodeURIComponent(jobId)}`);
  };

  const handleCopyOptimizedSequence = async (id: number, sequence?: string | null) => {
    if (!sequence) {
      toast.error("当前条目暂无可复制序列");
      return;
    }
    try {
      await navigator.clipboard.writeText(sequence);
      setCopiedId(id);
      toast.success("优化后序列已复制");
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch {
      toast.error("复制失败，请重试");
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
            <table className="w-full min-w-[1110px]">
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
                  <th className="border p-2 text-sm font-medium min-w-[180px]">表达宿主</th>
                  <th className="border p-2 text-sm font-medium min-w-[120px]">二级表达宿主</th>
                  <th className="border p-2 text-sm font-medium min-w-[200px]">避免的酶切位点</th>
                  <th className="border p-2 text-sm font-medium min-w-[220px]">重复序列统计</th>
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
                    <td className="border p-2 text-sm">{r.hostName ?? "—"}</td>
                    <td className="border p-2 text-sm">{r.secondaryHostName ?? "—"}</td>
                    <td className="border p-2 text-sm text-muted-foreground">
                      {r.avoidEnzymesDisplay ?? "—"}
                    </td>
                    <td className="border p-2 text-sm">
                      {formatRepeatStats(r.repeatStats)}
                    </td>
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
                          onClick={() => handleCopyOptimizedSequence(r.id, r.optimizedSequence)}
                        >
                          {copiedId === r.id ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl border-border/60 p-0">
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
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">原始序列</p>
                <pre className="max-h-44 overflow-y-scroll overflow-x-hidden rounded-xl border bg-muted/30 p-3 pr-2 text-xs leading-6 font-mono whitespace-pre-wrap break-words">
                  {formatSequenceForView(detailResult.originalSequence)}
                </pre>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">优化后序列</p>
                <pre className="max-h-60 overflow-y-scroll overflow-x-hidden rounded-xl border border-primary/20 bg-primary/5 p-3 pr-2 text-xs leading-6 font-mono whitespace-pre-wrap break-words">
                  {formatSequenceForView(detailResult.optimizedSequence)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex justify-center gap-4 mt-6 print:hidden">
        <Button variant="outline" onClick={handleGoToPrimerDesign}>
          <ArrowRight className="h-4 w-4 mr-2" />
          引物合成
        </Button>
      </div>
    </div>
  );
}
