import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getAgentDetail } from '../api';

export type MemberEditorMode = 'view' | 'edit';

export type MemberTemplateOption = {
  id: number;
  name: string;
  displayName: string;
  model: string;
  soul: string;
};

export type MemberDriverOption = {
  value: string;
  label: string;
};

export type MemberModelOption = {
  value: string;
  label: string;
};

type UseMemberEditorDialogOptions = {
  templateOptions: ComputedRef<MemberTemplateOption[]>;
  driverCatalog: Ref<MemberDriverOption[]>;
  modelCatalog: Ref<MemberModelOption[]>;
  resolveId: (memberName: string) => number | null;
  resolveName: (memberName: string) => string;
  resolveModel: (memberName: string) => string;
  resolveDriver: (memberName: string) => string;
  resolveTemplateId: (memberName: string) => number | null;
  canLoadMemberDetail?: (memberName: string) => boolean;
};

export function useMemberEditorDialog(options: UseMemberEditorDialogOptions) {
  const { t } = useI18n();
  const memberEditorOpen = ref(false);
  const editingMemberName = ref('');
  const memberEditorName = ref('');
  const memberEditorKeyword = ref('');
  const memberEditorTemplateId = ref<number | null>(null);
  const memberEditorModel = ref('');
  const memberEditorDriver = ref('');
  const memberEditorMode = ref<MemberEditorMode>('view');
  const memberDriverCache = new Map<number, string>();
  let memberEditorRequestId = 0;

  const memberEditorEditable = computed(() => memberEditorMode.value === 'edit');
  const currentMemberTemplateOption = computed(
    () => options.templateOptions.value.find((item) => item.id === memberEditorTemplateId.value) ?? null,
  );
  const memberModelOptions = computed(() => {
    const optionsMap = new Map<string, string>();

    options.modelCatalog.value.forEach((model) => {
      optionsMap.set(model.value, model.label);
    });

    if (memberEditorModel.value && !optionsMap.has(memberEditorModel.value)) {
      optionsMap.set(memberEditorModel.value, memberEditorModel.value);
    }

    return Array.from(optionsMap.entries()).map(([value, label]) => ({ value, label }));
  });
  const filteredMemberTemplateOptions = computed(() => {
    const keyword = memberEditorKeyword.value.trim().toLowerCase();
    if (!keyword) {
      return options.templateOptions.value;
    }

    return options.templateOptions.value.filter((item) => (
      `${item.displayName} ${item.name}`.toLowerCase().includes(keyword)
    ));
  });
  const memberDriverOptions = computed(() => {
    const optionsMap = new Map<string, string>();

    options.driverCatalog.value.forEach((driver) => {
      optionsMap.set(driver.value, driver.label);
    });

    if (memberEditorDriver.value && !optionsMap.has(memberEditorDriver.value)) {
      optionsMap.set(memberEditorDriver.value, memberEditorDriver.value);
    }

    return Array.from(optionsMap.entries()).map(([value, label]) => ({ value, label }));
  });

  function resetDialogState(): void {
    memberEditorRequestId += 1;
    memberEditorOpen.value = false;
    editingMemberName.value = '';
    memberEditorName.value = '';
    memberEditorKeyword.value = '';
    memberEditorTemplateId.value = null;
    memberEditorModel.value = '';
    memberEditorDriver.value = '';
    memberEditorMode.value = 'view';
  }

  async function loadMemberDriver(agentName: string): Promise<void> {
    const requestId = ++memberEditorRequestId;
    const agentId = options.resolveId(agentName);

    if ((options.canLoadMemberDetail && !options.canLoadMemberDetail(agentName)) || agentId === null) {
      return;
    }

    if (memberDriverCache.has(agentId)) {
      memberEditorDriver.value = memberDriverCache.get(agentId) || '';
      return;
    }

    try {
      const detail = await getAgentDetail(agentId);
      if (requestId !== memberEditorRequestId || editingMemberName.value !== agentName) {
        return;
      }

      const nextDriver = detail.driver_type || '';
      memberDriverCache.set(agentId, nextDriver);
      memberEditorDriver.value = nextDriver;
    } catch (error) {
      console.error(error);
      if (requestId !== memberEditorRequestId || editingMemberName.value !== agentName) {
        return;
      }

      memberEditorDriver.value = '';
    }
  }

  function openMemberEditor(agentName: string): void {
    memberEditorOpen.value = true;
    memberEditorMode.value = 'edit';
    editingMemberName.value = agentName;
    memberEditorName.value = options.resolveName(agentName);
    memberEditorKeyword.value = '';
    memberEditorTemplateId.value = options.resolveTemplateId(agentName);
    memberEditorModel.value = options.resolveModel(agentName);
    memberEditorDriver.value = options.resolveDriver(agentName);
    void loadMemberDriver(agentName);
  }

  function openMemberViewer(agentName: string): void {
    memberEditorOpen.value = true;
    memberEditorMode.value = 'view';
    editingMemberName.value = agentName;
    memberEditorName.value = options.resolveName(agentName);
    memberEditorKeyword.value = '';
    memberEditorTemplateId.value = options.resolveTemplateId(agentName);
    memberEditorModel.value = options.resolveModel(agentName);
    memberEditorDriver.value = options.resolveDriver(agentName);
    void loadMemberDriver(agentName);
  }

  function openPendingMemberEditor(displayName?: string): void {
    const name = displayName ?? t('member.newMember');
    memberEditorOpen.value = true;
    memberEditorMode.value = 'edit';
    editingMemberName.value = name;
    memberEditorName.value = name;
    memberEditorKeyword.value = '';
    memberEditorTemplateId.value = null;
    memberEditorModel.value = '';
    memberEditorDriver.value = '';
  }

  function closeMemberEditor(): void {
    resetDialogState();
  }

  function replaceSelectedTemplate(templateId: number | null): void {
    memberEditorTemplateId.value = templateId;
  }

  return {
    editingMemberName,
    memberEditorName,
    memberEditorKeyword,
    memberEditorTemplateId,
    memberEditorModel,
    memberEditorDriver,
    memberEditorMode,
    memberEditorOpen,
    memberEditorEditable,
    currentMemberTemplateOption,
    memberModelOptions,
    filteredMemberTemplateOptions,
    memberDriverOptions,
    openMemberEditor,
    openMemberViewer,
    openPendingMemberEditor,
    closeMemberEditor,
    resetDialogState,
    replaceSelectedTemplate,
  };
}
