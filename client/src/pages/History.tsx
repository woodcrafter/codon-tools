import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useState } from "react";

export default function HistoryPage() {
  const [type, setType] = useState<"all" | "optimization" | "primer_design">("all");
  const [selected, setSelected] = useState<{ type: "optimization" | "primer_design"; runId: string } | null>(null);
  const runs = trpc.history.list.useQuery({ type, limit: 100 });
  const clear = trpc.history.clear.useMutation({
    onSuccess: () => runs.refetch(),
  });
  const del = trpc.history.delete.useMutation({
    onSuccess: () => runs.refetch(),
  });
  const detail = trpc.history.get.useQuery(selected ?? { type: "optimization", runId: "__" }, {
    enabled: Boolean(selected),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">计算历史</h1>
        <div className="flex gap-2">
          <select
            className="border rounded px-3 py-2 bg-background"
            value={type}
            onChange={e => setType(e.target.value as any)}
          >
            <option value="all">全部</option>
            <option value="optimization">优化</option>
            <option value="primer_design">引物</option>
          </select>
          <Button variant="destructive" onClick={() => clear.mutate({ type })} disabled={clear.isPending}>
            清空
          </Button>
        </div>
      </div>

      <Card className="p-4 space-y-2">
        <div className="text-sm text-muted-foreground">共 {runs.data?.length ?? 0} 条</div>
        <div className="space-y-2">
          {(runs.data ?? []).map((r: any) => (
            <div key={`${r.type}_${r.runId}`} className="flex items-center justify-between gap-2 border-b py-2">
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {r.type === "optimization" ? "优化" : "引物"} · {r.runId}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {r.status} · {String(r.createdAt ?? "")}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelected({ type: r.type, runId: r.runId })}
                >
                  查看
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => del.mutate({ type: r.type, runId: r.runId })}
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {detail.data && (
        <Card className="p-4">
          <pre className="text-xs bg-muted p-3 rounded overflow-auto">{JSON.stringify(detail.data, null, 2)}</pre>
        </Card>
      )}
    </div>
  );
}
