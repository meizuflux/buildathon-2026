import { z } from 'zod';
import { messageInputSchema, messageSchema } from '../../types/models';
import { endpoints } from './endpoints';
import { ApiError, type makeHttpClient } from './http';
export function createMessagesApi(http: ReturnType<typeof makeHttpClient>) {
  return {
    getMessages: () => http(endpoints.messages, z.array(messageSchema)),
    sendMessage: async (input: z.input<typeof messageInputSchema>) => {
      const body = messageInputSchema.parse(input);
      const accepted = await http(endpoints.messages, messageSchema, { method: 'POST', body, idempotencyKey: body.idempotencyKey });
      if (accepted.sender !== 'household' || accepted.idempotencyKey !== body.idempotencyKey || accepted.body !== body.body) throw new ApiError('The service did not confirm this message. Retry to check its status.');
      return accepted;
    },
  };
}
