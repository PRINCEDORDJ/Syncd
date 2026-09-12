import MarkdownBase from "react-markdown";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[13px] leading-relaxed text-ink">
      <MarkdownBase
        components={{
          h1: ({ children }) => <h1 className="text-lg font-semibold mt-3 mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold mt-3 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mt-3 mb-1">{children}</h3>,
          h4: ({ children }) => <h4 className="text-sm font-semibold mt-3 mb-1">{children}</h4>,
          p: ({ children }) => <p className="my-1">{children}</p>,
          ul: ({ children }) => <ul className="my-1 pl-4 list-disc">{children}</ul>,
          ol: ({ children }) => <ol className="my-1 pl-4 list-decimal">{children}</ol>,
          li: ({ children }) => <li className="my-0.5">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-cyan underline decoration-accent-cyan/50 hover:decoration-accent-cyan transition-colors"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-3 my-1 text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            return isInline ? (
              <code className="text-[12px] bg-subtle px-1 py-0.5 rounded font-mono">
                {children}
              </code>
            ) : (
              <code className="block text-[12px] bg-subtle border border-border rounded-lg p-3 font-mono whitespace-pre-wrap my-1">
                {children}
              </code>
            );
          },
          hr: () => <hr className="border-border my-2" />,
        }}
      >
        {children}
      </MarkdownBase>
    </div>
  );
}
