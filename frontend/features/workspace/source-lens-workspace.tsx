"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  BookOpenText,
  Check,
  ChevronRight,
  CircleAlert,
  FileText,
  LoaderCircle,
  PanelRightClose,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { api, type Citation, type DocumentRecord, type MessageRecord } from "@/lib/api";
import { cn } from "@/lib/utils";

const suggestions = [
  "Summarise the main obligations in these documents.",
  "What deadlines or dates should I know about?",
  "Where do the documents disagree or leave ambiguity?",
];

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function StatusDot({ status }: { status: DocumentRecord["status"] }) {
  if (status === "ready") return <span className="size-2 rounded-full bg-emerald-500" />;
  if (status === "failed") return <span className="size-2 rounded-full bg-rose-500" />;
  return <span className="size-2 animate-pulse rounded-full bg-amber-400" />;
}

function SourceCard({ citation, index }: { citation: Citation; index: number }) {
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-xs font-bold text-violet-700">
            {index}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">{citation.filename}</p>
            <p className="text-xs text-slate-500">Page {citation.page_number}</p>
          </div>
        </div>
        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
          {Math.round(citation.relevance * 100)}%
        </span>
      </div>
      <p className="line-clamp-6 text-[13px] leading-5 text-slate-600">{citation.excerpt}</p>
    </article>
  );
}

