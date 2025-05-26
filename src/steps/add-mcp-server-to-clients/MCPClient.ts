export abstract class MCPClient {
  name: string;
  abstract isClientInstalled(): Promise<boolean>;
  abstract isServerInstalled(): Promise<boolean>;
  abstract addServer(apiKey: string): Promise<void>;
  abstract removeServer(): Promise<void>;
}
