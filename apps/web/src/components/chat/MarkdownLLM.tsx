// src/components/MarkdownLLM.tsx
import {
  isValidElement,
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import type { Pluggable, PluggableList } from "unified";
import mermaid from "mermaid";
import "katex/dist/katex.min.css";

type MarkdownLLMProps = {
  markdown: string;
  className?: string;
  safe_mode?: boolean;
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

function extractText(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => extractText(item)).join("");
  }
  if (isValidElement<{ children?: ReactNode }>(value)) {
    return extractText(value.props.children);
  }
  return "";
}

function getLanguageFromClassName(className?: string): string | undefined {
  if (!className) return undefined;
  const match = className.match(/(?:language|lang)-([a-z0-9_-]+)/i);
  return match ? match[1].toLowerCase() : undefined;
}

type CodeBlockProps = {
  language?: string;
  code: string;
  className?: string;
  children: ReactNode;
};

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  let success = false;
  try {
    success = document.execCommand("copy");
  } catch {
    success = false;
  } finally {
    document.body.removeChild(textarea);
  }

  return success;
}

function CodeBlock({ language, code, className, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const canCopy = typeof document !== "undefined";
  const label = language ?? "text";

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    if (!canCopy) return;
    try {
      const success = await copyToClipboard(code);
      if (success) {
        setCopied(true);
        if (timeoutRef.current !== null) {
          window.clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = window.setTimeout(() => {
          setCopied(false);
        }, 2000);
      }
    } catch {
      // Ignore clipboard errors.
    }
  }

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-header">
        <span className="markdown-code-lang">{label}</span>
        <button
          type="button"
          className="markdown-code-copy"
          onClick={handleCopy}
          disabled={!canCopy}
          aria-live="polite"
        >
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>
      <pre className="markdown-code-pre">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
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
export const MarkdownLLM = memo(function MarkdownLLM({
  markdown,
  className,
  safe_mode = false,
}: MarkdownLLMProps) {
  const normalized = useMemo(() => unwrapOuterMarkdownFence(markdown), [markdown]);
  const highlightPlugin = [rehypeHighlight, { ignoreMissing: true }] as unknown;
  const rehypePlugins = useMemo<PluggableList>(
    () =>
      safe_mode
        ? [rehypeKatex, highlightPlugin as any]
        : [rehypeRaw, rehypeKatex, highlightPlugin as any],
    [safe_mode],
  );

  return (
    <>
      {/* MarkdownLLM: container */}
    <div className={className ? `markdown-llm ${className}` : "markdown-llm"}>
      {/* MarkdownLLM: <Markdown> renderer */}
      <Markdown
        remarkPlugins={[remarkMath, remarkGfm, remarkBreaks]}
        rehypePlugins={rehypePlugins}
        skipHtml={safe_mode}
        components={{
          a: (props) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),

          // Intercept fenced mermaid blocks: ```mermaid ... ```
          pre: ({ children, ...props }) => {
            const child = Array.isArray(children) ? children[0] : children;

            if (isValidElement(child)) {
              const childProps = child.props as { className?: string; children?: ReactNode };
              const className = childProps?.className;
              const raw = childProps?.children;
              const text = extractText(raw).replace(/\n$/, "");
              const rendered = raw ?? text;

              if (className && /\blanguage-mermaid\b/i.test(className)) {
                return <MermaidDiagram chart={text} />;
              }

              if (child.type === "code" || className) {
                return (
                  <CodeBlock
                    language={getLanguageFromClassName(className)}
                    code={text}
                    className={className}
                  >
                    {rendered}
                  </CodeBlock>
                );
              }
            }

            return <pre {...props}>{children}</pre>;
          },
        }}
      >
        {/* MarkdownLLM: rendered content */}
        {normalized}
      </Markdown>
    </div>
    </>
  );
});

export default MarkdownLLM;