export function SourceLensWorkspace() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [question, setQuestion] = useState("");
  const [activeCitations, setActiveCitations] = useState<Citation[]>([]);
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const [notice, setNotice] = useState<string>();

  const documents = useQuery({
    queryKey: ["documents"],
    queryFn: api.listDocuments,
  });

  const upload = useMutation({
    mutationFn: api.uploadDocument,
    onSuccess: (document) => {
      setSelectedIds((current) => [...new Set([...current, document.id])]);
      setNotice(undefined);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error) => setNotice(error.message),
  });

  const remove = useMutation({
    mutationFn: api.deleteDocument,
    onSuccess: (_, id) => {
      setSelectedIds((current) => current.filter((item) => item !== id));
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error) => setNotice(error.message),
  });

  const send = useMutation({
    mutationFn: async (content: string) => {
      let id = conversationId;
      if (!id) {
        const conversation = await api.createConversation(selectedIds);
        id = conversation.id;
        setConversationId(id);
      }
      return api.sendMessage(id, content);
    },
    onSuccess: (message) => {
      setMessages((current) => [...current, message]);
      setActiveCitations(message.citations ?? []);
      setEvidenceOpen(true);
      setNotice(undefined);
    },
    onError: (error) => setNotice(error.message),
  });

  function toggleDocument(id: string) {
    if (conversationId) return;
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function submit(content = question) {
    const trimmed = content.trim();
    if (!trimmed || !selectedIds.length || send.isPending) return;
    setMessages((current) => [
      ...current,
      {
        id: `optimistic-${Date.now()}`,
        conversation_id: conversationId ?? "pending",
        role: "user",
        content: trimmed,
        citations: [],
        created_at: new Date().toISOString(),
      },
    ]);
    setQuestion("");
    send.mutate(trimmed);
  }

  return (
    <main className="min-h-screen p-3 md:p-5">
      <div className="glass-panel mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-[1680px] overflow-hidden rounded-[28px] lg:grid-cols-[292px_minmax(0,1fr)] xl:grid-cols-[292px_minmax(0,1fr)_336px]">
        <aside className="flex min-h-[720px] flex-col border-b border-slate-200/70 bg-white/45 p-5 lg:border-r lg:border-b-0">
          <div className="flex items-center gap-3 px-1">
            <div className="relative flex size-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-violet-200">
              <BookOpenText className="size-5" />
              <span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-white bg-violet-500" />
            </div>
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-lg font-extrabold tracking-tight text-slate-950">
                SourceLens
              </h1>
              <p className="text-[11px] font-medium text-slate-500">Grounded. Cited. Clear.</p>
            </div>
          </div>

          <button
            className="mt-7 flex h-28 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-violet-300 bg-violet-50/70 text-violet-700 transition hover:border-violet-500 hover:bg-violet-100/70 disabled:opacity-60"
            disabled={upload.isPending}
            onClick={() => fileInput.current?.click()}
          >
            {upload.isPending ? (
              <LoaderCircle className="mb-2 size-6 animate-spin" />
            ) : (
              <UploadCloud className="mb-2 size-6" />
            )}
            <span className="text-sm font-bold">{upload.isPending ? "Indexing…" : "Add a document"}</span>
            <span className="mt-1 text-[11px] text-violet-500">PDF or TXT · max 20 MB</span>
          </button>
          <input
            ref={fileInput}
            className="hidden"
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload.mutate(file);
              event.target.value = "";
            }}
          />

          <div className="mt-7 flex items-center justify-between px-1">
            <p className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-400">Library</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
              {documents.data?.length ?? 0}
            </span>
          </div>

          <div className="scrollbar-subtle mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
            {documents.isLoading && (
              <div className="space-y-2">
                {[1, 2].map((item) => (
                  <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            )}
            {!documents.isLoading && !documents.data?.length && (
              <div className="rounded-2xl border border-slate-200/70 bg-white/60 p-4 text-center">
                <FileText className="mx-auto size-5 text-slate-300" />
                <p className="mt-2 text-xs leading-5 text-slate-500">Your indexed documents will appear here.</p>
              </div>
            )}
            {documents.data?.map((document) => {
              const selected = selectedIds.includes(document.id);
              return (
                <div
                  key={document.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-xl border p-2 transition",
                    selected
                      ? "border-violet-200 bg-white shadow-sm"
                      : "border-transparent hover:bg-white/70",
                  )}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
                    disabled={document.status !== "ready" || Boolean(conversationId)}
                    onClick={() => toggleDocument(document.id)}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg",
                        selected ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-500",
                      )}
                    >
                      {selected ? <Check className="size-4" /> : <FileText className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-700">{document.filename}</span>
                      <span className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                        <StatusDot status={document.status} />
                        {document.status === "ready"
                          ? `${document.page_count} pages · ${formatBytes(document.size_bytes)}`
                          : document.status}
                      </span>
                    </span>
                  </button>
                  <button
                    aria-label={`Delete ${document.filename}`}
                    className="rounded-lg p-1.5 text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
                    onClick={() => remove.mutate(document.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
              <ShieldCheck className="size-4" /> Answers stay grounded
            </div>
            <p className="mt-1.5 text-[11px] leading-4 text-emerald-700/75">
              Every answer is checked against the selected sources.
            </p>
          </div>
        </aside>

        <section className="flex min-h-[720px] min-w-0 flex-col bg-white/55">
          <header className="flex h-[76px] items-center justify-between border-b border-slate-200/70 px-5 md:px-8">
            <div>
              <p className="font-[family-name:var(--font-display)] text-sm font-bold text-slate-900">
                Document workspace
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {selectedIds.length
                  ? `${selectedIds.length} source${selectedIds.length === 1 ? "" : "s"} selected`
                  : "Select a ready document to begin"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 sm:flex">
                <span className="size-1.5 rounded-full bg-emerald-500" /> Grounded mode
              </span>
              <Button
                className="xl:hidden"
                size="icon"
                variant="ghost"
                onClick={() => setEvidenceOpen((value) => !value)}
              >
                <Search className="size-4" />
              </Button>
            </div>
          </header>

          <div className="scrollbar-subtle flex-1 overflow-y-auto px-5 py-8 md:px-10">
            {!messages.length ? (
              <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center py-10 text-center">
                <div className="relative">
                  <div className="absolute inset-0 animate-breathe rounded-full bg-violet-300 blur-2xl" />
                  <div className="relative flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-xl shadow-violet-200">
                    <Sparkles className="size-7" />
                  </div>
                </div>
                <h2 className="mt-6 max-w-xl font-[family-name:var(--font-display)] text-3xl font-extrabold leading-tight tracking-[-.035em] text-slate-950 md:text-4xl">
                  Ask your documents.
                  <br />
                  <span className="bg-gradient-to-r from-violet-600 to-cyan-600 bg-clip-text text-transparent">
                    Verify every answer.
                  </span>
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-6 text-slate-500">
                  SourceLens retrieves the strongest evidence first, then answers only from what your documents actually say.
                </p>
                <div className="mt-8 grid w-full gap-3 md:grid-cols-3">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      className="group flex min-h-24 flex-col justify-between rounded-2xl border border-slate-200 bg-white/75 p-4 text-left shadow-sm transition hover:-translate-y-1 hover:border-violet-200 hover:shadow-md disabled:pointer-events-none disabled:opacity-45"
                      disabled={!selectedIds.length}
                      onClick={() => submit(suggestion)}
                    >
                      <span className="text-xs font-medium leading-5 text-slate-600">{suggestion}</span>
                      <ChevronRight className="mt-3 size-4 text-slate-300 transition group-hover:translate-x-1 group-hover:text-violet-500" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-7 pb-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                  >
                    {message.role === "user" ? (
                      <div className="max-w-[82%] rounded-[22px_22px_6px_22px] bg-slate-900 px-5 py-3.5 text-sm leading-6 text-white shadow-lg shadow-slate-200">
                        {message.content}
                      </div>
                    ) : (
                      <div className="flex max-w-[92%] gap-3">
                        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                          <Sparkles className="size-4" />
                        </div>
                        <div>
                          <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{message.content}</p>
                          {!!message.citations?.length && (
                            <button
                              className="mt-3 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-bold text-violet-700"
                              onClick={() => {
                                setActiveCitations(message.citations ?? []);
                                setEvidenceOpen(true);
                              }}
                            >
                              <BookOpenText className="size-3.5" /> {message.citations.length} cited source{message.citations.length === 1 ? "" : "s"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {send.isPending && (
                  <div className="flex items-center gap-3 text-xs font-medium text-slate-400">
                    <div className="flex size-8 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                      <LoaderCircle className="size-4 animate-spin" />
                    </div>
                    Retrieving evidence and checking the answer…
                  </div>
                )}
              </div>
            )}
          </div>

          <footer className="border-t border-slate-200/60 bg-white/55 p-4 md:px-8 md:py-5">
            {notice && (
              <div className="mx-auto mb-3 flex max-w-3xl items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span className="flex-1">{notice}</span>
                <button onClick={() => setNotice(undefined)}><X className="size-3.5" /></button>
              </div>
            )}
            <form
              className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_16px_50px_rgba(31,41,78,.10)] focus-within:border-violet-300 focus-within:ring-4 focus-within:ring-violet-100"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <textarea
                className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                disabled={!selectedIds.length || send.isPending}
                placeholder={selectedIds.length ? "Ask a question about the selected sources…" : "Select a ready document first"}
                rows={1}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
              <Button aria-label="Send question" disabled={!question.trim() || !selectedIds.length || send.isPending} size="icon" type="submit">
                <ArrowUp className="size-4" />
              </Button>
            </form>
            <p className="mt-2 text-center text-[10px] text-slate-400">Answers can be incomplete. Use the cited excerpts to verify important details.</p>
          </footer>
        </section>

        <aside
          className={cn(
            "scrollbar-subtle border-l border-slate-200/70 bg-white/45 p-5 xl:block xl:overflow-y-auto",
            evidenceOpen ? "block" : "hidden",
            "max-xl:absolute max-xl:inset-y-3 max-xl:right-3 max-xl:z-20 max-xl:w-[min(360px,calc(100vw-1.5rem))] max-xl:rounded-r-[28px] max-xl:shadow-2xl",
          )}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-sm font-extrabold text-slate-900">Evidence</h2>
              <p className="mt-1 text-[11px] text-slate-500">The passages behind the answer</p>
            </div>
            <Button className="xl:hidden" size="icon" variant="ghost" onClick={() => setEvidenceOpen(false)}>
              <PanelRightClose className="size-4" />
            </Button>
          </div>
          <div className="mt-5 space-y-3">
            {activeCitations.length ? (
              activeCitations.map((citation, index) => (
                <SourceCard key={citation.chunk_id} citation={citation} index={index + 1} />
              ))
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 p-6 text-center">
                <Search className="size-7 text-slate-300" />
                <p className="mt-4 text-sm font-bold text-slate-700">Evidence appears here</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">Ask a question and SourceLens will show the exact passages used.</p>
              </div>
            )}
          </div>
          <div className="mt-5 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4">
            <p className="flex items-center gap-2 text-[11px] font-bold text-slate-700"><ShieldCheck className="size-3.5 text-emerald-600" /> How grounding works</p>
            <ol className="mt-3 space-y-2 text-[11px] leading-4 text-slate-500">
              <li><strong className="text-slate-700">1.</strong> Retrieve relevant passages</li>
              <li><strong className="text-slate-700">2.</strong> Answer only from those passages</li>
              <li><strong className="text-slate-700">3.</strong> Validate every cited source ID</li>
            </ol>
          </div>
        </aside>
      </div>
    </main>
  );
}
