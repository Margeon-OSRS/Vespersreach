import './ui/styles.css';
import { App } from './ui/app';
import { loadFromSlot } from './ui/storage';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root');
const app = new App(root);
app.start(loadFromSlot('autosave'));
