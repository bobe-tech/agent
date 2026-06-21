import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Typography } from '@heroui/react';
import { cn } from '@/shared/lib/utils';

// Read-only markdown renderer. HeroUI's Typography.Prose styles the raw HTML that react-markdown emits
// (headings, paragraphs, code, lists, blockquotes, …), so no per-element styling is needed here. The
// flex/gap container provides the vertical rhythm between blocks (the pattern from the HeroUI docs).
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <Typography.Prose className={cn('flex flex-col gap-4', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </Typography.Prose>
  );
}
