import { Uri } from 'vscode';
import app from '../app';
import { UResource, FileService, ServiceConfig } from '../core';
import { isTransientError } from '../core/transientError';
import logger from '../logger';
import { getFileService } from '../modules/serviceManager';

const MAX_ATTEMPTS = 3; // 1 initial attempt + 2 retries
const RETRY_BASE_DELAY_MS = 700;

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

interface FileHandlerConfig {
  _?: boolean;
}

export interface FileHandlerContext {
  target: UResource;
  fileService: FileService;
  config: ServiceConfig;
}

type FileHandlerContextMethod<R = void> = (this: FileHandlerContext) => R;
type FileHandlerContextMethodArg1<A, R = void> = (this: FileHandlerContext, a: A) => R;

interface FileHandlerOption<T> {
  name: string;
  handle: FileHandlerContextMethodArg1<T, Promise<any>>;
  afterHandle?: FileHandlerContextMethod;
  config?: FileHandlerConfig;
  transformOption?: FileHandlerContextMethod<T>;
}

export function handleCtxFromUri(uri: Uri): FileHandlerContext {
  const fileService = getFileService(uri);
  if (!fileService) {
    if (uri.toString(true) == "file:///${command:sftp.sync.remoteToLocal}") {
      throw '';
    } else {
      throw new Error(`Configuração não encontrada. (${uri.toString(true)})`);
    }
  }
  const config = fileService.getConfig();
  const target = UResource.from(uri, {
    localBasePath: fileService.baseDir,
    remoteBasePath: config.remotePath,
    remoteId: fileService.id,
    remote: {
      host: config.host,
      port: config.port,
    },
  });

  return {
    fileService,
    config,
    target,
  };
}

export function allHandleCtxFromUri(uri: Uri): Array<FileHandlerContext> {
  const fileService = getFileService(uri);
  if (!fileService) {
    if (uri.toString(true) == "file:///${command:sftp.sync.remoteToLocal}") {
      throw '';
    } else {
      throw new Error(`Configuração não encontrada. (${uri.toString(true)})`);
    }
  }

  const configArr = fileService.getAllConfig();

  return configArr.map(config => {
    const target = UResource.from(uri, {
      localBasePath: fileService.baseDir,
      remoteBasePath: config.remotePath,
      remoteId: fileService.id,
      remote: {
        host: config.host,
        port: config.port,
      },
    });

    return {
      fileService,
      config,
      target,
    };
  })
}

export default function createFileHandler<T>(
  handlerOption: FileHandlerOption<T>
): (ctx: FileHandlerContext | Uri, option?: Partial<T>) => Promise<void> {
  async function fileHandle(ctx: Uri | FileHandlerContext, option?: T) {
    const handleCtx = ctx instanceof Uri ? handleCtxFromUri(ctx) : ctx;
    const { target } = handleCtx;

    const invokeOption = handlerOption.transformOption
      ? handlerOption.transformOption.call(handleCtx)
      : {};
    if (option) {
      Object.assign(invokeOption, option);
    }

    if (invokeOption.ignore && invokeOption.ignore(target.localFsPath)) {
      return;
    }

    logger.trace(`handle ${handlerOption.name} for`, target.localFsPath);

    app.sftpBarItem.startSpinner();
    try {
      // Retry on transient failures. The handler re-resolves the remote file
      // system on every attempt, so a dropped connection — and the "Client is
      // closed" errors every queued file gets after it — reconnects instead of
      // failing the file. Permanent errors (auth, missing file, cancellation)
      // are rethrown on the first attempt.
      for (let attempt = 1; ; attempt++) {
        try {
          await handlerOption.handle.call(handleCtx, invokeOption);
          break;
        } catch (error) {
          if (attempt >= MAX_ATTEMPTS || !isTransientError(error)) {
            throw error;
          }

          logger.warn(
            `${handlerOption.name} ${target.localFsPath} falhou ` +
              `(tentativa ${attempt}/${MAX_ATTEMPTS}): ${error && error.message}. Tentando novamente…`
          );
          await delay(RETRY_BASE_DELAY_MS * attempt);
        }
      }
    } finally {
      app.sftpBarItem.stopSpinner();
    }
    if (handlerOption.afterHandle) {
      handlerOption.afterHandle.call(handleCtx);
    }
  }

  return fileHandle;
}
