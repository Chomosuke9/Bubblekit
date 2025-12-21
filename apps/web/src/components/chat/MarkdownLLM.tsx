// src/components/MarkdownLLM.tsx
import { isValidElement, memo, useEffect, useId, useMemo, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import mermaid from "mermaid";
import "katex/dist/katex.min.css";

type MarkdownLLMProps = {
  markdown: string;
  className?: string;
};

let mermaidInitialized = false;
function ensureMermaidInitialized() {
  if (mermaidInitialized) return;

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "sandbox",
  });

  mermaidInitialized = true;
}

/**
 * If the assistant wraps everything in an outer ```markdown ... ``` fence,
 * unwrap it so react-markdown can parse headings/lists/etc normally.
 */
function unwrapOuterMarkdownFence(input: string): string {
  if (!input) return "";

  const s = input.replace(/\r\n/g, "\n").trim();

  // Match: ```lang\n...\n```
  const m = s.match(/^```([a-zA-Z0-9_-]*)\n([\s\S]*?)\n```$/);
  if (!m) return input;

  const lang = (m[1] || "").toLowerCase();
  const body = m[2];

  // Unwrap explicit markdown fences
  if (lang === "markdown" || lang === "md") return body;

  // If no language, unwrap only if content strongly looks like markdown (common LLM behavior).
  if (lang === "") {
    const looksLikeMarkdown =
      /(^|\n)#{1,6}\s/.test(body) || // headings
      /\*\*[^*\n]+\*\*/.test(body) || // bold
      /(^|\n)>\s/.test(body) || // blockquote
      /(^|\n)-\s/.test(body) || // list
      /(^|\n)\d+\.\s/.test(body) || // ordered list
      /\[[^\]]+\]\([^)]+\)/.test(body) || // links
      /```/.test(body); // inner fences common in markdown guides

    if (looksLikeMarkdown) return body;
  }

  // Keep real code fences (js/python/etc.) as-is.
  return input;
}

function MermaidDiagram({ chart }: { chart: string }) {
  const reactId = useId().replace(/[:]/g, "_");
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ensureMermaidInitialized();

    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;

    host.textContent = "Rendering diagram…";

    (async () => {
      try {
        const { svg, bindFunctions } = await mermaid.render(`mmd_${reactId}`, chart);

        if (cancelled) return;
        if (!hostRef.current) return;

        hostRef.current.innerHTML = svg;
        bindFunctions?.(hostRef.current);
      } catch (err) {
        if (cancelled) return;
        if (!hostRef.current) return;

        hostRef.current.textContent = `Mermaid error: ${String(err)}`;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, reactId]);

  return <div ref={hostRef} className="mermaid-diagram" />;
}

/**
 * Markdown renderer (LLM-friendly):
 * - GFM via remark-gfm
 * - Soft line breaks via remark-breaks (newline -> <br>)
 * - Mermaid via ```mermaid fences
 * - Unwrap outer ```markdown fences if present
 */
export const MarkdownLLM = memo(function MarkdownLLM({ markdown, className }: MarkdownLLMProps) {
  const normalized = useMemo(() => unwrapOuterMarkdownFence(markdown), [markdown]);

  return (
    <div className={className ? `markdown-llm ${className}` : "markdown-llm"}>
      <Markdown
        remarkPlugins={[remarkMath, remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        urlTransform={(url) => url}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),

          // Intercept fenced mermaid blocks: ```mermaid ... ```
          pre: ({ children, ...props }) => {
            const child = Array.isArray(children) ? children[0] : children;

            if (
              isValidElement(child) &&
              (child.type === "code" || (child as any).props?.className)
            ) {
              const cls = String((child as any).props?.className ?? "");
              const isMermaid = /\blanguage-mermaid\b/i.test(cls);

              if (isMermaid) {
                const raw = (child as any).props?.children ?? "";
                const text =
                  Array.isArray(raw) ? raw.join("") : typeof raw === "string" ? raw : String(raw);

                return <MermaidDiagram chart={text.replace(/\n$/, "")} />;
              }
            }

            return <pre {...props}>{children}</pre>;
          },
        }}
      >
        {normalized}
      </Markdown>
    </div>
  );
});

export default MarkdownLLM;
