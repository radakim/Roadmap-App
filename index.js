import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import { installWebAlert } from './webAlert';
import App from './App';

if (Platform.OS === 'web') {
  installWebAlert();
  // The UI is designed for a phone: keep it a centered column on wide laptop screens
  const style = document.createElement('style');
  style.textContent =
    'html,body{background:#070b14;height:100%;margin:0}' +
    '#root{max-width:760px;margin:0 auto;height:100%;box-shadow:0 0 40px rgba(0,0,0,.5)}';
  document.head.appendChild(style);
}

registerRootComponent(App);
