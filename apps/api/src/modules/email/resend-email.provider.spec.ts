import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../config/env.validation';

const send = vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null });
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send } })),
}));

import { ResendEmailProvider } from './resend-email.provider';

function makeProvider(): ResendEmailProvider {
  const config = {
    get: (key: string) => (key === 'RESEND_API_KEY' ? 're_test' : 'onboarding@resend.dev'),
  } as unknown as ConfigService<Env, true>;
  return new ResendEmailProvider(config);
}

describe('ResendEmailProvider', () => {
  it('escapa HTML em inviterName/companyName antes de montar o e-mail', async () => {
    const provider = makeProvider();
    await provider.sendInvite({
      to: 'vitima@example.com',
      companyName: 'Loja Legítima',
      inviterName: '</strong></p><a href="https://evil.example/phish">Clique aqui</a><p><strong>',
      role: 'admin',
      inviteUrl: 'https://app.pcaarb.com/aceitar-convite?id=1&token=abc',
    });

    const html = send.mock.calls.at(-1)?.[0].html as string;
    expect(html).not.toContain('<a href="https://evil.example/phish">');
    expect(html).toContain('&lt;a href=&quot;https://evil.example/phish&quot;&gt;');
  });
});
