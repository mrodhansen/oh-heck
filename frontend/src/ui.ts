import { cn } from './cn';

export { cn };

export type BtnKind = 'default' | 'primary' | 'ghost' | 'dark' | 'danger';
export type BtnSize = 'md' | 'sm';

const btnBase =
  'inline-flex items-center justify-center min-h-tap px-3.5 rounded-btn border cursor-pointer font-medium text-btn shrink-0 active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-y-0';

const btnKind: Record<BtnKind, string> = {
  default: 'border-line-strong bg-surface text-grey-800',
  primary: 'border-accent bg-accent text-sand-50 hover:bg-accent-hover',
  ghost: 'border-transparent bg-transparent text-grey-600',
  dark: 'border-grey-800 bg-grey-800 text-sand-50',
  danger: 'border-danger bg-danger text-sand-50',
};

export function btnClass(opts?: {
  kind?: BtnKind;
  size?: BtnSize;
  block?: boolean;
  icon?: boolean;
  className?: string;
}): string {
  return cn(
    btnBase,
    btnKind[opts?.kind ?? 'default'],
    opts?.size === 'sm' && 'min-h-9 px-3 text-btn-sm',
    opts?.block && 'w-full shrink-0 max-h-12 h-12',
    opts?.icon && 'min-w-tap px-0 text-xl leading-none font-normal',
    opts?.className,
  );
}

export const pageFit =
  'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden gap-2.5 phone-land:gap-1.5';
export const pageFitHeader = 'min-w-0 shrink-0';
export const pageFitBody =
  'flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain';
export const pageHeader = 'flex min-w-0 items-start justify-between gap-3';
export const pageTitle =
  'm-0 font-display text-page font-semibold tracking-tight text-grey-900 phone-land:text-lg';
export const sectionTitle =
  'm-0 mb-2.5 border-b border-line pb-2 font-display text-section font-semibold tracking-tight text-grey-900';
export const sectionTitlePlain = 'mb-0.5 border-0 pb-0';
export const lede = 'mt-1.5 mb-0 text-lede leading-snug text-muted';
export const muted = 'text-muted';
export const hint = 'text-hint leading-snug text-muted';
export const stack = 'flex flex-col gap-3 phone-land:gap-2';
export const stackSm = 'flex flex-col gap-2.5';
export const row = 'flex min-w-0 items-center gap-2.5';
export const grid2 = 'grid min-w-0 grid-cols-2 gap-2.5';
export const fillCenter = 'flex flex-1 items-center justify-center';
export const card = 'min-w-0 rounded-card border border-line bg-surface p-3.5';
export const empty = 'px-3.5 py-7 text-center text-btn text-muted';
export const actionBar =
  'mt-auto flex min-w-0 shrink-0 items-center gap-2 pt-2.5';
export const actionStack = 'mt-auto flex min-w-0 shrink-0 flex-col gap-2';
export const field =
  'flex min-w-0 flex-col gap-1 text-label font-medium text-grey-600';
export const inputClass =
  'h-tap w-full max-w-full rounded-btn border border-line-strong bg-surface px-3 text-ink focus:border-grey-600 focus:outline-none focus:shadow-focus';
export const textLink =
  'm-0 inline cursor-pointer border-0 bg-transparent p-0 font-semibold text-grey-800 underline underline-offset-2';

export const list =
  'flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface';
export const listItem =
  'flex min-w-0 items-start justify-between gap-3 border-b border-line px-3.5 py-3 last:border-b-0 active:bg-sand-100';
export const listItemTitle =
  'm-0 mb-0.5 text-btn font-semibold text-grey-900';
export const listItemMeta = 'm-0 text-meta leading-snug text-muted';
export const listItemStatus = 'mt-1 mb-0 text-label text-grey-600';
export const listItemChevron = 'shrink-0 text-xl leading-snug text-sand-300';

const bannerBase =
  'min-w-0 rounded-btn border px-3 py-2.5 text-lede';
export const banner =
  `${bannerBase} border-banner-border bg-banner text-banner-fg`;
export const bannerInfo =
  `${bannerBase} border-line bg-sand-100 text-grey-700`;
export const bannerOk =
  `${bannerBase} border-banner-ok-border bg-banner-ok text-banner-ok-fg`;
export const bannerWarn =
  `${bannerBase} border-banner-warn-border bg-banner-warn text-warn`;

export const modeCard =
  'flex h-auto min-h-mode w-full max-h-none flex-col items-start gap-1 rounded-btn border border-line-strong bg-surface px-4 py-4 text-left text-grey-900 phone-land:min-h-14 phone-land:px-3.5 phone-land:py-2.5';
export const modeCardTitle =
  'font-display text-mode font-semibold text-grey-900 phone-land:text-md';
export const modeCardMeta = 'text-meta font-normal text-muted';

