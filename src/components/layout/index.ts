// src/components/layout/index.ts
//
// Re-exports for the layout module. The (app) layout wraps children
// in <AppShell>; the workbench routes add <PageHeader> at the top of
// their .tr-page.

export { AppShell, type AppShellProps } from "./AppShell";
export { TopBar, type TopBarProps } from "./TopBar";
export { Wordmark, type WordmarkProps } from "./Wordmark";
export { ThemeToggle } from "./ThemeToggle";
export { EventSwitcher, type EventSwitcherProps } from "./EventSwitcher";
export { UserMenu, type UserMenuProps } from "./UserMenu";
export { DemoBanner } from "./DemoBanner";
export { PageHeader, type PageHeaderProps } from "./PageHeader";
export { FilterRail, useFilterParam, type FilterRailProps } from "./FilterRail";
