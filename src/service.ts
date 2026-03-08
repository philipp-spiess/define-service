import {
  type ResolvedServiceOptions,
  type ServiceBackend,
  type ServiceOptions,
  type ServiceStatus,
  normalizeServiceOptions,
} from "./internal";
import { LinuxBackend } from "./linux";
import { MacOSBackend } from "./macos";
import { WindowsBackend } from "./windows";

export interface DefinedService {
  readonly name: string;
  readonly options: Readonly<ResolvedServiceOptions>;
  register(): Promise<DefinedService>;
  unregister(): Promise<DefinedService>;
  start(): Promise<DefinedService>;
  stop(): Promise<DefinedService>;
  restart(): Promise<DefinedService>;
  status(): Promise<ServiceStatus>;
}

export function defineService(options: ServiceOptions): DefinedService {
  const normalized = normalizeServiceOptions(options);
  const backend = getBackend();

  const service: DefinedService = {
    name: normalized.name,
    options: normalized,
    async register() {
      await backend.register(normalized);
      return service;
    },
    async unregister() {
      await backend.unregister(normalized);
      return service;
    },
    async start() {
      await backend.start(normalized);
      return service;
    },
    async stop() {
      await backend.stop(normalized);
      return service;
    },
    async restart() {
      await backend.restart(normalized);
      return service;
    },
    async status() {
      return await backend.status(normalized);
    },
  };

  return service;
}

function getBackend(): ServiceBackend {
  switch (process.platform) {
    case "darwin":
      return new MacOSBackend();
    case "linux":
      return new LinuxBackend();
    case "win32":
      return new WindowsBackend();
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}