export const iconBtn =
  'inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-btn border border-line bg-surface text-lg leading-none text-grey-800';
export const iconBtnSpacer =
  'invisible pointer-events-none h-10 w-10 shrink-0';

export const gameScreen =
  'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden gap-2';
export const gameTopbar =
  'mb-2 grid min-w-0 shrink-0 grid-cols-game-topbar items-center gap-2 phone-land:mb-0.5 phone-land:gap-2.5';
export const gameTabs =
  'flex min-w-0 justify-center border-b border-line';
export const gameTab =
  'relative -mb-px min-h-10 flex-1 cursor-pointer border-0 border-b-2 bg-transparent text-lede phone-land:min-h-8 phone-land:text-meta';

export function gameTabClass(active: boolean): string {
  return cn(
    gameTab,
    active
      ? 'border-grey-800 font-650 text-grey-900'
      : 'border-transparent font-medium text-muted',
  );
}

export const phaseHeader =
  'mt-2 min-w-0 shrink-0 px-2 pb-3 pt-5 text-center short:pb-1.5 phone-land:mt-0 phone-land:px-1 phone-land:py-0.5';
export const phaseTitle =
  'm-0 font-display text-phase font-650 tracking-tight text-grey-900 short:text-phase-sm phone-land:text-lg';
export const phaseSub =
  'mt-2 mb-0 text-md font-semibold tabular-nums text-grey-700 phone-land:mt-0.5 phone-land:text-label';
export const phaseDot = 'mx-1 font-medium text-sand-300';
export const phaseDealer = 'mt-1.5 mb-0 text-btn font-semibold text-grey-800';
export const phaseTotal =
  'mt-1.5 mb-4 text-lede tabular-nums text-grey-700 phone-land:my-0.5 phone-land:text-kicker';

export const playLayout =
  'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden gap-2';
export const playMiddle =
  'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden';
export const panelScroll =
  'min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain';
export const turnList =
  'flex min-h-0 min-w-0 flex-1 flex-col gap-1.5 overflow-x-hidden overflow-y-auto overscroll-contain pb-0.5';

export function turnCardClass(opts: {
  expanded: boolean;
  done?: boolean;
  pending?: boolean;
  dealer?: boolean;
}): string {
  return cn(
    'min-w-0 shrink-0 rounded-card border duration-150',
    !opts.expanded && opts.done
      ? 'border-line bg-sand-100'
      : opts.expanded && opts.dealer
        ? 'border-grey-600 bg-surface shadow-turn'
        : opts.expanded
          ? 'border-line-strong bg-surface shadow-turn'
          : 'border-line bg-surface',
    !opts.expanded && opts.pending && 'opacity-70',
  );
}

export const turnCardHead =
  'flex min-w-0 w-full cursor-pointer items-center justify-between gap-2.5 border-0 bg-transparent px-3 py-2.5 text-left text-inherit short:px-2.5 short:py-2 phone-land:px-2 phone-land:py-1.5';
export const turnCardBody =
  'flex min-w-0 flex-col gap-2.5 border-t border-line px-3 pb-3 pt-1 short:gap-2 short:px-2.5 short:pb-2.5 phone-land:gap-1.5 phone-land:px-2 phone-land:pb-2';

export const modalBackdrop =
  'fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-0 modal:items-center modal:p-4';
export const modal =
  'max-h-modal w-full max-w-phone overflow-auto overflow-x-hidden rounded-t-2xl border-t border-line bg-sand-50 px-4 pb-modal pt-3.5 modal:rounded-xl modal:border desktop:max-w-tablet';

export const stepper = 'grid w-full grid-cols-stepper items-center gap-2.5';
export const stepperBtn =
  'min-h-stepper min-w-stepper cursor-pointer rounded-btn border border-line-strong bg-surface-2 text-xl text-grey-800 disabled:opacity-35 short:min-h-11 short:min-w-11 phone-land:min-h-10 phone-land:min-w-10';
export const stepperValue =
  'min-w-0 text-center font-display text-stepper font-650 leading-none tabular-nums text-grey-900 short:text-stepper-sm phone-land:text-xl';

export const place =
  'inline-flex h-badge w-badge shrink-0 items-center justify-center rounded-md text-kicker font-bold tabular-nums';

export function placeTone(n: number): string {
  if (n === 1) return 'bg-place-gold text-place-gold-fg';
  if (n === 2) return 'bg-place-silver text-place-silver-fg';
  if (n === 3) return 'bg-place-bronze text-place-bronze-fg';
  return 'bg-sand-200 text-grey-800';
}

export const score = 'text-md font-650 tabular-nums';
export const scorePos = 'text-ok';
export const scoreNeg = 'text-danger';

export const statsGrid = 'grid grid-cols-2 gap-2';
export const statTile = 'min-w-0 rounded-btn border border-line bg-surface p-2.5';
