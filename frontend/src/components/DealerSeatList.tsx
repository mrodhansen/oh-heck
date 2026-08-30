import { useState, type HTMLAttributes } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '../cn';

type Props = {
  names: string[];
  dealerIndex: number;
  onDealer: (index: number) => void;
  onReorder: (from: number, to: number) => void;
};

export function DealerSeatList({
  names,
  dealerIndex,
  onDealer,
  onReorder,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const activeName = activeId;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over?.id;
    const fromId = String(event.active.id);
    setActiveId(null);
    if (overId == null) return;
    const from = names.indexOf(fromId);
    const to = names.indexOf(String(overId));
    if (from < 0 || to < 0 || from === to) return;
    onReorder(from, to);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={names} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="First dealer">
          {names.map((name, i) => (
            <SortableSeat
              key={name}
              name={name}
              selected={dealerIndex === i}
              dragging={activeId === name}
              onSelect={() => onDealer(i)}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeName ? (
          <SeatCard name={activeName} selected={names[dealerIndex] === activeName} lifted />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableSeat({
  name,
  selected,
  dragging,
  onSelect,
}: {
  name: string;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: name });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {isDragging || dragging ? (
        <div
          className="min-h-stepper rounded-btn border border-dashed border-line-strong bg-sand-100"
          aria-hidden
        />
      ) : (
        <SeatCard
          name={name}
          selected={selected}
          onSelect={onSelect}
          handleProps={{ ...attributes, ...listeners }}
        />
      )}
    </div>
  );
}

function SeatCard({
  name,
  selected,
  lifted,
  onSelect,
  handleProps,
}: {
  name: string;
  selected: boolean;
  lifted?: boolean;
  onSelect?: () => void;
  handleProps?: HTMLAttributes<HTMLButtonElement>;
}) {
  return (
    <div
      className={cn(
        'flex w-full min-h-stepper cursor-grab flex-wrap items-center gap-2 rounded-btn border border-line bg-surface px-2 py-3 pl-3.5 text-left text-grey-900 touch-none',
        selected && 'border-grey-700 bg-sand-100 shadow-inset-sel',
        lifted && 'cursor-grabbing shadow-float',
        !lifted && 'active:bg-sand-100',
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left text-inherit"
        onClick={onSelect}
      >
        <span
          className={cn(
            'inline-flex size-5.5 shrink-0 items-center justify-center rounded-full border-2 border-line-strong bg-surface',
            selected && 'border-grey-800',
          )}
          aria-hidden
        >
          {selected ? <span className="size-2.5 rounded-full bg-grey-800" /> : null}
        </span>
        <span className={cn('min-w-0 flex-1 truncate text-md font-semibold', selected && 'font-bold')}>
          {name}
        </span>
      </button>
      <button
        type="button"
        className="flex size-10 shrink-0 cursor-grab flex-col items-center justify-center gap-0.5 border-0 bg-transparent p-0 touch-none active:cursor-grabbing"
        aria-label={`Reorder ${name}`}
        {...handleProps}
      >
        <span className="block h-0.5 w-4 rounded-sm bg-grey-600" />
        <span className="block h-0.5 w-4 rounded-sm bg-grey-600" />
        <span className="block h-0.5 w-4 rounded-sm bg-grey-600" />
      </button>
    </div>
  );
}
