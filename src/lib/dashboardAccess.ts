// ============================================================================
// Pure, client-side role gating for dashboard workspaces.
// Hiding a tab is only a UX guard — server handlers remain the authority.
// ============================================================================

export type DashboardRoleTab = 'owner' | 'delivery' | 'customer' | 'super_admin';

/** Roles emitted by useAuth.mapSupabaseRoleToPlatformRole. */
export function getAllowedDashboardTabs(
  role: string | null | undefined,
  ownedTenantCount: number
): DashboardRoleTab[] {
  const normalized = String(role || 'customer').trim().toLowerCase();
  const tabs: DashboardRoleTab[] = ['customer'];

  // A user who owns at least one published website can open the owner
  // workspace even when their global profile role is still "customer".
  const canOwn = normalized === 'business_owner' || normalized === 'super_admin' || ownedTenantCount > 0;
  const canDeliver = normalized === 'delivery_partner' || normalized === 'super_admin';

  if (canOwn) tabs.push('owner');
  if (canDeliver) tabs.push('delivery');
  if (normalized === 'super_admin') tabs.push('super_admin');
  return tabs;
}

export function canViewDashboardTab(
  tabs: readonly DashboardRoleTab[],
  tab: DashboardRoleTab
): boolean {
  return tabs.includes(tab);
}
