import { VercelEnvironmentProvider } from '../vercel';
import * as fs from 'fs';
import * as child_process from 'child_process';

jest.mock('fs');
jest.mock('child_process');

const mockOptions = { installDir: '/tmp/project' };

describe('VercelEnvironmentProvider', () => {
  let provider: VercelEnvironmentProvider;

  beforeEach(() => {
    provider = new VercelEnvironmentProvider(mockOptions as any);
    jest.clearAllMocks();
  });

  it('should detect Vercel CLI, project link, and authentication', async () => {
    (child_process.execSync as jest.Mock).mockReturnValue(undefined);
    (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
      if (p.endsWith('.vercel')) return true;
      if (p.endsWith('project.json')) return true;
      return false;
    });
    (child_process.spawnSync as jest.Mock).mockReturnValue({
      stdout: 'testuser',
      stderr: '',
      status: 0,
    });

    await expect(provider.detect()).resolves.toBe(true);
  });

  it('should return false if Vercel CLI is missing', async () => {
    (child_process.execSync as jest.Mock).mockImplementation(() => {
      throw new Error();
    });
    await expect(provider.detect()).resolves.toBe(false);
  });

  it('should return false if project is not linked', async () => {
    (child_process.execSync as jest.Mock).mockReturnValue(undefined);
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    await expect(provider.detect()).resolves.toBe(false);
  });

  it('should return false if not authenticated', async () => {
    (child_process.execSync as jest.Mock).mockReturnValue(undefined);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (child_process.spawnSync as jest.Mock).mockReturnValue({
      stdout: 'Log in to Vercel',
      stderr: '',
      status: 0,
    });
    await expect(provider.detect()).resolves.toBe(false);
  });

  it('should upload environment variables', async () => {
    const spawnMock = child_process.spawn as jest.Mock;
    const onMock = jest.fn((event, cb) => event === 'close' && cb(0));
    const stdinMock = { write: jest.fn(), end: jest.fn() };
    spawnMock.mockReturnValue({ stdin: stdinMock, on: onMock });

    await provider.uploadEnvVars({ FOO: 'bar' });

    expect(spawnMock).toHaveBeenCalledWith(
      'vercel',
      ['env', 'add', 'FOO', 'production', '--force'],
      expect.objectContaining({ stdio: ['pipe', 'inherit', 'inherit'] }),
    );
    expect(stdinMock.write).toHaveBeenCalledWith('bar\n');
    expect(stdinMock.end).toHaveBeenCalled();
  });
});
