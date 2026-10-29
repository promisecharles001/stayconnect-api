import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { VoiceModule } from './voice.module';
import { VoiceService } from './voice.service';
import { MessagesGateway } from '../messages/messages.gateway';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A dependency Nest cannot resolve is not a failing test — it is the whole API
 * refusing to start. The unit specs construct VoiceService by hand with mocks,
 * so they would pass even if VoiceModule never made the gateway available to
 * it. This builds the real module graph (only the database stubbed) to prove
 * the wiring that production will actually boot with.
 */
describe('VoiceModule wiring', () => {
  it('resolves VoiceService with the real MessagesGateway injected', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ jwt: { secret: 'test-secret' } })],
        }),
        VoiceModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    const voice = moduleRef.get(VoiceService);
    const gateway = moduleRef.get(MessagesGateway, { strict: false });

    expect(voice).toBeDefined();
    expect(gateway).toBeDefined();
    // Same instance: the call must ring over the gateway the sockets are
    // actually connected to, not a second copy with no clients.
    expect((voice as any).gateway).toBe(gateway);

    await moduleRef.close();
  });
});
