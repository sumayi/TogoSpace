import type { EntityI18n } from './types';
import i18n, { t } from './i18n';

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'waiting_reconnect'
  | 'reconnecting'
  | 'disconnected';
export type BubbleSide = 'left' | 'right' | 'center';

export function i18nText(i18nData: EntityI18n, field: string, fallback: string): string {
  const locale = i18n.global.locale.value;
  const textMap = i18nData[field];
  return textMap?.[locale]?.trim()
    || textMap?.['zh-CN']?.trim()
    || fallback;
}

export function displayName(entity: { name: string; i18n: EntityI18n }): string {
  return i18nText(entity.i18n, 'display_name', entity.name);
}

export function formatPreview(senderDisplayName: string, content: string): string {
  return `${senderDisplayName}: ${content.replace(/\n/g, ' ')}`;
}

export function formatTime(time: string): string {
  const date = new Date(time);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function bubbleSide(senderId: number): BubbleSide {
  if (senderId === -2) {
    return 'center';
  }
  if (senderId === -1) {
    return 'right';
  }
  return 'left';
}

export function formatConnectionState(state: ConnectionState): string {
  if (state === 'connected') {
    return t('connection.connected');
  }
  if (state === 'waiting_reconnect') {
    return t('connection.waitReconnect');
  }
  if (state === 'reconnecting') {
    return t('connection.reconnecting');
  }
  if (state === 'disconnected') {
    return t('connection.disconnected');
  }
  return t('connection.connecting');
}
