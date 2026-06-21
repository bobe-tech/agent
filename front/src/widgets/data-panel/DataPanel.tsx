import { useState } from 'react';
import { Card, Tabs, Select, ListBox, ScrollShadow } from '@heroui/react';
import { PositionsTable, type PositionStatusFilter } from '@/widgets/positions-table';
import { TicksTable } from '@/widgets/ticks-panel';
import { OrdersTable, type OrderActionFilter } from '@/widgets/orders-table';
import { ReflectionsList } from '@/widgets/reflections-list';
import { StrategyDescription } from '@/widgets/strategy-description';

const TICK_ACTIONS = [
  { value: 'all', label: 'All actions' },
  { value: 'HOLD', label: 'Hold' },
  { value: 'OPEN_LONG', label: 'Open long' },
  { value: 'OPEN_SHORT', label: 'Open short' },
  { value: 'ADD', label: 'Averaging' },
  { value: 'CLOSE', label: 'Close' },
];

const POS_STATUS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const ORDER_ACTIONS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Entry' },
  { value: 'add', label: 'Averaging' },
  { value: 'close', label: 'Close' },
];

export function DataPanel({ pair }: { pair: string | null }) {
  const [tab, setTab] = useState('positions');
  const [posStatus, setPosStatus] = useState<PositionStatusFilter>('all');
  const [tickAction, setTickAction] = useState('all');
  const [orderAction, setOrderAction] = useState<OrderActionFilter>('all');

  return (
    <Card>
      <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as string)}>
        <Card.Header>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ScrollShadow orientation="horizontal" hideScrollBar className="w-fit max-w-full">
              <Tabs.ListContainer className="w-fit">
                <Tabs.List aria-label="Data">
                  <Tabs.Tab id="positions" className="whitespace-nowrap">
                    Positions
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="orders" className="whitespace-nowrap">
                    Orders
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="ticks" className="whitespace-nowrap">
                    Activity
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="reflections" className="whitespace-nowrap">
                    Insights
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="strategy" className="whitespace-nowrap">
                    Strategy
                    <Tabs.Indicator />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>
            </ScrollShadow>
            {tab === 'positions' && (
              <FilterSelect value={posStatus} onChange={(v) => setPosStatus(v as PositionStatusFilter)} options={POS_STATUS} />
            )}
            {tab === 'orders' && (
              <FilterSelect value={orderAction} onChange={(v) => setOrderAction(v as OrderActionFilter)} options={ORDER_ACTIONS} />
            )}
            {tab === 'ticks' && <FilterSelect value={tickAction} onChange={setTickAction} options={TICK_ACTIONS} />}
          </div>
        </Card.Header>
        <Card.Content className="min-h-[320px]">
          {/* px-0: remove the side padding of Tabs.Panel, otherwise it adds up with the padding of Card.Content
              and the tab content (table/lists) ends up narrower than the tabs and Select in the header */}
          <Tabs.Panel id="positions" className="px-0">
            <PositionsTable pair={pair} status={posStatus} />
          </Tabs.Panel>
          <Tabs.Panel id="orders" className="px-0">
            <OrdersTable pair={pair} action={orderAction} />
          </Tabs.Panel>
          <Tabs.Panel id="ticks" className="px-0">
            <TicksTable pair={pair} action={tickAction} />
          </Tabs.Panel>
          <Tabs.Panel id="reflections" className="px-0">
            <ReflectionsList pair={pair} />
          </Tabs.Panel>
          <Tabs.Panel id="strategy" className="px-0">
            <StrategyDescription />
          </Tabs.Panel>
        </Card.Content>
      </Tabs>
    </Card>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onChange={(v) => v && onChange(v as string)} variant="secondary" aria-label="Filter">
      <Select.Trigger className="w-full sm:w-44">
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((o) => (
            <ListBox.Item key={o.value} id={o.value} textValue={o.label}>
              {o.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
