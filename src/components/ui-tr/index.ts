// src/components/ui-tr/index.ts
//
// Re-exports for the new design-system primitives. The shadcn/ui
// primitives in `src/components/ui/*` are unchanged — these are a
// parallel set so the new design-system components can use them
// without colliding with the legacy shadcn versions.

export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "./Button";
export { IconButton, type IconButtonProps } from "./IconButton";
export { Field, Input, Textarea, Select, FieldLabel } from "./Field";
export { Segmented, type SegmentedProps, type SegmentedOption } from "./Segmented";
export { Tabs, type TabsProps, type TabItem } from "./Tabs";
export { Tooltip, type TooltipProps } from "./Tooltip";
export { Popover, type PopoverProps } from "./Popover";
export { Dialog, DialogActions, type DialogProps } from "./Dialog";
export {
  toast,
  ToastRegion,
  ToastHost,
  ToastInline,
  type ToastKind,
  type ToastItem,
} from "./Toast";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { Skeleton, SkeletonRow, type SkeletonProps, type SkeletonRowProps } from "./Skeleton";
export { Table, THead, TBody, TR, TH, TD, RowLabel, type TRProps } from "./Table";
export { Panel, type PanelProps } from "./Panel";
