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
        <div className="dealer-pick" role="radiogroup" aria-label="First dealer">
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
        <div className="dealer-option-hole" aria-hidden />
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
      className={[
        'dealer-option',
        selected ? 'selected' : '',
        lifted ? 'dealer-option-float-static' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        className="dealer-select"
        onClick={onSelect}
      >
        <span className="dealer-radio" aria-hidden>
          {selected ? <span className="dealer-radio-dot" /> : null}
        </span>
        <span className="dealer-name truncate">{name}</span>
      </button>
      <button
        type="button"
        className="dealer-grip"
        aria-label={`Reorder ${name}`}
        {...handleProps}
      >
        <span />
        <span />
        <span />
      </button>
    </div>
  );
}
