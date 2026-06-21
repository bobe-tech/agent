import { useState } from 'react';
import { Card, Tabs, ScrollShadow, Skeleton, Typography } from '@heroui/react';
import { useDoc, type DocName } from '@/entities/doc';
import { Markdown } from '@/shared/ui/markdown';
import { LoadError } from '@/shared/ui/load-error';

const PROMPT_TABS: { id: DocName; label: string }[] = [
  { id: 'strategy', label: 'Strategy' },
  { id: 'reflection', label: 'Reflection' },
];

function PromptContent({ name }: { name: DocName }) {
  const { data, isLoading, isError } = useDoc(name);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-1/3 rounded-lg" />
        <Skeleton className="h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-11/12 rounded-lg" />
        <Skeleton className="h-4 w-4/5 rounded-lg" />
        <Skeleton className="mt-4 h-4 w-full rounded-lg" />
        <Skeleton className="h-4 w-3/4 rounded-lg" />
      </div>
    );
  }
  if (isError || !data) return <LoadError message="Failed to load document" />;

  return <Markdown>{data.content}</Markdown>;
}

export function PromptsPage() {
  const [tab, setTab] = useState<DocName>('strategy');

  return (
    <div className="space-y-6" data-testid="prompts-root">
      <div className="flex flex-col gap-1">
        {/* h1 semantics with the h3 visual scale — HeroUI typography classes on a native heading
            (Typography's render prop can't change the element, only decorate the same tag). */}
        <h1 className="typography typography--h3">Agent prompts</h1>
        <Typography.Paragraph color="muted" size="sm">
          The live strategy and reflection prompts that drive the BoBe trading agent.
        </Typography.Paragraph>
      </div>

      <Card>
        <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as DocName)}>
          <Card.Header>
            <ScrollShadow orientation="horizontal" hideScrollBar className="w-fit max-w-full">
              <Tabs.ListContainer className="w-fit">
                <Tabs.List aria-label="Prompts">
                  {PROMPT_TABS.map((t) => (
                    <Tabs.Tab key={t.id} id={t.id} className="whitespace-nowrap">
                      {t.label}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
            </ScrollShadow>
          </Card.Header>
          <Card.Content className="min-h-[320px]">
            {PROMPT_TABS.map((t) => (
              // React Aria mounts only the active panel, so each prompt is fetched on first open, not upfront.
              <Tabs.Panel key={t.id} id={t.id}>
                <PromptContent name={t.id} />
              </Tabs.Panel>
            ))}
          </Card.Content>
        </Tabs>
      </Card>
    </div>
  );
}
