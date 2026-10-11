"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyCatalogLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={copyLink}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? "Copied" : "Copy link"}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Public catalog link copied." : ""}
      </span>
    </div>
  );
}
