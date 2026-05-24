import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SettingsNavItemId } from './sections';

export interface SettingsNavItem {
  id: SettingsNavItemId;
  label: string;
  note: string;
}

export function useSettingsNavItems() {
  const { t } = useI18n();

  return computed<SettingsNavItem[]>(() => [
    { id: 'teams', label: t('settings.nav.teams'), note: t('settings.nav.teamsNote') },
    { id: 'roles', label: t('settings.nav.roles'), note: t('settings.nav.rolesNote') },
    { id: 'models', label: t('settings.nav.models'), note: t('settings.nav.modelsNote') },
    { id: 'quickInit', label: t('settings.nav.quickInit'), note: t('settings.nav.quickInitNote') },
  ]);
}
