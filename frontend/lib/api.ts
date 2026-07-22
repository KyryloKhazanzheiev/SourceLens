import {
  createConversationApiV1ConversationsPost,
  createMessageApiV1ConversationsConversationIdMessagesPost,
  deleteDocumentApiV1DocumentsDocumentIdDelete,
  listDocumentsApiV1DocumentsGet,
  uploadDocumentApiV1DocumentsPost,
  type Citation,
  type Document as DocumentRecord,
  type DocumentStatus,
  type Message as MessageRecord,
} from "@/api/generated";
import { client } from "@/api/generated/client.gen";

export type { Citation, DocumentRecord, DocumentStatus, MessageRecord };

client.setConfig({
  baseUrl: process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8000",
});

const checked = { throwOnError: true } as const;

export const api = {
  listDocuments: async () => (await listDocumentsApiV1DocumentsGet(checked)).data,
  uploadDocument: async (file: File) =>
    (await uploadDocumentApiV1DocumentsPost({ ...checked, body: { file } })).data,
  deleteDocument: async (id: string) =>
    (
      await deleteDocumentApiV1DocumentsDocumentIdDelete({
        ...checked,
        path: { document_id: id },
      })
    ).data,
  createConversation: async (documentIds: string[]) =>
    (
      await createConversationApiV1ConversationsPost({
        ...checked,
        body: { document_ids: documentIds },
      })
    ).data,
  sendMessage: async (conversationId: string, content: string) =>
    (
      await createMessageApiV1ConversationsConversationIdMessagesPost({
        ...checked,
        path: { conversation_id: conversationId },
        body: { content },
      })
    ).data,
};
