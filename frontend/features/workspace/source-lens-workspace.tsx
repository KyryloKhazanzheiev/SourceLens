"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  Check,
  CircleAlert,
  FileText,
  LoaderCircle,
  Menu,
  MessageSquare,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  api,
  type Citation,
  type ConversationDetail,
  type DocumentRecord,
  type MessageRecord,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const starterQuestions = [
  "Summarise the main obligations in these documents.",
  "What deadlines, dates, and milestones are mentioned?",
  "Who is responsible for each key action?",
  "List the most important requirements as bullet points.",
  "What risks, constraints, or exceptions should I know about?",
];

const comparisonQuestion =
  "Compare these documents and highlight any differences or conflicts.";

type DeleteTarget =
  | { kind: "conversation"; id: string; name: string }
  | { kind: "document"; id: string; name: string };

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 grid-cols-2 overflow-hidden rounded-[9px]",
        className,
      )}
    >
      <span className="bg-[#08BDB8]" />
      <span className="bg-[#FFCF36]" />
      <span className="bg-white" />
      <span className="bg-[#FF7F1F]" />
    </span>
  );
}

function BrandIdentity({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <BrandMark className={compact ? "size-7 rounded-lg" : "size-8 rounded-[9px]"} />
      <div className="min-w-0">
        <h1 className="truncate font-[family-name:var(--font-display)] text-sm font-extrabold tracking-[-.02em]">
          SourceLens
        </h1>
        <p className="mt-0.5 truncate text-[9px] text-neutral-500">
          by Kyrylo Khazanzheiev
        </p>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: DocumentRecord["status"] }) {
  if (status === "ready") return <span className="size-1.5 rounded-full bg-[#08BDB8]" />;
  if (status === "failed") return <span className="size-1.5 rounded-full bg-red-500" />;
  return <span className="size-1.5 animate-pulse rounded-full bg-[#FFCF36]" />;
}

