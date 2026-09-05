import { Shirt } from "lucide-react"

import { BRAND_NAME } from "@/lib/brand"

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
    <div className="w-full max-w-md">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center bg-primary text-white"><Shirt /></div>
        <p className="text-small text-muted-foreground">{BRAND_NAME}</p>
        <h1 className="text-h3 font-bold">{title}</h1>
      </div>
      <div className="border border-border bg-card p-6">{children}</div>
    </div>
  </div>
}
