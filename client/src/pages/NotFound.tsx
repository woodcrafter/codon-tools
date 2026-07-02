import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="p-6 space-y-4">
      <div className="text-xl font-semibold">页面不存在</div>
      <Link href="/">
        <Button>返回首页</Button>
      </Link>
    </div>
  );
}