function EvidenceCard({ citation }: { citation: Citation }) {
  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-neutral-900 dark:text-neutral-100">
            {citation.filename}
          </p>
          <p className="mt-1 text-[10px] text-neutral-500">Page {citation.page_number}</p>
        </div>
        <span className="rounded-full bg-[#08BDB8]/10 px-2 py-1 text-[9px] font-bold text-[#007d78] dark:text-[#5ce1dc]">
          {Math.round(citation.relevance * 100)}%
        </span>
      </div>
      <p className="mt-4 text-[12px] leading-5 text-neutral-600 dark:text-neutral-400">
        {citation.excerpt}
      </p>
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
  const [panelView, setPanelView] = useState<"sources" | "evidence">("sources");
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [notice, setNotice] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>();

  const documents = useQuery({
    queryKey: ["documents"],
    queryFn: api.listDocuments,
  });

  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: api.listConversations,
  });

  const openConversation = useMutation({
    mutationFn: api.getConversation,
    onSuccess: (conversation: ConversationDetail) => {
      const loadedMessages = conversation.messages ?? [];
      const latestCitedAnswer = [...loadedMessages]
        .reverse()
        .find((message) => message.role === "assistant" && message.citations?.length);

      setConversationId(conversation.id);
      setSelectedIds(conversation.document_ids);
      setMessages(loadedMessages);
      setActiveCitations(latestCitedAnswer?.citations ?? []);
      setPanelView("sources");
      setChatDrawerOpen(false);
      setContextOpen(false);
      setNotice(undefined);
    },
    onError: (error) => setNotice(error.message),
  });

  const removeConversation = useMutation({
    mutationFn: api.deleteConversation,
    onSuccess: (_, id) => {
      if (conversationId === id) {
        startNewChat();
      }
      setDeleteTarget(undefined);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (error) => {
      setDeleteTarget(undefined);
      setNotice(error.message);
    },
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
      setDeleteTarget(undefined);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error) => {
      setDeleteTarget(undefined);
      setNotice(error.message);
    },
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
      if (message.citations?.length) {
        setPanelView("evidence");
      }
      setNotice(undefined);
    },
    onError: (error) => setNotice(error.message),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const activeConversation = conversations.data?.find(
    (conversation) => conversation.id === conversationId,
  );
  const visibleDocuments = conversationId
    ? documents.data?.filter((document) => selectedIds.includes(document.id))
    : documents.data;
  const currentTitle =
    activeConversation?.title ??
    messages.find((message) => message.role === "user")?.content ??
    "New chat";
  const suggestions =
    selectedIds.length > 1
      ? [...starterQuestions, comparisonQuestion]
      : starterQuestions;

  useEffect(() => {
    if (!contextOpen && !chatDrawerOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setChatDrawerOpen(false);
      setContextOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [chatDrawerOpen, contextOpen]);

  function startNewChat() {
    setConversationId(undefined);
    setSelectedIds([]);
    setMessages([]);
    setQuestion("");
    setActiveCitations([]);
    setPanelView("sources");
    setChatDrawerOpen(false);
    setContextOpen(false);
    setNotice(undefined);
  }

  function toggleDocument(id: string) {
    if (conversationId) return;
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "conversation") {
      removeConversation.mutate(deleteTarget.id);
    } else {
      remove.mutate(deleteTarget.id);
    }
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
    <main
      className={cn(
        "h-dvh overflow-hidden bg-[#efefed] text-neutral-950 transition-colors md:min-h-[680px] md:p-3",
        darkMode && "dark bg-[#090909] text-neutral-50",
      )}
    >
      <div className="relative mx-auto grid h-full max-w-[1800px] overflow-hidden border border-neutral-200 bg-white shadow-[0_20px_60px_rgba(0,0,0,.08)] md:rounded-[22px] lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[248px_minmax(0,1fr)_320px] dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-[0_24px_80px_rgba(0,0,0,.38)]">
        <aside className="hidden min-h-0 flex-col border-r border-neutral-200 bg-[#f7f7f5] p-3 lg:flex dark:border-neutral-800 dark:bg-[#111111]">
          <div className="flex items-center justify-between px-1 py-1">
            <BrandIdentity compact />
            <button
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
              className="flex size-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-200 hover:text-black dark:hover:bg-neutral-900 dark:hover:text-white"
              onClick={() => setDarkMode((value) => !value)}
              type="button"
            >
              {darkMode ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </button>
          </div>

          <button
            className="mt-3 flex h-10 w-full items-center gap-2 rounded-xl bg-neutral-950 px-3 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
            disabled={send.isPending || openConversation.isPending}
            onClick={startNewChat}
            type="button"
          >
            <Plus className="size-3.5" />
            New chat
          </button>

          <div className="mt-5 flex items-center justify-between px-2">
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-neutral-500">
              Chats
            </p>
            <span className="text-[10px] text-neutral-500">
              {conversations.data?.length ?? 0}
            </span>
          </div>

          <div className="scrollbar-subtle mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
            {conversations.isLoading &&
              [1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-10 animate-pulse rounded-lg bg-neutral-200/70 dark:bg-neutral-900"
                />
              ))}
            {conversations.isError && (
              <div className="px-2 py-4 text-[11px] leading-5 text-neutral-500">
                <p>Couldn&apos;t load chats.</p>
                <button
                  className="mt-1 font-semibold text-neutral-800 hover:underline dark:text-neutral-200"
                  onClick={() => conversations.refetch()}
                  type="button"
                >
                  Try again
                </button>
              </div>
            )}
            {!conversations.isLoading &&
              !conversations.isError &&
              !conversations.data?.length && (
              <p className="px-2 py-4 text-[11px] leading-5 text-neutral-500">
                Your conversations will appear here.
              </p>
              )}
            {conversations.data?.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  "group flex w-full items-center rounded-lg transition",
                  conversation.id === conversationId
                    ? "bg-neutral-200/80 text-black dark:bg-neutral-800 dark:text-white"
                    : "text-neutral-600 hover:bg-neutral-200/60 hover:text-black dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white",
                )}
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2.5 text-left"
                  disabled={
                    openConversation.isPending ||
                    send.isPending ||
                    removeConversation.isPending
                  }
                  onClick={() => openConversation.mutate(conversation.id)}
                  type="button"
                >
                  {openConversation.isPending &&
                  openConversation.variables === conversation.id ? (
                    <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
                  ) : (
                    <MessageSquare className="size-3.5 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                    {conversation.title}
                  </span>
                </button>
                <button
                  aria-label={`Delete ${conversation.title}`}
                  className="mr-1.5 rounded-md p-1.5 text-neutral-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  disabled={removeConversation.isPending || send.isPending}
                  onClick={() =>
                    setDeleteTarget({
                      kind: "conversation",
                      id: conversation.id,
                      name: conversation.title,
                    })
                  }
                  title="Delete conversation"
                  type="button"
                >
                  {removeConversation.isPending &&
                  removeConversation.variables === conversation.id ? (
                    <LoaderCircle className="size-3 animate-spin" />
                  ) : (
                    <Trash2 className="size-3" />
                  )}
                </button>
              </div>
            ))}
          </div>

          <p className="mt-3 hidden px-2 py-1 text-[9px] leading-4 text-neutral-500 lg:block">
            Answers are limited to the sources selected for each chat.
          </p>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col bg-white dark:bg-neutral-950">
          <header className="relative z-40 flex h-16 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 lg:hidden dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex min-w-0 items-center gap-2">
              <Button
                aria-label="Open chat history"
                className="size-10 shrink-0 rounded-xl"
                size="icon"
                variant="ghost"
                onClick={() => {
                  setContextOpen(false);
                  setChatDrawerOpen(true);
                }}
              >
                <Menu className="size-4" />
              </Button>
              <BrandIdentity compact />
            </div>
            <div className="flex items-center gap-1">
              <button
                aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
                className="flex size-10 items-center justify-center rounded-xl text-neutral-500 transition hover:bg-neutral-100 hover:text-black dark:hover:bg-neutral-900 dark:hover:text-white"
                onClick={() => setDarkMode((value) => !value)}
                type="button"
              >
                {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
              <Button
                aria-label={contextOpen ? "Hide documents and evidence" : "Show documents and evidence"}
                aria-pressed={contextOpen}
                className={cn(
                  "relative size-10 rounded-xl",
                  contextOpen &&
                    "bg-neutral-100 text-neutral-950 dark:bg-neutral-900 dark:text-white",
                )}
                size="icon"
                variant="ghost"
                onClick={() => {
                  setChatDrawerOpen(false);
                  setContextOpen((value) => !value);
                }}
              >
                <FileText className="size-4" />
                {!contextOpen && activeCitations.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[#08BDB8]" />
                )}
              </Button>
            </div>
          </header>

          <header className="hidden h-14 shrink-0 items-center justify-between border-b border-neutral-200 px-4 md:px-6 lg:flex dark:border-neutral-800">
            <div className="min-w-0">
              <p className="max-w-[48vw] truncate text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                {currentTitle}
              </p>
              <p className="mt-0.5 text-[9px] text-neutral-500">
                {selectedIds.length
                  ? `${selectedIds.length} source${selectedIds.length === 1 ? "" : "s"}`
                  : "No sources selected"}
              </p>
            </div>
            <Button
              aria-label={contextOpen ? "Hide context" : "Show context"}
              className="xl:hidden"
              size="icon"
              variant="ghost"
              onClick={() => setContextOpen((value) => !value)}
            >
              {contextOpen ? (
                <PanelRightClose className="size-4" />
              ) : (
                <PanelRightOpen className="size-4" />
              )}
            </Button>
          </header>

          <div className="scrollbar-subtle flex-1 overflow-y-auto px-4 py-6 md:px-8">
            {!messages.length ? (
              <div className="mx-auto flex min-h-full max-w-[680px] flex-col items-center justify-center py-8 text-center">
                <BrandMark className="size-10 rounded-xl" />
                <h2 className="mt-5 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-[-.045em] md:text-4xl">
                  Ask your documents
                </h2>
                <p className="mt-3 max-w-md text-sm leading-6 text-neutral-500">
                  {selectedIds.length
                    ? "Ask a question and SourceLens will answer with verifiable citations."
                    : "Choose one or more documents to begin."}
                </p>

                {!selectedIds.length && (
                  <Button
                    className="mt-6"
                    onClick={() => {
                      setPanelView("sources");
                      setContextOpen(true);
                    }}
                    type="button"
                  >
                    Choose documents
                  </Button>
                )}

                {!!selectedIds.length && (
                  <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        className="min-h-14 rounded-xl border border-neutral-200 px-4 py-3 text-left text-[11px] font-medium leading-5 text-neutral-600 transition hover:border-neutral-400 hover:bg-neutral-50 hover:text-black dark:border-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-900 dark:hover:text-white"
                        onClick={() => submit(suggestion)}
                        type="button"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="mx-auto max-w-[720px] space-y-8 pb-6 pt-2">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                  >
                    {message.role === "user" ? (
                      <div className="max-w-[84%] rounded-[18px_18px_5px_18px] bg-neutral-100 px-4 py-3 text-[13px] leading-6 text-neutral-900 dark:bg-neutral-800 dark:text-white">
                        {message.content}
                      </div>
                    ) : (
                      <div className="flex max-w-[94%] gap-3">
                        <BrandMark className="mt-1 size-6 rounded-md" />
                        <div className="min-w-0">
                          <p className="whitespace-pre-wrap text-[13px] leading-7 text-neutral-700 dark:text-neutral-300">
                            {message.content}
                          </p>
                          {message.has_sufficient_evidence === false && (
                            <p className="mt-2 max-w-lg text-[10px] leading-4 text-neutral-500">
                              {message.abstention_reason === "no_relevant_passages"
                                ? "No matching passage cleared retrieval. Try using terms from the document or select another source."
                                : message.abstention_reason === "insufficient_support"
                                  ? "Related text was found, but it did not support the requested fact."
                                  : "The selected documents did not provide enough support for a reliable answer."}
                            </p>
                          )}
                          {!!message.citations?.length && (
                            <button
                              className="mt-3 text-[10px] font-semibold text-[#007d78] transition hover:underline dark:text-[#5ce1dc]"
                              onClick={() => {
                                setActiveCitations(message.citations ?? []);
                                setPanelView("evidence");
                                setContextOpen(true);
                              }}
                              type="button"
                            >
                              View {message.citations.length} cited source
                              {message.citations.length === 1 ? "" : "s"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {send.isPending && (
                  <div className="flex items-center gap-3 text-[11px] text-neutral-500">
                    <LoaderCircle className="size-4 animate-spin text-[#08BDB8]" />
                    Checking the selected sources…
                  </div>
                )}
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-neutral-200 bg-white p-3 md:px-6 md:py-4 dark:border-neutral-800 dark:bg-neutral-950">
            {notice && (
              <div className="mx-auto mb-3 flex max-w-[720px] items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span className="flex-1">{notice}</span>
                <button aria-label="Dismiss" onClick={() => setNotice(undefined)} type="button">
                  <X className="size-3.5" />
                </button>
              </div>
            )}
            <form
              className="mx-auto flex max-w-[720px] items-end gap-2 rounded-2xl border border-neutral-300 bg-white p-2 transition focus-within:border-neutral-950 dark:border-neutral-700 dark:bg-neutral-900 dark:focus-within:border-neutral-400"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <textarea
                aria-label="Ask a question"
                className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400 disabled:cursor-not-allowed dark:text-white dark:placeholder:text-neutral-600"
                disabled={!selectedIds.length || send.isPending || openConversation.isPending}
                placeholder={
                  selectedIds.length
                    ? "Ask a question about these sources"
                    : "Select sources to start"
                }
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
              <Button
                aria-label="Send question"
                disabled={!question.trim() || !selectedIds.length || send.isPending}
                size="icon"
                type="submit"
              >
                <ArrowUp className="size-4" />
              </Button>
            </form>
            <p className="mt-2 text-center text-[9px] text-neutral-500">
              Verify important details in the cited evidence.
            </p>
          </footer>
        </section>

        <button
          aria-label="Close chat history"
          className={cn(
            "absolute inset-0 z-[45] bg-black/55 backdrop-blur-[2px] transition-opacity duration-300 motion-reduce:transition-none lg:hidden",
            chatDrawerOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0",
          )}
          onClick={() => setChatDrawerOpen(false)}
          type="button"
        />

        <aside
          aria-hidden={!chatDrawerOpen}
          aria-label="Chat history"
          className={cn(
            "absolute inset-y-0 left-0 z-50 flex w-[min(340px,88vw)] flex-col border-r border-neutral-200 bg-[#f7f7f5] shadow-2xl transition-transform duration-300 ease-out will-change-transform motion-reduce:transition-none lg:hidden dark:border-neutral-800 dark:bg-[#111111]",
            chatDrawerOpen
              ? "translate-x-0"
              : "pointer-events-none -translate-x-[calc(100%+1rem)]",
          )}
          inert={!chatDrawerOpen}
        >
          <div className="flex h-16 shrink-0 items-center gap-2 border-b border-neutral-200 px-4 dark:border-neutral-800">
            <Button
              aria-label="Close chat history"
              className="size-10 shrink-0 rounded-xl"
              size="icon"
              variant="ghost"
              onClick={() => setChatDrawerOpen(false)}
            >
              <X className="size-4" />
            </Button>
            <BrandIdentity compact />
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-3">
            <button
              className="flex h-11 w-full shrink-0 items-center gap-2 rounded-xl bg-neutral-950 px-3 text-xs font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
              disabled={send.isPending || openConversation.isPending}
              onClick={startNewChat}
              type="button"
            >
              <Plus className="size-3.5" />
              New chat
            </button>

            <div className="mt-5 flex items-center justify-between px-2">
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-neutral-500">
                Chats
              </p>
              <span className="text-[10px] text-neutral-500">
                {conversations.data?.length ?? 0}
              </span>
            </div>

            <div className="scrollbar-subtle mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
              {conversations.isLoading &&
                [1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-11 animate-pulse rounded-xl bg-neutral-200/70 dark:bg-neutral-900"
                  />
                ))}
              {conversations.isError && (
                <div className="px-2 py-4 text-[11px] leading-5 text-neutral-500">
                  <p>Couldn&apos;t load chats.</p>
                  <button
                    className="mt-1 font-semibold text-neutral-800 hover:underline dark:text-neutral-200"
                    onClick={() => conversations.refetch()}
                    type="button"
                  >
                    Try again
                  </button>
                </div>
              )}
              {!conversations.isLoading &&
                !conversations.isError &&
                !conversations.data?.length && (
                  <p className="px-2 py-4 text-[11px] leading-5 text-neutral-500">
                    Your conversations will appear here.
                  </p>
                )}
              {conversations.data?.map((conversation) => (
                <div
                  key={conversation.id}
                  className={cn(
                    "group flex w-full items-center rounded-xl transition",
                    conversation.id === conversationId
                      ? "bg-neutral-200/80 text-black dark:bg-neutral-800 dark:text-white"
                      : "text-neutral-600 hover:bg-neutral-200/60 hover:text-black dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-white",
                  )}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-left"
                    disabled={
                      openConversation.isPending ||
                      send.isPending ||
                      removeConversation.isPending
                    }
                    onClick={() => openConversation.mutate(conversation.id)}
                    type="button"
                  >
                    {openConversation.isPending &&
                    openConversation.variables === conversation.id ? (
                      <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
                    ) : (
                      <MessageSquare className="size-3.5 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                      {conversation.title}
                    </span>
                  </button>
                  <button
                    aria-label={`Delete ${conversation.title}`}
                    className="mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                    disabled={removeConversation.isPending || send.isPending}
                    onClick={() =>
                      setDeleteTarget({
                        kind: "conversation",
                        id: conversation.id,
                        name: conversation.title,
                      })
                    }
                    type="button"
                  >
                    {removeConversation.isPending &&
                    removeConversation.variables === conversation.id ? (
                      <LoaderCircle className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                  </button>
                </div>
              ))}
            </div>

            <p className="mt-3 border-t border-neutral-200 px-2 pt-3 text-[9px] leading-4 text-neutral-500 dark:border-neutral-800">
              Every chat keeps its own document selection and message history.
            </p>
          </div>
        </aside>

        <button
          aria-label="Close documents and evidence"
          className={cn(
            "absolute right-0 bottom-0 left-0 z-20 bg-black/45 transition-opacity duration-300 motion-reduce:transition-none xl:hidden",
            "top-16 lg:top-14",
            contextOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0",
          )}
          onClick={() => setContextOpen(false)}
          type="button"
        />

        <aside
          className={cn(
            "scrollbar-subtle bg-[#f7f7f5] transition-[transform,opacity] duration-300 ease-out will-change-transform motion-reduce:transition-none xl:static xl:max-h-none xl:w-auto xl:translate-x-0 xl:overflow-y-auto xl:rounded-none xl:border-t-0 xl:opacity-100 xl:shadow-none dark:bg-[#111111]",
            "absolute inset-x-0 bottom-0 z-30 max-h-[82dvh] overflow-y-auto rounded-t-[24px] border-t border-neutral-200 shadow-[0_-20px_60px_rgba(0,0,0,.28)] lg:top-14 lg:right-0 lg:left-auto lg:max-h-none lg:w-[360px] lg:rounded-t-none lg:rounded-l-[20px] lg:border-t-0 lg:border-l lg:shadow-2xl dark:border-neutral-800",
            contextOpen
              ? "translate-y-0 opacity-100 lg:translate-x-0"
              : "pointer-events-none translate-y-[calc(100%+1rem)] opacity-0 lg:translate-x-[calc(100%+1rem)] lg:translate-y-0 xl:pointer-events-auto",
          )}
        >
          <div className="sticky top-0 z-10 border-b border-neutral-200 bg-[#f7f7f5] px-4 pt-2 lg:pt-4 dark:border-neutral-800 dark:bg-[#111111]">
            <span className="mx-auto block h-1 w-10 rounded-full bg-neutral-300 lg:hidden dark:bg-neutral-700" />
            <div className="mt-3 flex items-end justify-between lg:mt-0">
              <div>
                <p className="text-sm font-bold">Documents &amp; evidence</p>
                <p className="mt-1 text-[10px] text-neutral-500">
                  Control what this chat can use.
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 rounded-xl bg-neutral-200/70 p-1 dark:bg-neutral-900">
              <button
                className={cn(
                  "flex h-9 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#08BDB8]",
                  panelView === "sources"
                    ? "bg-white text-neutral-950 shadow-sm dark:bg-neutral-800 dark:text-white"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200",
                )}
                onClick={() => setPanelView("sources")}
                type="button"
              >
                <FileText className="size-3.5" />
                Documents <span className="text-neutral-500">{selectedIds.length}</span>
              </button>
              <button
                className={cn(
                  "flex h-9 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#08BDB8]",
                  panelView === "evidence"
                    ? "bg-white text-neutral-950 shadow-sm dark:bg-neutral-800 dark:text-white"
                    : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200",
                )}
                onClick={() => setPanelView("evidence")}
                type="button"
              >
                <Search className="size-3.5" />
                Evidence <span className="text-neutral-500">{activeCitations.length}</span>
              </button>
            </div>
          </div>

          <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {panelView === "sources" ? (
              <>
                {!conversationId && (
                  <button
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white text-[11px] font-semibold transition hover:border-[#08BDB8] dark:border-neutral-700 dark:bg-neutral-950 dark:hover:border-[#08BDB8]"
                    disabled={upload.isPending}
                    onClick={() => fileInput.current?.click()}
                    type="button"
                  >
                    {upload.isPending ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <Upload className="size-3.5" />
                    )}
                    {upload.isPending ? "Indexing…" : "Upload document"}
                  </button>
                )}
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

                <div className={cn("space-y-1.5", !conversationId && "mt-4")}>
                  {documents.isLoading &&
                    [1, 2].map((item) => (
                      <div
                        key={item}
                        className="h-14 animate-pulse rounded-xl bg-neutral-200/70 dark:bg-neutral-900"
                      />
                    ))}
                  {!documents.isLoading && !visibleDocuments?.length && (
                    <div className="py-12 text-center">
                      <FileText className="mx-auto size-5 text-neutral-400" />
                      <p className="mt-3 text-[11px] text-neutral-500">
                        {conversationId
                          ? "The source files are no longer available."
                          : "Upload a PDF or TXT file to begin."}
                      </p>
                    </div>
                  )}
                  {visibleDocuments?.map((document) => {
                    const selected = selectedIds.includes(document.id);
                    return (
                      <div
                        key={document.id}
                        className={cn(
                          "group flex items-center gap-2 rounded-xl border p-2 transition",
                          selected
                            ? "border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-950"
                            : "border-transparent hover:bg-white dark:hover:bg-neutral-950",
                        )}
                      >
                        <button
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default"
                          disabled={document.status !== "ready" || Boolean(conversationId)}
                          onClick={() => toggleDocument(document.id)}
                          type="button"
                        >
                          <span
                            className={cn(
                              "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                              selected
                                ? "border-[#08BDB8]/30 bg-[#08BDB8]/10 text-[#007d78] dark:text-[#5ce1dc]"
                                : "border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900",
                            )}
                          >
                            {selected ? (
                              <Check className="size-3.5" />
                            ) : (
                              <FileText className="size-3.5" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] font-semibold text-neutral-800 dark:text-neutral-200">
                              {document.filename}
                            </span>
                            <span className="mt-1 flex items-center gap-1.5 text-[9px] text-neutral-500">
                              <StatusDot status={document.status} />
                              {document.status === "ready"
                                ? `${document.page_count} pages · ${formatBytes(document.size_bytes)}`
                                : document.status}
                            </span>
                          </span>
                        </button>
                        {!conversationId && (
                          <button
                            aria-label={`Delete ${document.filename}`}
                            className="rounded-lg p-1.5 text-neutral-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                            disabled={remove.isPending}
                            onClick={() =>
                              setDeleteTarget({
                                kind: "document",
                                id: document.id,
                                name: document.filename,
                              })
                            }
                            type="button"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {conversationId && (
                  <p className="mt-4 text-[10px] leading-4 text-neutral-500">
                    Sources are fixed for this chat. Start a new chat to choose a different set.
                  </p>
                )}
                {!conversationId && !!documents.data?.length && (
                  <p className="mt-4 text-[10px] leading-4 text-neutral-500">
                    Select the files SourceLens should use for this chat.
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-3">
                {activeCitations.length ? (
                  activeCitations.map((citation) => (
                    <EvidenceCard key={citation.chunk_id} citation={citation} />
                  ))
                ) : (
                  <div className="py-12 text-center">
                    <Search className="mx-auto size-5 text-neutral-400" />
                    <p className="mt-3 text-[11px] leading-5 text-neutral-500">
                      Cited passages will appear after SourceLens answers a question.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
      <ConfirmDialog
        confirmLabel={
          deleteTarget?.kind === "document" ? "Delete document" : "Delete conversation"
        }
        description={
          deleteTarget?.kind === "document"
            ? `"${deleteTarget.name}" and its search index will be permanently removed. Existing chats that use it may no longer work.`
            : `"${deleteTarget?.name ?? ""}" and all of its messages will be permanently removed. Your documents will stay available.`
        }
        loading={removeConversation.isPending || remove.isPending}
        open={Boolean(deleteTarget)}
        title={deleteTarget?.kind === "document" ? "Delete document?" : "Delete conversation?"}
        onCancel={() => setDeleteTarget(undefined)}
        onConfirm={confirmDelete}
      />
    </main>
  );
}
