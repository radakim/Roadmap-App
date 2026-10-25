// ============================================================
// webAlert.js - Alert.alert polyfill for react-native-web
// react-native-web ships Alert.alert as a no-op, so confirm
// dialogs (delete, reset, restore...) would silently do nothing.
// Maps them onto window.alert / window.confirm.
// ============================================================

import { Alert, Platform } from 'react-native';

export function installWebAlert() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  Alert.alert = (title, message, buttons) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const list = Array.isArray(buttons) ? buttons : [];

    if (list.length <= 1) {
      window.alert(text);
      if (list[0] && list[0].onPress) list[0].onPress();
      return;
    }

    // OK = the last non-cancel button (destructive / confirm action), Cancel = the cancel button
    const cancel = list.find((b) => b.style === 'cancel');
    const confirm = [...list].reverse().find((b) => b.style !== 'cancel') || list[list.length - 1];
    const hint = confirm.text ? `\n\n[OK = ${confirm.text}]` : '';

    if (window.confirm(text + hint)) {
      if (confirm.onPress) confirm.onPress();
    } else if (cancel && cancel.onPress) {
      cancel.onPress();
    }
  };
}
