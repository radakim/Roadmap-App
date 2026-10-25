import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import { installWebAlert } from './webAlert';
import App from './App';

if (Platform.OS === 'web') {
  installWebAlert();
  // App.js switches to the desktop layout (sidebar + columns) on wide windows
  const style = document.createElement('style');
  style.textContent =
    'html,body{background:#0a0f1d;height:100%;margin:0}' +
    '*{scrollbar-width:thin;scrollbar-color:#334155 transparent}' +
    '::-webkit-scrollbar{width:8px;height:8px}' +
    '::-webkit-scrollbar-thumb{background:#334155;border-radius:4px}' +
    'input,textarea{outline:none}';
  document.head.appendChild(style);
}

registerRootComponent(App);
