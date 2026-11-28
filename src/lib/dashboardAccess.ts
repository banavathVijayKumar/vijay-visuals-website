// ============================================================================
// Pure, client-side role gating for dashboard workspaces.
// Hiding a tab is only a UX guard — server handlers remain the authority.
// ============================================================================

export type DashboardRoleTab = 'owner' | 'delivery' | 'customer' | 'super_admin';

/**
 * @param role Role emitted by useAuth.mapSupabaseRoleToPlatformRole.
 * @param ownedTenantCount Number of server-verified owned websites.
 * @param deliveryEligible Server-computed from an active tenant_memberships row
 *   with role='delivery_partner'. The client never infers this from role alone.
 */
export function getAllowedDashboardTabs(
  role: string | null | undefined,
  ownedTenantCount: number,
  deliveryEligible: boolean = false
): DashboardRoleTab[] {
  const normalized = String(role || 'customer').trim().toLowerCase();
  const tabs: DashboardRoleTab[] = ['customer'];

  // A user who owns at least one published website can open the owner
  // workspace even when their global profile role is still "customer".
  const canOwn = normalized === 'business_owner' || normalized === 'super_admin' || ownedTenantCount > 0;
  const canDeliver = deliveryEligible || normalized === 'super_admin';

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

/**
 * Platform Owner is a distinct, server-verified role. It is intentionally not
 * a DashboardRoleTab: the legacy 'owner' tab is a tenant workspace.
 */
export function canAccessBusinessOwnerDashboard(isPlatformOwner: boolean = false): boolean {
  return isPlatformOwner === true;
}
