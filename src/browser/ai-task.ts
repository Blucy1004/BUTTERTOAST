import { session, WebContentsView } from 'electron';
import { randomUUID } from 'node:crypto';
import { WEB_PREFERENCES, hardenSession, hardenWebContents } from '../security/electron';
import { installPrivacy } from './privacy';
import { ToastController } from '../toastir/controller';
/** Each task gets an ephemeral storage partition. Never accept a model-supplied partition. */
export function createAiTask() {
  const taskSession = session.fromPartition(`toast-task-${randomUUID()}`);
  hardenSession(taskSession); installPrivacy(taskSession);
  const view = new WebContentsView({ webPreferences: { ...WEB_PREFERENCES, session: taskSession } });
  hardenWebContents(view.webContents);
  const controller = new ToastController(view.webContents);
  return {
    view, controller,
    async close() {
      controller.dispose();
      if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
      await taskSession.clearStorageData(); await taskSession.clearCache();
    }
  };
}
