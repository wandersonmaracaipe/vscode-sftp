import { window, ProgressLocation } from 'vscode';
import { COMMAND_TEST_CONNECTION } from '../constants';
import { checkCommand } from './abstract/createCommand';
import { getAllFileService } from '../modules/serviceManager';
import { simplifyPath } from '../helper';

interface TestResult {
  ok: boolean;
  label: string;
  target: string;
  message?: string;
}

export default checkCommand({
  id: COMMAND_TEST_CONNECTION,

  async handleCommand() {
    const services = getAllFileService();
    if (services.length === 0) {
      window.showInformationMessage(
        'SFTP: Nenhuma configuração encontrada. Rode "SFTP: Config" primeiro.'
      );
      return;
    }

    const results = await window.withProgress<TestResult[]>(
      { location: ProgressLocation.Notification, title: 'SFTP: Testando conexão…' },
      () =>
        Promise.all(
          services.map(async (service): Promise<TestResult> => {
            const config = service.getConfig();
            const label = service.name || simplifyPath(service.baseDir);
            const target = `${config.username}@${config.host}:${config.port}`;
            try {
              // Connect and do a lightweight round-trip to prove the path works.
              const remoteFs = await service.getRemoteFileSystem(config);
              await remoteFs.list(config.remotePath);
              return { ok: true, label, target };
            } catch (error) {
              const message =
                error && (error as Error).message ? (error as Error).message : String(error);
              return { ok: false, label, target, message };
            }
          })
        )
    );

    const failures = results.filter(r => !r.ok);
    if (failures.length === 0) {
      const names = results.map(r => r.label).join(', ');
      window.showInformationMessage(
        `SFTP: conexão OK em ${results.length} configuração(ões) (${names}). ✅`
      );
    } else {
      const detail = failures.map(f => `• ${f.label} (${f.target}): ${f.message}`).join('\n');
      window.showErrorMessage(
        `SFTP: falha em ${failures.length}/${results.length} configuração(ões).`,
        { modal: true, detail }
      );
    }
  },
});
